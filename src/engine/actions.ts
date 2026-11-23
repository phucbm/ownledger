import { parse as parseYaml } from "yaml";
import { checkFiles } from "./check.js";
import { flattenCategories } from "./categories.js";
import { isDate } from "./dates.js";
import { LEDGER_FILE_RE, loadLedger, parseJsonl, PATHS, type FileMap } from "./load.js";
import { applyChange, describeChange, yamlText, type Change } from "./write.js";
import { STATEMENTS_FILE, withBankAmounts } from "../modules/cards/terms.js";
import type { Account, CategoriesFile, CategoryNode, Issue, Line, Plan, Price, Transaction, TrailEntry } from "./types.js";

/**
 * Write actions: each builds a Change from a request, applies it in memory and checks the result.
 * Nothing is committed here; the caller previews, gets the owner's go, then commits.
 */
export interface Planned {
  change: Change;
  files: FileMap; // changed files only
  summary: string[];
  message: string; // commit message
  warnings: Issue[];
}

export class ActionError extends Error {}

function newId(prefix = "t_"): string {
  const b = new Uint8Array(7);
  crypto.getRandomValues(b);
  return prefix + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function plan(files: FileMap, change: Change, message: string): Planned {
  const out = applyChange(files, change);
  const r = checkFiles({ ...files, ...out });
  if (!r.ok) throw new ActionError(`refused, the result would not pass check:\n${r.errors.slice(0, 10).map((e) => `- ${e.where ? `[${e.where}] ` : ""}${e.message}`).join("\n")}`);
  const before = new Set(checkFiles(files).warnings.map((w) => `${w.file}|${w.where}|${w.message}`));
  return {
    change,
    files: out,
    summary: describeChange(change),
    message,
    warnings: r.warnings.filter((w) => !before.has(`${w.file}|${w.where}|${w.message}`)),
  };
}

/* ------------------------------------------------------------------ transactions */

/** Who/what is making a write, recorded on the transaction's trail and in the commit message. */
export interface WriteMeta {
  via: string;
  client?: string;
  reason?: string;
  at?: string; // default: now
}

export const REASON_MAX = 200;

function trailed(t: Transaction, op: TrailEntry["op"], meta?: WriteMeta): Transaction {
  if (!meta) return t;
  const reason = meta.reason?.trim().replace(/\s+/g, " ");
  if (reason && reason.length > REASON_MAX) throw new ActionError(`reason is too long (max ${REASON_MAX} characters)`);
  const e: TrailEntry = {
    op,
    at: meta.at ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    via: meta.via,
    ...(meta.client ? { client: meta.client } : {}),
    ...(reason ? { reason } : {}),
  };
  return { ...t, trail: [...(Array.isArray(t.trail) ? t.trail : []), e] };
}

function withMeta(message: string, meta?: WriteMeta): string {
  if (!meta) return message;
  const lines = [meta.reason?.trim() ? `Reason: ${meta.reason.trim().replace(/\s+/g, " ")}` : "", `Via: ${meta.via}${meta.client ? ` (${meta.client})` : ""}`].filter(Boolean);
  return `${message}\n\n${lines.join("\n")}`;
}

export interface SimpleTx {
  date: string;
  time?: string | null;
  note?: string;
  who?: string | null;
  event?: string | null;
  tags?: string[];
  plan?: string | null;
  /** Full form: balanced lines. */
  lines?: Line[];
  /** Simple forms (when lines is not given): */
  kind?: "expense" | "income" | "transfer";
  amount?: number; // positive
  account?: string; // expense: paid from; income: received into; transfer: from
  to_account?: string; // transfer: to
  category?: string; // expense / income category path
}

export function linesOf(t: SimpleTx): Line[] {
  if (t.lines?.length) return t.lines;
  const a = t.amount;
  if (!a || !Number.isInteger(a) || a <= 0) throw new ActionError("amount must be a positive whole number (base currency)");
  if (!t.account) throw new ActionError("account is required");
  if (t.kind === "transfer") {
    if (!t.to_account) throw new ActionError("to_account is required for a transfer");
    return [{ account: t.account, amount: -a }, { account: t.to_account, amount: a }];
  }
  if (!t.category) throw new ActionError("category is required for an expense or income");
  return t.kind === "income"
    ? [{ account: t.account, amount: a }, { category: t.category, amount: -a }]
    : [{ account: t.account, amount: -a }, { category: t.category, amount: a }];
}

export function addTransaction(files: FileMap, t: SimpleTx, meta?: WriteMeta): Planned {
  const b = buildAdd(t, meta);
  return plan(files, b.change, b.message);
}

interface Built {
  change: Change;
  message: string;
  tx: Transaction;
  old?: Transaction;
}

function buildAdd(t: SimpleTx, meta?: WriteMeta): Built {
  if (!isDate(t.date)) throw new ActionError("date must be yyyy-mm-dd");
  const tx: Transaction = {
    id: newId(),
    date: t.date,
    ...(t.time ? { time: t.time } : {}),
    note: t.note ?? "",
    ...(t.who ? { who: t.who } : {}),
    ...(t.event ? { event: t.event } : {}),
    ...(t.tags?.length ? { tags: t.tags } : {}),
    ...(t.plan ? { plan: t.plan } : {}),
    lines: linesOf(t),
  };
  const done = trailed(tx, "add", meta);
  return { change: { addTransactions: [done] }, message: withMeta(`Add: ${t.date} ${t.note ?? ""}`.trim(), meta), tx: done };
}

function findTx(files: FileMap, id: string): Transaction {
  for (const [p, text] of Object.entries(files)) {
    if (!LEDGER_FILE_RE.test(p) || !text.includes(`"${id}"`)) continue;
    const t = parseJsonl(text, p, []).find((x) => x.id === id);
    if (t) return t;
  }
  throw new ActionError(`no transaction ${id}`);
}

export function editTransaction(files: FileMap, id: string, patch: Partial<SimpleTx>, meta?: WriteMeta): Planned {
  const b = buildEdit(files, id, patch, meta);
  return plan(files, b.change, b.message);
}

function buildEdit(files: FileMap, id: string, patch: Partial<SimpleTx>, meta?: WriteMeta): Built {
  const old = findTx(files, id);
  const next: Transaction = { ...old };
  for (const k of ["date", "time", "note", "who", "event", "tags", "plan"] as const) {
    if (patch[k] !== undefined) (next as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.lines || patch.amount || patch.kind || patch.account || patch.category || patch.to_account) {
    next.lines = linesOf({ ...simpleOf(old, files), ...patch } as SimpleTx);
  }
  if (!isDate(next.date)) throw new ActionError("date must be yyyy-mm-dd");
  const done = trailed(next, "edit", meta);
  return { change: { replaceTransactions: [done] }, message: withMeta(`Edit: ${next.date} ${next.note ?? ""}`.trim(), meta), tx: done, old };
}

/**
 * Best-effort simple view of a transaction (to let an edit change just one field).
 * A 0 amount has no sign, so the kind comes from the category's side (income/expense),
 * and a 0 transfer keeps its lines' order (first line is the source).
 */
function simpleOf(t: Transaction, files: FileMap): Partial<SimpleTx> {
  const acc = t.lines.filter((l) => l.account);
  const cat = t.lines.filter((l) => l.category);
  if (t.lines.length === 2 && acc.length === 1 && cat.length === 1) {
    const a = acc[0]!;
    const category = cat[0]!.category!;
    const kind = a.amount < 0 ? "expense" : a.amount > 0 ? "income" : categoryKindOf(files, category);
    return { kind, amount: Math.abs(a.amount), account: a.account, category };
  }
  if (t.lines.length === 2 && acc.length === 2) {
    const from = acc.find((l) => l.amount < 0) ?? acc[0]!;
    const to = acc.find((l) => l !== from)!;
    return { kind: "transfer", amount: Math.abs(to.amount), account: from.account, to_account: to.account };
  }
  return { lines: t.lines };
}

/** A category's side from data/categories.yaml; expense when unknown (system categories, a missing file). */
function categoryKindOf(files: FileMap, path: string): "income" | "expense" {
  try {
    return flattenCategories(readCats(files)).map.get(path)?.kind === "income" ? "income" : "expense";
  } catch {
    return "expense";
  }
}

export function voidTransaction(files: FileMap, id: string, reason?: string, meta?: WriteMeta): Planned {
  const b = buildVoid(files, id, reason, meta);
  return plan(files, b.change, b.message);
}

function buildVoid(files: FileMap, id: string, reason?: string, meta?: WriteMeta): Built {
  const old = findTx(files, id);
  if (old.void) throw new ActionError(`${id} is already void`);
  const next = { ...old, void: true, ...(reason ? { void_reason: reason } : {}) };
  const done = trailed(next, "void", meta);
  return { change: { replaceTransactions: [done] }, message: withMeta(`Void: ${old.date} ${old.note ?? ""}`.trim(), meta), tx: done, old };
}

/* ------------------------------------------------------------------ batch */

export type BatchOp =
  | ({ op: "add"; reason?: string } & SimpleTx)
  | ({ op: "edit"; id: string; reason?: string } & Partial<SimpleTx>)
  | { op: "void"; id: string; reason?: string }
  /** The bank's amount for a card statement (data/cards/statements.yaml), like add_statement_amount. */
  | { op: "statement_amount"; account: string; statement_date: string; amount: number; reason?: string };

export const BATCH_MAX = 200;

export interface BatchPlanned extends Planned {
  /** Change in each account's balance (base currency) over the whole batch. */
  balanceChange: Record<string, number>;
  counts: { add: number; edit: number; void: number; statement_amount: number };
}

function joinReason(batch?: string, own?: string): string | undefined {
  const r = [batch?.trim(), own?.trim()].filter(Boolean).join("; ").replace(/\s+/g, " ");
  if (!r) return undefined;
  return r.length > REASON_MAX ? r.slice(0, REASON_MAX - 1) + "…" : r;
}

/**
 * Many adds, edits and voids as one change: the ops run one after another on the evolving files
 * (an op can edit or void a row an earlier op added), check runs once on the result, one commit.
 * Any op failing refuses the whole batch, naming the op.
 */
export function batch(files: FileMap, ops: BatchOp[], meta?: WriteMeta): BatchPlanned {
  if (!ops.length) throw new ActionError("batch: no ops");
  if (ops.length > BATCH_MAX) throw new ActionError(`batch: at most ${BATCH_MAX} ops (got ${ops.length})`);
  let cur: FileMap = files;
  const changed = new Set<string>();
  const finals = new Map<string, Transaction>(); // id -> final version
  const originals = new Map<string, Transaction | null>(); // id -> version before the batch (null: added here)
  const counts = { add: 0, edit: 0, void: 0, statement_amount: 0 };
  const amounts: { account: string; statement_date: string; amount: number }[] = [];
  ops.forEach((o, i) => {
    const m = meta ? { ...meta, reason: joinReason(meta.reason, o.reason) } : undefined;
    let b: Built;
    if (o.op === "statement_amount") {
      if (!isDate(o.statement_date) || !Number.isInteger(o.amount)) throw new ActionError(`batch refused: op ${i + 1} (statement_amount) needs statement_date yyyy-mm-dd and a whole amount`);
      const k = amounts.findIndex((x) => x.account === o.account && x.statement_date === o.statement_date);
      if (k >= 0) amounts.splice(k, 1);
      amounts.push({ account: o.account, statement_date: o.statement_date, amount: o.amount });
      counts.statement_amount++;
      return;
    }
    try {
      if (o.op === "add") {
        const { op: _op, reason: _r, ...t } = o;
        b = buildAdd(t as SimpleTx, m);
      } else if (o.op === "edit") {
        const { op: _op, reason: _r, id, ...patch } = o;
        b = buildEdit(cur, id, patch, m);
      } else if (o.op === "void") {
        b = buildVoid(cur, o.id, o.reason ?? meta?.reason, m);
      } else throw new ActionError(`unknown op "${(o as { op: unknown }).op}"`);
    } catch (e) {
      throw new ActionError(`batch refused: op ${i + 1} (${(o as { op: string }).op}${"id" in o && o.id ? ` ${o.id}` : ""}) failed: ${(e as Error).message}`);
    }
    counts[o.op]++;
    if (!originals.has(b.tx.id)) originals.set(b.tx.id, b.old ?? null);
    finals.set(b.tx.id, b.tx);
    const out = applyChange(cur, b.change);
    for (const p of Object.keys(out)) changed.add(p);
    cur = { ...cur, ...out };
  });
  if (amounts.length) {
    const unknown = amounts.find((x) => !loadLedger(cur).ledger.accounts.some((a) => a.id === x.account));
    if (unknown) throw new ActionError(`batch refused: statement_amount: no account ${unknown.account}`);
    cur = { ...cur, [STATEMENTS_FILE]: yamlText(withBankAmounts(loadLedger(cur).ledger, amounts)) };
    changed.add(STATEMENTS_FILE);
  }
  const r = checkFiles(cur);
  if (!r.ok) throw new ActionError(`batch refused, the result would not pass check:\n${r.errors.slice(0, 10).map((e) => `- ${e.where ? `[${e.where}] ` : ""}${e.message}`).join("\n")}`);
  const before = new Set(checkFiles(files).warnings.map((w) => `${w.file}|${w.where}|${w.message}`));
  const out: FileMap = {};
  for (const p of changed) if (cur[p] !== files[p]) out[p] = cur[p]!;
  const add: Transaction[] = [];
  const rep: Transaction[] = [];
  const balanceChange: Record<string, number> = {};
  const bump = (t: Transaction | null | undefined, sign: number) => {
    if (!t || t.void) return;
    for (const l of t.lines) if (l.account) balanceChange[l.account] = (balanceChange[l.account] ?? 0) + sign * l.amount;
  };
  for (const [id, t] of finals) {
    const old = originals.get(id) ?? null;
    (old ? rep : add).push(t);
    bump(t, 1);
    bump(old, -1);
  }
  for (const [k, v] of Object.entries(balanceChange)) if (v === 0) delete balanceChange[k];
  const parts = [counts.add && `${counts.add} add${counts.add > 1 ? "s" : ""}`, counts.edit && `${counts.edit} edit${counts.edit > 1 ? "s" : ""}`, counts.void && `${counts.void} void${counts.void > 1 ? "s" : ""}`, counts.statement_amount && `${counts.statement_amount} bank amount${counts.statement_amount > 1 ? "s" : ""}`].filter(Boolean);
  const change: Change = { ...(add.length ? { addTransactions: add } : {}), ...(rep.length ? { replaceTransactions: rep } : {}) };
  return {
    change,
    files: out,
    summary: [`batch: ${parts.join(", ")}`, ...describeChange(change), ...amounts.map((x) => `bank amount ${x.account} ${x.statement_date}: ${x.amount}`)],
    message: withMeta(`Batch: ${parts.join(", ")}`, meta),
    warnings: r.warnings.filter((w) => !before.has(`${w.file}|${w.where}|${w.message}`)),
    balanceChange,
    counts,
  };
}

/** The ledger of a set of files, for actions that read it before building a change. */
export function loadForAction(files: FileMap) {
  return loadLedger(files);
}

/* ------------------------------------------------------------------ accounts, plans, prices */

export function addAccount(files: FileMap, a: Account): Planned {
  return plan(files, { addAccounts: [a] }, `Add account: ${a.name} (${a.type})`);
}

export function editAccount(files: FileMap, id: string, set: Record<string, unknown>): Planned {
  const { ledger } = loadLedger(files);
  if (!ledger.accounts.some((a) => a.id === id)) throw new ActionError(`no account ${id}`);
  if ("id" in set) throw new ActionError("an account id can't be changed");
  return plan(files, { updateAccounts: [{ id, set }] }, set.closed ? `Close account: ${id}` : `Edit account: ${id}`);
}

export function addPlan(files: FileMap, p: Plan): Planned {
  const { ledger } = loadLedger(files);
  if (ledger.plans.some((x) => x.id === p.id)) throw new ActionError(`plan ${p.id} exists`);
  return plan(files, { upsertList: [{ path: PATHS.plans, items: [p as never] }] }, `Add plan: ${p.name ?? p.id}`);
}

export function addPrice(files: FileMap, p: Price): Planned {
  return plan(files, { addPrices: [p] }, `Price: ${p.asset} ${p.date}`);
}

/* ------------------------------------------------------------------ categories */

function readCats(files: FileMap): CategoriesFile {
  const v = parseYaml(files[PATHS.categories] ?? "") as CategoriesFile;
  return { income: v?.income ?? [], expense: v?.expense ?? [] };
}

function nodeAt(cats: CategoriesFile, path: string): { list: CategoryNode[]; node: CategoryNode } | null {
  const parts = path.split("/");
  for (const kind of ["income", "expense"] as const) {
    let list = cats[kind];
    for (let i = 0; i < parts.length; i++) {
      const n = list.find((x) => x.id === parts[i]);
      if (!n) break;
      if (i === parts.length - 1) return { list, node: n };
      list = n.children ??= [];
    }
  }
  return null;
}

export function addCategory(files: FileMap, c: { kind: "income" | "expense"; parent?: string; id: string; name: string }): Planned {
  const cats = readCats(files);
  let list = cats[c.kind];
  if (c.parent) {
    const p = nodeAt(cats, c.parent);
    if (!p) throw new ActionError(`no category ${c.parent}`);
    list = p.node.children ??= [];
  }
  if (list.some((x) => x.id === c.id)) throw new ActionError(`category ${c.parent ? c.parent + "/" : ""}${c.id} exists`);
  list.push({ id: c.id, name: c.name });
  return plan(files, { putFiles: { [PATHS.categories]: yamlText(cats) } }, `Add category: ${c.parent ? c.parent + "/" : ""}${c.id}`);
}

/** Rename a category (name), or move/rename its path and remap every line that uses it (or its children). */
export function editCategory(files: FileMap, path: string, set: { name?: string; new_path?: string }): Planned {
  const cats = readCats(files);
  const at = nodeAt(cats, path);
  if (!at) throw new ActionError(`no category ${path}`);
  if (set.name) at.node.name = set.name;
  const change: Change = {};
  if (set.new_path && set.new_path !== path) {
    const { map } = flattenCategories(cats);
    if (map.has(set.new_path)) throw new ActionError(`category ${set.new_path} exists; merging is not supported here`);
    const kind = map.get(path)!.kind;
    at.list.splice(at.list.indexOf(at.node), 1);
    const parts = set.new_path.split("/");
    const leaf = parts.pop()!;
    let list = cats[kind];
    if (parts.length) {
      const p = nodeAt(cats, parts.join("/"));
      if (!p) throw new ActionError(`no parent category ${parts.join("/")}`);
      list = p.node.children ??= [];
    }
    list.push({ ...at.node, id: leaf });
    const remap = (c: string) => (c === path ? set.new_path! : c.startsWith(path + "/") ? set.new_path + c.slice(path.length) : c);
    const replace: Transaction[] = [];
    for (const t of loadLedger(files).ledger.transactions) {
      if (!t.lines.some((l) => l.category && remap(l.category) !== l.category)) continue;
      replace.push({ ...t, lines: t.lines.map((l) => (l.category ? { ...l, category: remap(l.category) } : l)) });
    }
    if (replace.length) change.replaceTransactions = replace;
    const budgets = parseYaml(files[PATHS.budgets] ?? "[]") as { category: string }[] | null;
    if (budgets?.some((b) => remap(b.category) !== b.category)) {
      change.putFiles = { [PATHS.budgets]: yamlText(budgets.map((b) => ({ ...b, category: remap(b.category) }))) };
    }
  }
  change.putFiles = { ...(change.putFiles ?? {}), [PATHS.categories]: yamlText(cats) };
  return plan(files, change, set.new_path ? `Move category: ${path} → ${set.new_path}` : `Rename category: ${path}`);
}
