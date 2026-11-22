import { flattenCategories, isSystemCategory, topOf } from "./categories.js";
import { addDays, addMonths, daysBetween, monthEnd, monthStart, parts, fmt } from "./dates.js";
import type { Category, ISODate, Ledger, Transaction } from "./types.js";

export interface Period {
  from: ISODate;
  to: ISODate; // inclusive
}

/** "2026-11" → that month; "2026" → that year; {from,to} as given. */
export function periodOf(spec: string | Period): Period {
  if (typeof spec !== "string") return spec;
  if (/^\d{4}-\d{2}$/.test(spec)) return { from: `${spec}-01`, to: monthEnd(`${spec}-01`) };
  if (/^\d{4}$/.test(spec)) return { from: `${spec}-01-01`, to: `${spec}-12-31` };
  throw new Error(`bad period "${spec}" (use yyyy-mm, yyyy, or from/to dates)`);
}

/** The period of the same shape just before. Whole months/years step by month/year; other spans by days. */
export function previousPeriod(p: Period): Period {
  const wholeMonths = p.from === monthStart(p.from) && p.to === monthEnd(p.to);
  if (wholeMonths) {
    const [fy, fm] = parts(p.from);
    const [ty, tm] = parts(p.to);
    const n = (ty - fy) * 12 + (tm - fm) + 1;
    const from = addMonths(p.from, -n);
    return { from, to: monthEnd(addMonths(from, n - 1)) };
  }
  const len = daysBetween(p.from, p.to) + 1;
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export type GroupBy = "category" | "top" | "account" | "who" | "event" | "tag" | "month";

export interface ReportRow {
  key: string;
  name: string;
  income: number;
  expense: number;
  count: number;
}

export interface Report {
  period: Period;
  by: GroupBy;
  kind?: "income" | "expense";
  income: number;
  expense: number;
  net: number;
  rows: ReportRow[];
  previous?: { period: Period; income: number; expense: number; net: number; rows: Record<string, { income: number; expense: number }> };
}

interface ReportOpts {
  by?: GroupBy;
  kind?: "income" | "expense";
  compare?: boolean;
  /** Only lines under this category path (prefix). */
  category?: string;
  account?: string;
}

function inPeriod(t: Transaction, p: Period) {
  return t.date >= p.from && t.date <= p.to;
}

function aggregate(l: Ledger, p: Period, cats: Map<string, Category>, o: ReportOpts) {
  const by = o.by ?? "category";
  const accName = new Map(l.accounts.map((a) => [a.id, a.name]));
  const rows = new Map<string, ReportRow>();
  let income = 0;
  let expense = 0;
  for (const t of l.transactions) {
    if (t.void || !inPeriod(t, p)) continue;
    if (o.account && !t.lines.some((ln) => ln.account === o.account)) continue;
    const firstAccount = t.lines.find((ln) => ln.account != null)?.account ?? "(none)";
    const counted = new Set<string>();
    for (const ln of t.lines) {
      if (ln.category == null || isSystemCategory(ln.category)) continue;
      if (o.category && !(ln.category === o.category || ln.category.startsWith(o.category + "/"))) continue;
      const c = cats.get(ln.category);
      const kind = c?.kind ?? "expense";
      if (o.kind && kind !== o.kind) continue;
      const inc = kind === "income" ? -ln.amount : 0;
      const exp = kind === "expense" ? ln.amount : 0;
      income += inc;
      expense += exp;
      const keys: [string, string][] =
        by === "category" ? [[ln.category, c?.name ?? ln.category]]
        : by === "top" ? [[topOf(ln.category), cats.get(topOf(ln.category))?.name ?? topOf(ln.category)]]
        : by === "account" ? [[firstAccount, accName.get(firstAccount) ?? firstAccount]]
        : by === "who" ? [[t.who ?? "(none)", t.who ?? "(none)"]]
        : by === "event" ? [[t.event ?? "(none)", t.event ?? "(none)"]]
        : by === "month" ? [[t.date.slice(0, 7), t.date.slice(0, 7)]]
        : (t.tags?.length ? t.tags : ["(none)"]).map((g) => [g, g] as [string, string]);
      for (const [key, name] of keys) {
        const r = rows.get(key) ?? { key, name, income: 0, expense: 0, count: 0 };
        r.income += inc;
        r.expense += exp;
        if (!counted.has(key)) {
          r.count++;
          counted.add(key);
        }
        rows.set(key, r);
      }
    }
  }
  return { income, expense, rows };
}

export function report(l: Ledger, period: string | Period, o: ReportOpts = {}): Report {
  const p = periodOf(period);
  const { map: cats } = flattenCategories(l.categories);
  const cur = aggregate(l, p, cats, o);
  const rows = [...cur.rows.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
  const out: Report = { period: p, by: o.by ?? "category", kind: o.kind, income: cur.income, expense: cur.expense, net: cur.income - cur.expense, rows };
  if (o.compare !== false) {
    const pp = previousPeriod(p);
    const prev = aggregate(l, pp, cats, o);
    out.previous = {
      period: pp,
      income: prev.income,
      expense: prev.expense,
      net: prev.income - prev.expense,
      rows: Object.fromEntries([...prev.rows.values()].map((r) => [r.key, { income: r.income, expense: r.expense }])),
    };
  }
  return out;
}

export interface TxQuery {
  from?: ISODate;
  to?: ISODate;
  account?: string;
  category?: string; // prefix match on path
  text?: string;
  min?: number; // on the transaction's size (sum of positive line amounts)
  max?: number;
  plan?: string;
  includeVoid?: boolean;
  offset?: number;
  limit?: number;
}

/** Lowercase, no Vietnamese diacritics (đ → d), for search. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

export function txSize(t: Transaction): number {
  return t.lines.reduce((s, ln) => s + (ln.amount > 0 ? ln.amount : 0), 0);
}

export function queryTransactions(l: Ledger, q: TxQuery): { total: number; items: Transaction[] } {
  const text = q.text ? fold(q.text) : "";
  const hits: Transaction[] = [];
  for (let i = l.transactions.length - 1; i >= 0; i--) {
    const t = l.transactions[i]!;
    if (t.void && !q.includeVoid) continue;
    if (q.from && t.date < q.from) continue;
    if (q.to && t.date > q.to) continue;
    if (q.account && !t.lines.some((ln) => ln.account === q.account)) continue;
    if (q.category && !t.lines.some((ln) => ln.category === q.category || ln.category?.startsWith(q.category + "/"))) continue;
    if (q.plan && t.plan !== q.plan) continue;
    const size = txSize(t);
    if (q.min !== undefined && size < q.min) continue;
    if (q.max !== undefined && size > q.max) continue;
    if (text) {
      const hay = fold([t.note, t.who, t.event, ...(t.tags ?? []), ...t.lines.map((ln) => ln.note)].filter(Boolean).join(" "));
      if (!hay.includes(text)) continue;
    }
    hits.push(t);
  }
  const offset = q.offset ?? 0;
  const limit = Math.min(q.limit ?? 50, 500);
  return { total: hits.length, items: hits.slice(offset, offset + limit) };
}

/** Month keys "yyyy-mm" from first to last inclusive. */
export function monthsBetween(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let [y, m] = parts(from);
  const [ty, tm] = parts(to);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(fmt(y, m, 1).slice(0, 7));
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
