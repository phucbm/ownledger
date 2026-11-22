import { parse as parseYaml, stringify } from "yaml";
import { checkFiles } from "./check.js";
import { flattenCategories } from "./categories.js";
import { isDate } from "./dates.js";
import { LEDGER_FILE_RE, loadLedger, parseJsonl, PATHS, type FileMap } from "./load.js";
import { applyChange, describeChange, type Change } from "./write.js";
import type { Account, CategoriesFile, CategoryNode, Issue, Line, Plan, Price, Transaction } from "./types.js";

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

export function addTransaction(files: FileMap, t: SimpleTx): Planned {
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
  return plan(files, { addTransactions: [tx] }, `Add: ${t.date} ${t.note ?? ""}`.trim());
}

function findTx(files: FileMap, id: string): Transaction {
  for (const [p, text] of Object.entries(files)) {
    if (!LEDGER_FILE_RE.test(p) || !text.includes(`"${id}"`)) continue;
    const t = parseJsonl(text, p, []).find((x) => x.id === id);
    if (t) return t;
  }
  throw new ActionError(`no transaction ${id}`);
}

export function editTransaction(files: FileMap, id: string, patch: Partial<SimpleTx>): Planned {
  const old = findTx(files, id);
  const next: Transaction = { ...old };
  for (const k of ["date", "time", "note", "who", "event", "tags", "plan"] as const) {
    if (patch[k] !== undefined) (next as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.lines || patch.amount || patch.kind || patch.account || patch.category || patch.to_account) {
    next.lines = linesOf({ ...simpleOf(old), ...patch } as SimpleTx);
  }
  if (!isDate(next.date)) throw new ActionError("date must be yyyy-mm-dd");
  return plan(files, { replaceTransactions: [next] }, `Edit: ${next.date} ${next.note ?? ""}`.trim());
}

/** Best-effort simple view of a transaction (to let an edit change just one field). */
function simpleOf(t: Transaction): Partial<SimpleTx> {
  const acc = t.lines.filter((l) => l.account);
  const cat = t.lines.filter((l) => l.category);
  if (t.lines.length === 2 && acc.length === 1 && cat.length === 1) {
    const a = acc[0]!;
    return { kind: a.amount < 0 ? "expense" : "income", amount: Math.abs(a.amount), account: a.account, category: cat[0]!.category };
  }
  if (t.lines.length === 2 && acc.length === 2) {
    const from = acc.find((l) => l.amount < 0)!;
    const to = acc.find((l) => l.amount > 0)!;
    return { kind: "transfer", amount: to.amount, account: from.account, to_account: to.account };
  }
  return { lines: t.lines };
}

export function voidTransaction(files: FileMap, id: string, reason?: string): Planned {
  const old = findTx(files, id);
  if (old.void) throw new ActionError(`${id} is already void`);
  const next = { ...old, void: true, ...(reason ? { void_reason: reason } : {}) };
  return plan(files, { replaceTransactions: [next] }, `Void: ${old.date} ${old.note ?? ""}`.trim());
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
  return plan(files, { putFiles: { [PATHS.categories]: stringify(cats, { lineWidth: 0 }) } }, `Add category: ${c.parent ? c.parent + "/" : ""}${c.id}`);
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
      change.putFiles = { [PATHS.budgets]: stringify(budgets.map((b) => ({ ...b, category: remap(b.category) })), { lineWidth: 0 }) };
    }
  }
  change.putFiles = { ...(change.putFiles ?? {}), [PATHS.categories]: stringify(cats, { lineWidth: 0 }) };
  return plan(files, change, set.new_path ? `Move category: ${path} → ${set.new_path}` : `Rename category: ${path}`);
}
