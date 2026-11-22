import { isDate } from "../engine/dates.js";
import type { Account, Ledger, Line, Transaction } from "../engine/types.js";
import { stableKey } from "./hash.js";
import type { AccountMap, Mapping } from "./mapping.js";
import type { Cell, Sheet, Workbook } from "./workbook.js";

export interface SourceRow {
  sheet: string;
  sourceAccount: string;
  account: string; // ownledger id
  row: number; // 1-based row in the sheet
  date: string;
  time: string | null;
  cents: number; // signed, source precision (×100)
  amount: number; // signed whole units (rounded)
  catKey: string | null; // "Parent/Child" | "Parent"
  note: string;
  who: string | null;
  event: string | null;
  tags: string[];
  key: string;
  kind?: "category" | "transfer" | "unresolved";
  category?: string;
  wallet?: string; // other side of a transfer, as named in the note
  pairedWith?: SourceRow;
}

export interface Reconcile {
  sheet: string;
  account: string;
  rows: number;
  source: { opening: number | null; in: number | null; out: number | null; closing: number | null };
  imported: { opening: number; in: number; out: number; closing: number };
  rounding: number; // whole units booked as _adjust so the closing balance matches exactly
  zeroed: number; // _adjust booked on the closing date of a closed account (zero_closed), 0 if none
  ok: boolean;
  problems: string[];
}

export interface ImportResult {
  ok: boolean;
  source: string;
  rows: number;
  transactions: Transaction[]; // new ones (not already in the ledger)
  accounts: Account[]; // accounts to add to accounts.yaml
  skipped: number; // already imported (same key)
  changed: { key: string; id: string; was: string; now: string }[];
  /** Opening/rounding transactions whose amount changed on re-import: replaced, since they are derived from the file. */
  replace: Transaction[];
  gone: { id: string; date: string; note?: string; key: string }[]; // in the ledger from this source but not in the file
  unpaired: SourceRow[];
  unresolvedCategories: { key: string; rows: number; example: string }[];
  unresolvedRows: SourceRow[];
  reconcile: Reconcile[];
  rounding: { sheet: string; diff: number }[];
  zeroed: { account: string; date: string; amount: number }[];
  errors: string[];
}

/* ------------------------------------------------------------------ helpers */

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function parseAmount(v: Cell, decimal: "." | "," = "."): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = v.trim().replace(/\s|₫|đ|VND/gi, "");
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-+]/g, "");
  s = decimal === "," ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function parseDate(v: Cell, fmt: Mapping["date_format"]): string | null {
  if (v === null) return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m && (fmt === undefined || fmt === "yyyy-mm-dd")) return iso(m[1]!, m[2]!, m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return fmt === "mm/dd/yyyy" ? iso(m[3]!, m[1]!, m[2]!) : iso(m[3]!, m[2]!, m[1]!);
  return null;
}
const iso = (y: string, mo: string, d: string) => {
  const r = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isDate(r) ? r : null;
};

function parseTime(v: Cell): string | null {
  if (v === null) return null;
  if (typeof v === "number") {
    const mins = Math.round((v % 1) * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : null;
}

/** Excel's sheet name for a full name: forbidden chars → "_", max 31 chars. */
export function excelSheetName(name: string): string {
  // Excel counts UTF-16 units; a cut surrogate pair leaves half an emoji (MISA writes it as _xD83D_)
  return name.replace(/[\\/?*[\]:]/g, "_").slice(0, 31).replace(/[\uD800-\uDBFF]$/, "");
}

function nameMatchesSheet(name: string, sheet: string, acc: AccountMap | undefined): boolean {
  const n = norm(name);
  if (acc?.names?.some((x) => norm(x) === n)) return true;
  if (norm(acc?.name) === n) return true;
  const s = norm(sheet).replace(/[\uD800-\uDBFF]$/, "");
  const base = s.replace(/_\d+$/, "");
  const en = norm(excelSheetName(name));
  if (en === s || en === base) return true;
  // truncated by Excel (31 chars, emoji surrogates may become _xD83D_ fragments)
  const cut = base.replace(/_x[0-9a-f]{4}_?$/i, "").replace(/_$/, "");
  return cut.length >= 4 && en.startsWith(cut);
}

/* ------------------------------------------------------------------ reading */

function findHeader(sheet: Sheet, m: Mapping): number {
  if (m.header_row) return m.header_row - 1;
  const want = norm(m.columns.date);
  return sheet.rows.findIndex((r) => r?.some((c) => norm(c) === want));
}

function readTotals(sheet: Sheet, headerIdx: number, m: Mapping) {
  const out: Record<"opening" | "closing" | "in" | "out", number | null> = { opening: null, closing: null, in: null, out: null };
  if (!m.totals) return out;
  for (let r = 0; r < headerIdx; r++) {
    const row = sheet.rows[r] ?? [];
    row.forEach((c, i) => {
      for (const k of Object.keys(out) as (keyof typeof out)[]) {
        const label = m.totals?.[k];
        if (label && norm(c) === norm(label)) {
          for (let j = i + 1; j < row.length; j++) {
            const v = parseAmount(row[j] ?? null, m.decimal);
            if (v !== null) {
              out[k] = v;
              break;
            }
          }
        }
      }
    });
  }
  return out;
}

export function readRows(wb: Workbook, m: Mapping): { rows: SourceRow[]; sheets: { sheet: Sheet; header: number; totals: ReturnType<typeof readTotals>; rows: SourceRow[] }[]; errors: string[] } {
  const errors: string[] = [];
  const all: SourceRow[] = [];
  const perSheet: { sheet: Sheet; header: number; totals: ReturnType<typeof readTotals>; rows: SourceRow[] }[] = [];
  const wanted = m.sheets && m.sheets !== "all" ? new Set(m.sheets) : null;
  const skip = new Set(m.skip_sheets ?? []);
  for (const sheet of wb.sheets) {
    if (wanted && !wanted.has(sheet.name)) continue;
    if (skip.has(sheet.name)) continue;
    const h = findHeader(sheet, m);
    if (h < 0) {
      errors.push(`sheet "${sheet.name}": no header row with column "${m.columns.date}"`);
      continue;
    }
    const headers = (sheet.rows[h] ?? []).map(norm);
    const col = (name?: string) => {
      if (!name) return -1;
      const i = headers.indexOf(norm(name));
      if (i < 0) errors.push(`sheet "${sheet.name}": column "${name}" not found`);
      return i;
    };
    const c = Object.fromEntries(Object.entries(m.columns).map(([k, v]) => [k, col(v as string)])) as Record<string, number>;
    const accCol = m.account_from === "column" ? col(m.account_column) : -1;
    const totals = readTotals(sheet, h, m);
    const rows: SourceRow[] = [];
    for (let r = h + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      if (!row || row.every((x) => x === null)) continue;
      const at = (i: number | undefined): Cell => (i !== undefined && i >= 0 ? (row[i] ?? null) : null);
      const date = parseDate(at(c.date), m.date_format);
      if (!date) {
        if (at(c.date) !== null) errors.push(`sheet "${sheet.name}" row ${r + 1}: can't read date "${at(c.date)}"`);
        continue;
      }
      let value: number | null;
      if (c.amount !== undefined && c.amount >= 0) value = parseAmount(at(c.amount), m.decimal);
      else value = (parseAmount(at(c.in), m.decimal) ?? 0) - (parseAmount(at(c.out), m.decimal) ?? 0);
      if (value === null) {
        errors.push(`sheet "${sheet.name}" row ${r + 1}: no amount`);
        continue;
      }
      const sourceAccount = m.account_from === "column" ? String(at(accCol) ?? "") : m.account_from === "fixed" ? m.account! : sheet.name;
      const parent = at(c.category);
      const child = at(c.subcategory);
      const catKey = parent !== null ? (child !== null ? `${String(parent).trim()}/${String(child).trim()}` : String(parent).trim()) : child !== null ? String(child).trim() : null;
      const cents = Math.round(value * 100);
      rows.push({
        sheet: sheet.name,
        sourceAccount,
        account: m.accounts?.[sourceAccount]?.id ?? "",
        row: r + 1,
        date,
        time: parseTime(at(c.time)),
        cents,
        amount: Math.round(cents / 100),
        catKey,
        note: String(at(c.note) ?? "").trim(),
        who: at(c.who) !== null ? String(at(c.who)).trim() : null,
        event: at(c.event) !== null ? String(at(c.event)).trim() : null,
        tags: at(c.tags) !== null ? String(at(c.tags)).split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [],
        key: "",
      });
    }
    // stable keys: occurrence index among identical rows, counted oldest first
    const newestFirst = m.newest_first ?? (rows.length > 1 && rows[0]!.date > rows[rows.length - 1]!.date);
    const ordered = newestFirst ? [...rows].reverse() : rows;
    const seen = new Map<string, number>();
    for (const sr of ordered) {
      const base = [m.source, sr.sourceAccount, sr.date, sr.time, sr.cents, sr.catKey, sr.note];
      const b = JSON.stringify(base);
      const n = seen.get(b) ?? 0;
      seen.set(b, n + 1);
      sr.key = stableKey([...base, n]);
    }
    perSheet.push({ sheet, header: h, totals, rows: ordered });
    all.push(...ordered);
  }
  return { rows: all, sheets: perSheet, errors };
}

/* ------------------------------------------------------------------ run */

export function runImport(wb: Workbook, m: Mapping, ledger: Ledger | null): ImportResult {
  const { rows, sheets, errors } = readRows(wb, m);
  const unmatched = m.unmatched_account ?? "import-unmatched";
  const res: ImportResult = {
    ok: false, source: m.source, rows: rows.length, transactions: [], accounts: [], skipped: 0, changed: [], replace: [], gone: [],
    unpaired: [], unresolvedCategories: [], unresolvedRows: [], reconcile: [], rounding: [], zeroed: [], errors,
  };

  // account targets in categories / uncategorized must be accounts of the mapping or the ledger
  const knownIds = new Set([...Object.values(m.accounts ?? {}).map((a) => a.id), ...(ledger?.accounts.map((a) => a.id) ?? [])]);
  for (const v of [...Object.values(m.categories ?? {}), ...[...(m.rules ?? []), ...(m.uncategorized ?? [])].map((u) => u.category), m.uncategorized_in, m.uncategorized_out]) {
    if (typeof v === "string" && v.startsWith("account:") && !knownIds.has(v.slice(8))) errors.push(`"${v}": no such account in the mapping's accounts or the ledger`);
  }
  // accounts named in the file must be mapped
  const missingAcc = new Set(rows.filter((r) => !r.account).map((r) => r.sourceAccount));
  for (const a of missingAcc) errors.push(`source account "${a}" is not in the mapping's accounts`);

  // classify
  const outRe = m.transfers?.out ? new RegExp(m.transfers.out, "u") : null;
  const inRe = m.transfers?.in ? new RegExp(m.transfers.in, "u") : null;
  const onlyNoCat = m.transfers?.only_without_category ?? true;
  const unresolvedCats = new Map<string, { rows: number; example: string }>();
  for (const r of rows) {
    const tr = r.cents < 0 ? outRe : inRe;
    const tm = tr && (!onlyNoCat || r.catKey === null) ? tr.exec(r.note) : null;
    if (tm) {
      r.kind = "transfer";
      r.wallet = (tm.groups?.wallet ?? "").trim();
      continue;
    }
    const rule0 = (m.rules ?? []).find(
      (u) => (!u.sign || (u.sign === "in") === r.cents > 0) && (!u.source_category || u.source_category === r.catKey || u.source_category === r.catKey?.split("/")[0]) && new RegExp(u.match, "iu").test(r.note),
    );
    if (rule0) {
      r.kind = "category";
      r.category = rule0.category;
      continue;
    }
    if (r.catKey !== null) {
      const parent = r.catKey.split("/")[0]!;
      const cat = m.categories[r.catKey] ?? m.categories[parent];
      if (cat) {
        r.kind = "category";
        r.category = cat;
      } else {
        r.kind = "unresolved";
        const u = unresolvedCats.get(r.catKey) ?? { rows: 0, example: `${r.date} ${r.amount} ${r.note}` };
        u.rows++;
        unresolvedCats.set(r.catKey, u);
      }
      continue;
    }
    const rule = (m.uncategorized ?? []).find((u) => (!u.sign || (u.sign === "in") === r.cents > 0) && new RegExp(u.match, "iu").test(r.note));
    const fallback = r.cents > 0 ? m.uncategorized_in : m.uncategorized_out;
    if (rule || fallback) {
      r.kind = "category";
      r.category = rule?.category ?? fallback;
    } else {
      r.kind = "unresolved";
      res.unresolvedRows.push(r);
    }
  }
  res.unresolvedCategories = [...unresolvedCats].map(([key, v]) => ({ key, ...v }));

  // pair transfers: same date, time and amount, opposite signs, different source accounts; names break ties
  const ins = new Map<string, SourceRow[]>();
  for (const r of rows) {
    if (r.kind !== "transfer" || r.cents <= 0) continue;
    const k = `${r.date}|${r.cents}`;
    (ins.get(k) ?? ins.set(k, []).get(k)!).push(r);
  }
  const accMap = m.accounts ?? {};
  const score = (o: SourceRow, i: SourceRow) =>
    (o.time === i.time ? 4 : 0) +
    (nameMatchesSheet(o.wallet ?? "", i.sheet, accMap[i.sourceAccount]) ? 2 : 0) +
    (nameMatchesSheet(i.wallet ?? "", o.sheet, accMap[o.sourceAccount]) ? 1 : 0);
  for (const pass of [0, 1]) {
    for (const o of rows) {
      if (o.kind !== "transfer" || o.cents >= 0 || o.pairedWith) continue;
      const cands = (ins.get(`${o.date}|${-o.cents}`) ?? []).filter((i) => !i.pairedWith && i.sourceAccount !== o.sourceAccount && (pass === 1 || i.time === o.time));
      if (!cands.length) continue;
      cands.sort((a, b) => score(o, b) - score(o, a));
      const best = cands[0]!;
      if (pass === 1 && score(o, best) < 2) continue; // without the same time, at least the names must agree
      o.pairedWith = best;
      best.pairedWith = o;
    }
  }
  res.unpaired = rows.filter((r) => r.kind === "transfer" && !r.pairedWith && !(m.unpaired ?? []).some((u) => new RegExp(u.wallet, "iu").test(r.wallet ?? "")));

  // build transactions
  const built: Transaction[] = [];
  const tx = (key: string, date: string, time: string | null, note: string, lines: Line[], extra: { who?: string | null; event?: string | null; tags?: string[]; src?: Record<string, unknown> } = {}): Transaction => ({
    id: `t_${key.slice(0, 14)}`,
    date,
    time,
    note,
    ...(extra.who ? { who: extra.who } : {}),
    ...(extra.event ? { event: extra.event } : {}),
    ...(extra.tags?.length ? { tags: extra.tags } : {}),
    lines,
    src: { import: m.source, key, ...(extra.src ?? {}) },
  });
  const stripTransfer = (note: string, re: RegExp | null) => (re ? note.replace(re, "").replace(/\s*\(\s*$/, "").trim() : note);
  for (const r of rows) {
    if (r.kind === "category") {
      // "account:<id>" sends the other side to an account (a move between the owner's own accounts, not income or spending)
      const other: Line = r.category!.startsWith("account:") ? { account: r.category!.slice(8), amount: -r.amount } : { category: r.category!, amount: -r.amount };
      built.push(tx(r.key, r.date, r.time, r.note, [{ account: r.account, amount: r.amount }, other], { who: r.who, event: r.event, tags: r.tags }));
    } else if (r.kind === "transfer") {
      if (r.pairedWith) {
        if (r.cents > 0) continue; // built from the out side
        const i = r.pairedWith;
        const note = stripTransfer(r.note, outRe) || stripTransfer(i.note, inRe) || "";
        built.push(tx(r.key, r.date, r.time, note, [{ account: r.account, amount: r.amount }, { account: i.account, amount: i.amount }], { who: r.who, event: r.event, tags: r.tags, src: { pair: i.key } }));
      } else {
        const rule = (m.unpaired ?? []).find((u) => new RegExp(u.wallet, "iu").test(r.wallet ?? ""));
        const target = rule?.category;
        const other: Line = !target ? { account: unmatched, amount: -r.amount } : target.startsWith("account:") ? { account: target.slice(8), amount: -r.amount } : { category: target, amount: -r.amount };
        built.push(tx(r.key, r.date, r.time, r.note, [{ account: r.account, amount: r.amount }, other], { who: r.who, event: r.event }));
      }
    }
  }
  // paired amounts must agree in whole units (they do, same cents); guard anyway
  for (const t of built) {
    const s = t.lines.reduce((a, l) => a + l.amount, 0);
    if (s !== 0) errors.push(`internal: transaction ${t.id} does not balance (${s})`);
  }

  // opening balances, rounding and reconcile per sheet
  for (const s of sheets) {
    const sheetName = s.sheet.name;
    const acc = accMap[s.rows[0]?.sourceAccount ?? sheetName]?.id ?? "";
    const t = s.totals;
    const problems: string[] = [];
    const inC = s.rows.filter((r) => r.cents > 0).reduce((a, r) => a + r.cents, 0);
    const outC = -s.rows.filter((r) => r.cents < 0).reduce((a, r) => a + r.cents, 0);
    const openC = Math.round((t.opening ?? 0) * 100);
    const near = (a: number, b: number) => Math.abs(a - b) <= 1; // ±1 cent of float noise
    if (t.in !== null && !near(inC, Math.round(t.in * 100))) problems.push(`money in ${inC / 100} ≠ source ${t.in}`);
    if (t.out !== null && !near(outC, Math.round(t.out * 100))) problems.push(`money out ${outC / 100} ≠ source ${t.out}`);
    if (t.closing !== null && !near(openC + inC - outC, Math.round(t.closing * 100))) problems.push(`opening + in − out = ${(openC + inC - outC) / 100} ≠ source closing ${t.closing}`);
    const opening = Math.round(openC / 100);
    const sumRounded = s.rows.reduce((a, r) => a + r.amount, 0);
    const closingTarget = t.closing !== null ? Math.round(t.closing) : opening + Math.round((inC - outC) / 100);
    const diff = closingTarget - (opening + sumRounded);
    const first = s.rows[0];
    const last = s.rows[s.rows.length - 1];
    if (opening !== 0 && first) {
      built.push(tx(stableKey([m.source, sheetName, "opening"]), m.opening_date ?? first.date, "00:00", "Số dư đầu kì / opening balance", [{ account: acc, amount: opening }, { category: "_opening", amount: -opening }], { src: { derived: "opening" } }));
    }
    if (diff !== 0 && last) {
      res.rounding.push({ sheet: sheetName, diff });
      built.push(tx(stableKey([m.source, sheetName, "rounding"]), last.date, "23:59", "Làm tròn khi nhập / import rounding", [{ account: acc, amount: diff }, { category: "_adjust", amount: -diff }], { src: { derived: "rounding" } }));
    }
    const imported = { opening, in: Math.round(inC / 100), out: Math.round(outC / 100), closing: opening + sumRounded + diff };
    let zeroed = 0;
    const closedOn = accMap[s.rows[0]?.sourceAccount ?? sheetName]?.closed;
    if (m.zero_closed && closedOn && imported.closing !== 0) {
      zeroed = -imported.closing;
      res.zeroed.push({ account: acc, date: closedOn, amount: zeroed });
      built.push(tx(stableKey([m.source, sheetName, "zero"]), closedOn, "23:59", "Về 0 khi tất toán / zeroed on closing", [{ account: acc, amount: zeroed }, { category: "_adjust", amount: -zeroed }], { src: { derived: "zero" } }));
    }
    res.reconcile.push({
      sheet: sheetName, account: acc, rows: s.rows.length,
      source: { opening: t.opening, in: t.in, out: t.out, closing: t.closing },
      imported, rounding: diff, zeroed, ok: problems.length === 0, problems,
    });
  }

  // accounts to create
  const existing = new Set(ledger?.accounts.map((a) => a.id) ?? []);
  const made = new Set<string>();
  const used = new Set(built.flatMap((t) => t.lines.map((l) => l.account).filter(Boolean) as string[]));
  for (const [, a] of Object.entries(accMap)) {
    if (existing.has(a.id) || made.has(a.id) || !used.has(a.id)) continue;
    made.add(a.id);
    const { names: _n, ...rest } = a;
    res.accounts.push({ ...rest, id: a.id, name: a.name ?? a.id, type: a.type ?? "other" } as Account);
  }
  if (built.some((t) => t.lines.some((l) => l.account === unmatched)) && !existing.has(unmatched) && !made.has(unmatched)) {
    res.accounts.push({ id: unmatched, name: "Chưa khớp khi nhập / unmatched import", type: "other", note: "Transfers whose other side was not in the file. Should end at 0." });
  }

  // re-import: skip known keys, report changed and gone
  const known = new Map<string, Transaction>();
  for (const t of ledger?.transactions ?? []) if (t.src?.import === m.source) known.set(t.src.key, t);
  const builtKeys = new Set<string>();
  const sig = (t: Transaction) => JSON.stringify([t.date, t.lines.map((l) => [l.account ?? l.category, l.amount])]);
  for (const t of built) {
    builtKeys.add(t.src!.key);
    if (t.src!.pair) builtKeys.add(String(t.src!.pair));
    const k = known.get(t.src!.key);
    if (!k) {
      res.transactions.push(t);
      continue;
    }
    res.skipped++;
    if (sig(k) === sig(t)) continue;
    if (t.src!.derived) res.replace.push({ ...t, id: k.id });
    else res.changed.push({ key: t.src!.key, id: k.id, was: sig(k), now: sig(t) });
  }
  for (const [key, t] of known) {
    if (builtKeys.has(key) || t.void) continue;
    if (t.src?.derived) res.replace.push({ ...t, void: true });
    else res.gone.push({ id: t.id, date: t.date, note: t.note, key });
  }

  res.ok =
    errors.length === 0 &&
    res.unresolvedCategories.length === 0 &&
    res.unresolvedRows.length === 0 &&
    res.reconcile.every((r) => r.ok);
  return res;
}
