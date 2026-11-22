import { holdingsAt } from "./balances.js";
import { flattenCategories, isSystemCategory, topOf } from "./categories.js";
import { addDays, addMonths, daysBetween, daysInMonth, isDate, monthEnd, monthStart, parts } from "./dates.js";
import { fold, monthsBetween, type Period } from "./reports.js";
import type { Category, ISODate, Ledger, Transaction } from "./types.js";

/* ------------------------------------------------------------------ thresholds ("What's different") */

/** A category is "different" when it's at least this % off its usual… */
export const UNUSUAL_MIN_PCT = 30;
/** …and the difference is at least this share of your usual spending for the same days (keeps tiny categories out). */
export const UNUSUAL_MIN_SHARE = 0.03;
/** A transaction is unusually large when it's above this percentile of its category's lines in the last 12 months… */
export const LARGE_PERCENTILE = 0.99;
/** …and the category has at least this many lines to compare with. */
export const LARGE_MIN_SAMPLES = 20;
/** At most this many "What's different" cards. */
export const UNUSUAL_MAX = 5;
/** Expense categories that mean "not categorised yet" (the default `other`, or an explicit `uncategorized`). */
export const UNCATEGORISED = new Set(["other", "uncategorized", "uncategorised"]);

/* ------------------------------------------------------------------ flows */

export interface Flow {
  income: number;
  expense: number;
}

/** Income and spending of one transaction (transfers and system categories count 0). Optional category prefix filter. */
export function txFlow(t: Transaction, cats: Map<string, Category>, category?: string): Flow {
  let income = 0;
  let expense = 0;
  for (const ln of t.lines) {
    if (ln.category == null || isSystemCategory(ln.category)) continue;
    if (category && !(ln.category === category || ln.category.startsWith(category + "/"))) continue;
    const kind = cats.get(ln.category)?.kind ?? "expense";
    if (kind === "income") income += -ln.amount;
    else expense += ln.amount;
  }
  return { income, expense };
}

/** Income and spending per day from `from` to `to` (inclusive). */
export function flowsByDay(l: Ledger, from: ISODate, to: ISODate, category?: string): Map<ISODate, Flow> {
  const { map: cats } = flattenCategories(l.categories);
  const out = new Map<ISODate, Flow>();
  for (const t of l.transactions) {
    if (t.void || t.date < from) continue;
    if (t.date > to) break;
    const f = txFlow(t, cats, category);
    if (!f.income && !f.expense) continue;
    const d = out.get(t.date) ?? { income: 0, expense: 0 };
    d.income += f.income;
    d.expense += f.expense;
    out.set(t.date, d);
  }
  return out;
}

/** First date with income or spending (opening balances and transfers don't count), or null. */
export function firstActivity(l: Ledger): ISODate | null {
  for (const t of l.transactions) {
    if (t.void) continue;
    if (t.lines.some((ln) => ln.category != null && !isSystemCategory(ln.category))) return t.date;
  }
  return null;
}

/** Whole months of history before the month of asOf (0 when the ledger starts this month). */
export function historyMonths(l: Ledger, asOf: ISODate): number {
  const first = firstActivity(l);
  if (!first || first > asOf) return 0;
  const [fy, fm] = parts(first);
  const [y, m] = parts(asOf);
  return Math.max(0, (y - fy) * 12 + (m - fm));
}

/* ------------------------------------------------------------------ pace */

export interface Pace {
  asOf: ISODate;
  month: string; // yyyy-mm
  day: number; // day of month of asOf
  daysInMonth: number;
  spent: number; // so far this month
  income: number; // so far this month
  /** Cumulative spending by day of this month; null after asOf. */
  daily: (number | null)[];
  lastMonth: { month: string; toDate: number; total: number; daily: number[] } | null;
  /** Average of the last `months` whole months (only those with history), cumulative by day. */
  usual: { months: number; toDate: number; total: number; incomeTotal: number; daily: number[]; low: number[]; high: number[] } | null;
  /** Month-end estimate of spending. */
  estimate: number;
  /** Month-end estimate of income (at least what came in so far). */
  incomeEstimate: number;
  /** "usual" when estimated from your usual months, "run-rate" from this month's daily average. */
  estimateFrom: "usual" | "run-rate";
}

function cumulative(flows: Map<ISODate, Flow>, month: string, days: number, key: keyof Flow): number[] {
  const out: number[] = [];
  let s = 0;
  for (let d = 1; d <= days; d++) {
    s += flows.get(`${month}-${String(d).padStart(2, "0")}`)?.[key] ?? 0;
    out.push(s);
  }
  return out;
}

/** This month's spending against last month and your usual month, at the same day. */
export function pace(l: Ledger, asOf: ISODate, months = 6): Pace {
  const [y, m, day] = parts(asOf);
  const dim = daysInMonth(y, m);
  const month = asOf.slice(0, 7);
  const hist = Math.min(months, historyMonths(l, asOf));
  const from = addMonths(`${month}-01`, -Math.max(1, hist));
  const flows = flowsByDay(l, from, monthEnd(asOf));

  const thisSpend = cumulative(flows, month, dim, "expense");
  const thisIncome = cumulative(flows, month, dim, "income");
  const spent = thisSpend[day - 1]!;
  const income = thisIncome[day - 1]!;
  const daily = thisSpend.map((v, i) => (i < day ? v : null));

  const at = (arr: number[], d: number) => arr[Math.min(d, arr.length) - 1] ?? 0;
  let lastMonth: Pace["lastMonth"] = null;
  if (hist >= 1) {
    const lm = addMonths(`${month}-01`, -1);
    const [ly, lmo] = parts(lm);
    const arr = cumulative(flows, lm.slice(0, 7), daysInMonth(ly, lmo), "expense");
    lastMonth = { month: lm.slice(0, 7), toDate: at(arr, day), total: arr[arr.length - 1] ?? 0, daily: arr };
  }

  let usual: Pace["usual"] = null;
  if (hist >= 1) {
    const sum = new Array<number>(31).fill(0);
    const low = new Array<number>(31).fill(Number.POSITIVE_INFINITY);
    const high = new Array<number>(31).fill(Number.NEGATIVE_INFINITY);
    let toDate = 0;
    let total = 0;
    let incomeTotal = 0;
    for (let i = 1; i <= hist; i++) {
      const pm = addMonths(`${month}-01`, -i);
      const [py, pmo] = parts(pm);
      const n = daysInMonth(py, pmo);
      const arr = cumulative(flows, pm.slice(0, 7), n, "expense");
      const inc = cumulative(flows, pm.slice(0, 7), n, "income");
      for (let d = 1; d <= 31; d++) {
        const v = at(arr, d);
        sum[d - 1]! += v;
        low[d - 1] = Math.min(low[d - 1]!, v);
        high[d - 1] = Math.max(high[d - 1]!, v);
      }
      toDate += at(arr, day);
      total += arr[n - 1] ?? 0;
      incomeTotal += inc[n - 1] ?? 0;
    }
    usual = {
      months: hist,
      toDate: Math.round(toDate / hist),
      total: Math.round(total / hist),
      incomeTotal: Math.round(incomeTotal / hist),
      daily: sum.slice(0, dim).map((v) => Math.round(v / hist)),
      // the band behind "usual": the lowest and highest month at each day
      low: low.slice(0, dim),
      high: high.slice(0, dim),
    };
  }

  // With 2+ months of history: what's spent so far plus what you usually spend in the rest of the month.
  const fromUsual = usual !== null && hist >= 2;
  const estimate = fromUsual ? spent + Math.max(0, usual!.total - usual!.toDate) : Math.round((spent / day) * dim);
  const incomeEstimate = Math.max(income, fromUsual ? usual!.incomeTotal : income);
  return { asOf, month, day, daysInMonth: dim, spent, income, daily, lastMonth, usual, estimate, incomeEstimate, estimateFrom: fromUsual ? "usual" : "run-rate" };
}

/* ------------------------------------------------------------------ usual */

export type UsualBy = "category" | "top" | "account" | "who" | "event" | "tag";

export interface UsualRow {
  key: string;
  name: string;
  current: number;
  usual: number;
  change: number; // current − usual
  changePct: number | null; // null when usual is 0
}

export interface Usual {
  period: Period;
  kind: "income" | "expense";
  months: number; // months of history actually averaged
  current: number;
  usual: number;
  rows: UsualRow[];
}

interface Agg {
  total: number;
  rows: Map<string, { name: string; value: number }>;
}

function aggregateBy(l: Ledger, p: Period, by: UsualBy, kind: "income" | "expense", cats: Map<string, Category>): Agg {
  const accName = new Map(l.accounts.map((a) => [a.id, a.name]));
  const rows = new Map<string, { name: string; value: number }>();
  let total = 0;
  for (const t of l.transactions) {
    if (t.void || t.date < p.from) continue;
    if (t.date > p.to) break;
    const firstAccount = t.lines.find((ln) => ln.account != null)?.account ?? "(none)";
    for (const ln of t.lines) {
      if (ln.category == null || isSystemCategory(ln.category)) continue;
      const k = cats.get(ln.category)?.kind ?? "expense";
      if (k !== kind) continue;
      const v = kind === "income" ? -ln.amount : ln.amount;
      total += v;
      const keys: [string, string][] =
        by === "category" ? [[ln.category, cats.get(ln.category)?.name ?? ln.category]]
        : by === "top" ? [[topOf(ln.category), cats.get(topOf(ln.category))?.name ?? topOf(ln.category)]]
        : by === "account" ? [[firstAccount, accName.get(firstAccount) ?? firstAccount]]
        : by === "who" ? [[t.who ?? "(none)", t.who ?? "(none)"]]
        : by === "event" ? [[t.event ?? "(none)", t.event ?? "(none)"]]
        : (t.tags?.length ? t.tags : ["(none)"]).map((g) => [g, g] as [string, string]);
      for (const [key, name] of keys) {
        const r = rows.get(key) ?? { name, value: 0 };
        r.value += v;
        rows.set(key, r);
      }
    }
  }
  return { total, rows };
}

/**
 * The periods "your usual" is averaged over, for a period:
 * - part of one month (1st … day d): days 1…d of each of the previous `months` months;
 * - whole months (n of them): the previous `months` months, scaled to n months;
 * - any other span of L days: the `months` months before it, scaled to L days.
 * Returns the windows and the factor to multiply their sum by.
 */
export function usualWindows(p: Period, months: number): { windows: Period[]; factor: number } {
  const sameMonth = p.from.slice(0, 7) === p.to.slice(0, 7);
  const wholeMonths = p.from === monthStart(p.from) && p.to === monthEnd(p.to);
  if (sameMonth && p.from === monthStart(p.from) && !wholeMonths) {
    const d = parts(p.to)[2];
    const windows: Period[] = [];
    for (let i = 1; i <= months; i++) {
      const s = addMonths(p.from, -i);
      const [y, m] = parts(s);
      windows.push({ from: s, to: `${s.slice(0, 7)}-${String(Math.min(d, daysInMonth(y, m))).padStart(2, "0")}` });
    }
    return { windows, factor: 1 / months };
  }
  if (wholeMonths) {
    const [fy, fm] = parts(p.from);
    const [ty, tm] = parts(p.to);
    const n = (ty - fy) * 12 + (tm - fm) + 1;
    const from = addMonths(p.from, -months);
    return { windows: [{ from, to: addDays(p.from, -1) }], factor: n / months };
  }
  const len = daysBetween(p.from, p.to) + 1;
  const from = addMonths(p.from, -months);
  const span = daysBetween(from, p.from);
  return { windows: [{ from, to: addDays(p.from, -1) }], factor: len / span };
}

/** Each row this period against your usual for a period of the same length, sorted by the biggest change in money. */
export function usual(l: Ledger, period: Period, by: UsualBy = "top", o: { months?: number; kind?: "income" | "expense" } = {}): Usual {
  const kind = o.kind ?? "expense";
  const want = o.months ?? 6;
  const months = Math.min(want, historyMonths(l, period.from));
  const { map: cats } = flattenCategories(l.categories);
  const cur = aggregateBy(l, period, by, kind, cats);
  const out: Usual = { period, kind, months, current: cur.total, usual: 0, rows: [] };
  const usualRows = new Map<string, { name: string; value: number }>();
  if (months > 0) {
    const { windows, factor } = usualWindows(period, months);
    let total = 0;
    for (const w of windows) {
      const a = aggregateBy(l, w, by, kind, cats);
      total += a.total;
      for (const [k, r] of a.rows) {
        const u = usualRows.get(k) ?? { name: r.name, value: 0 };
        u.value += r.value;
        usualRows.set(k, u);
      }
    }
    out.usual = Math.round(total * factor);
    for (const u of usualRows.values()) u.value = Math.round(u.value * factor);
  }
  const keys = new Set([...cur.rows.keys(), ...usualRows.keys()]);
  for (const key of keys) {
    const c = cur.rows.get(key)?.value ?? 0;
    const u = usualRows.get(key)?.value ?? 0;
    if (!c && !u) continue;
    out.rows.push({ key, name: cur.rows.get(key)?.name ?? usualRows.get(key)!.name, current: c, usual: u, change: c - u, changePct: u ? Math.round(((c - u) / Math.abs(u)) * 100) : null });
  }
  out.rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return out;
}

/* ------------------------------------------------------------------ unusual */

export type UnusualCard =
  | { kind: "category_up" | "category_down"; category: string; name: string; current: number; usual: number; changePct: number; link: string }
  | { kind: "new_category"; category: string; name: string; amount: number; link: string }
  | { kind: "new_who"; who: string; amount: number; count: number; link: string }
  | { kind: "large"; tx: string; date: ISODate; note: string; category: string; name: string; amount: number; typical: number; link: string };

function q(link: Record<string, string>): string {
  return "#/transactions?" + new URLSearchParams(link).toString();
}

/** Up to five "What's different" cards for the month of asOf (needs 2 months of history). */
export function unusual(l: Ledger, asOf: ISODate): UnusualCard[] {
  if (historyMonths(l, asOf) < 2) return [];
  const { map: cats } = flattenCategories(l.categories);
  const from = monthStart(asOf);
  const scored: { score: number; card: UnusualCard }[] = [];

  // categories far from usual (top level, month to date vs the same days of the last 6 months)
  const u = usual(l, { from, to: asOf }, "top", { months: 6 });
  const minDiff = Math.max(1, u.usual * UNUSUAL_MIN_SHARE);
  for (const r of u.rows) {
    if (r.changePct === null || Math.abs(r.changePct) < UNUSUAL_MIN_PCT || Math.abs(r.change) < minDiff) continue;
    scored.push({
      score: Math.abs(r.change),
      card: { kind: r.change > 0 ? "category_up" : "category_down", category: r.key, name: r.name, current: r.current, usual: r.usual, changePct: r.changePct, link: q({ category: r.key, from, to: asOf }) },
    });
  }

  // new categories and new people this month (never seen before this month)
  const seenCat = new Set<string>();
  const seenWho = new Set<string>();
  const newCat = new Map<string, number>();
  const newWho = new Map<string, { amount: number; count: number }>();
  const hist12 = addMonths(from, -12);
  const linesByCat = new Map<string, number[]>();
  const large: { t: Transaction; cat: string; amount: number }[] = [];
  for (const t of l.transactions) {
    if (t.void) continue;
    if (t.date > asOf) break;
    const before = t.date < from;
    const f = txFlow(t, cats);
    for (const ln of t.lines) {
      if (ln.category == null || isSystemCategory(ln.category) || (cats.get(ln.category)?.kind ?? "expense") !== "expense") continue;
      if (before) {
        seenCat.add(ln.category);
        if (t.date >= hist12 && ln.amount > 0) (linesByCat.get(ln.category) ?? linesByCat.set(ln.category, []).get(ln.category)!).push(ln.amount);
      } else {
        if (!seenCat.has(ln.category)) newCat.set(ln.category, (newCat.get(ln.category) ?? 0) + ln.amount);
        if (ln.amount > 0) large.push({ t, cat: ln.category, amount: ln.amount });
      }
    }
    if (t.who) {
      if (before) seenWho.add(t.who);
      else if (!seenWho.has(t.who) && f.expense > 0) {
        const w = newWho.get(t.who) ?? { amount: 0, count: 0 };
        w.amount += f.expense;
        w.count++;
        newWho.set(t.who, w);
      }
    }
  }
  for (const [c, amount] of newCat) {
    if (amount <= 0) continue;
    scored.push({ score: amount, card: { kind: "new_category", category: c, name: cats.get(c)?.name ?? c, amount, link: q({ category: c, from, to: asOf }) } });
  }
  for (const [who, w] of newWho) scored.push({ score: w.amount, card: { kind: "new_who", who, amount: w.amount, count: w.count, link: q({ text: who, from, to: asOf }) } });

  for (const x of large) {
    const hist = linesByCat.get(x.cat);
    if (!hist || hist.length < LARGE_MIN_SAMPLES) continue;
    const sorted = [...hist].sort((a, b) => a - b);
    const p = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * LARGE_PERCENTILE))]!;
    if (x.amount <= p) continue;
    const median = sorted[Math.floor(sorted.length / 2)]!;
    scored.push({
      score: x.amount - median,
      card: { kind: "large", tx: x.t.id, date: x.t.date, note: x.t.note ?? "", category: x.cat, name: cats.get(x.cat)?.name ?? x.cat, amount: x.amount, typical: median, link: q({ tx: x.t.id, from: x.t.date, to: x.t.date }) },
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, UNUSUAL_MAX).map((s) => s.card);
}

/* ------------------------------------------------------------------ series (chart widgets) */

export type Metric = "spending" | "income" | "net" | "balance" | "count";
export type SeriesBy = "day" | "week" | "month" | "category" | "top" | "account" | "who" | "event" | "tag";
export const PERIOD_PRESETS = ["this-month", "last-month", "last-3-months", "last-6-months", "this-year", "last-year", "last-12-months", "all"] as const;

export interface SeriesQuery {
  metric: Metric;
  category?: string;
  account?: string | string[];
  who?: string;
  event?: string;
  tag?: string;
  text?: string;
  period?: string; // a preset, yyyy-mm or yyyy
  from?: ISODate;
  to?: ISODate;
  by?: SeriesBy;
  compare?: "previous" | "usual";
  limit?: number; // rows for non-time groupings (default 10)
}

export interface SeriesPoint {
  key: string;
  name: string;
  value: number;
  compare?: number;
}

export interface Series {
  query: SeriesQuery;
  period: Period;
  by: SeriesBy;
  total: number;
  compareTotal?: number;
  points: SeriesPoint[];
}

/** A preset or yyyy-mm / yyyy, resolved against asOf. */
export function resolvePeriod(spec: string | undefined, asOf: ISODate, firstDate?: ISODate | null): Period {
  const ms = monthStart(asOf);
  switch (spec ?? "this-month") {
    case "this-month": return { from: ms, to: asOf };
    case "last-month": { const f = addMonths(ms, -1); return { from: f, to: monthEnd(f) }; }
    case "last-3-months": return { from: addMonths(ms, -2), to: asOf };
    case "last-6-months": return { from: addMonths(ms, -5), to: asOf };
    case "last-12-months": return { from: addMonths(ms, -11), to: asOf };
    case "this-year": return { from: `${asOf.slice(0, 4)}-01-01`, to: asOf };
    case "last-year": { const y = Number(asOf.slice(0, 4)) - 1; return { from: `${y}-01-01`, to: `${y}-12-31` }; }
    case "all": return { from: firstDate ?? ms, to: asOf };
  }
  if (/^\d{4}-\d{2}$/.test(spec!)) return { from: `${spec}-01`, to: monthEnd(`${spec}-01`) };
  if (/^\d{4}$/.test(spec!)) return { from: `${spec}-01-01`, to: `${spec}-12-31` };
  throw new Error(`bad period "${spec}" (${PERIOD_PRESETS.join(", ")}, yyyy-mm or yyyy)`);
}

/** Monday of the week of d. */
export function weekStart(d: ISODate): ISODate {
  const [y, m, dd] = parts(d);
  const dow = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(d, -dow);
}

function timeKeys(p: Period, by: "day" | "week" | "month"): string[] {
  if (by === "month") return monthsBetween(p.from, p.to);
  const out: string[] = [];
  let d = by === "week" ? weekStart(p.from) : p.from;
  while (d <= p.to) {
    out.push(d);
    d = addDays(d, by === "week" ? 7 : 1);
  }
  return out;
}

function matches(t: Transaction, q: SeriesQuery, accounts: Set<string> | null, text: string): boolean {
  if (accounts && !t.lines.some((ln) => ln.account && accounts.has(ln.account))) return false;
  if (q.category && !t.lines.some((ln) => ln.category === q.category || ln.category?.startsWith(q.category + "/"))) return false;
  if (q.who && t.who !== q.who) return false;
  if (q.event && t.event !== q.event) return false;
  if (q.tag && !(t.tags ?? []).includes(q.tag)) return false;
  if (text) {
    const hay = fold([t.note, t.who, t.event, ...(t.tags ?? []), ...t.lines.map((ln) => ln.note)].filter(Boolean).join(" "));
    if (!hay.includes(text)) return false;
  }
  return true;
}

function seriesOnce(l: Ledger, q: SeriesQuery, p: Period, by: SeriesBy, cats: Map<string, Category>): Map<string, { name: string; value: number }> {
  const out = new Map<string, { name: string; value: number }>();
  const accounts = q.account ? new Set(Array.isArray(q.account) ? q.account : [q.account]) : null;
  const text = q.text ? fold(q.text) : "";
  const accName = new Map(l.accounts.map((a) => [a.id, a.name]));
  const time = by === "day" || by === "week" || by === "month";
  const keyOfDate = (d: ISODate) => (by === "month" ? d.slice(0, 7) : by === "week" ? weekStart(d) : d);
  const add = (key: string, name: string, v: number) => {
    const r = out.get(key) ?? { name, value: 0 };
    r.value += v;
    out.set(key, r);
  };

  if (q.metric === "balance") {
    if (!time) throw new Error("balance needs by: day, week or month");
    const ids = accounts ?? new Set(l.accounts.map((a) => a.id));
    const keys = timeKeys(p, by as "day" | "week" | "month");
    const start = holdingsAt(l, addDays(p.from, -1));
    let bal = [...ids].reduce((s, id) => s + (start.get(id)?.amount ?? 0), 0);
    const delta = new Map<string, number>();
    for (const t of l.transactions) {
      if (t.void || t.date < p.from) continue;
      if (t.date > p.to) break;
      for (const ln of t.lines) if (ln.account && ids.has(ln.account)) delta.set(t.date, (delta.get(t.date) ?? 0) + ln.amount);
    }
    let i = 0;
    const dates = [...delta.keys()].sort();
    for (const k of keys) {
      const end = by === "month" ? monthEnd(`${k}-01`) : by === "week" ? addDays(k, 6) : k;
      while (i < dates.length && dates[i]! <= end) bal += delta.get(dates[i++]!)!;
      out.set(k, { name: k, value: bal });
    }
    return out;
  }

  if (time) for (const k of timeKeys(p, by as "day" | "week" | "month")) out.set(k, { name: k, value: 0 });
  for (const t of l.transactions) {
    if (t.void || t.date < p.from) continue;
    if (t.date > p.to) break;
    if (!matches(t, q, accounts, text)) continue;
    if (q.metric === "count") {
      const k = time ? keyOfDate(t.date) : "all";
      add(k, k, 1);
      continue;
    }
    for (const ln of t.lines) {
      if (ln.category == null || isSystemCategory(ln.category)) continue;
      if (q.category && !(ln.category === q.category || ln.category.startsWith(q.category + "/"))) continue;
      const kind = cats.get(ln.category)?.kind ?? "expense";
      const v = q.metric === "spending" ? (kind === "expense" ? ln.amount : 0) : q.metric === "income" ? (kind === "income" ? -ln.amount : 0) : -ln.amount;
      if (!v) continue;
      if (time) {
        add(keyOfDate(t.date), keyOfDate(t.date), v);
        continue;
      }
      const firstAccount = t.lines.find((x) => x.account != null)?.account ?? "(none)";
      const keys: [string, string][] =
        by === "category" ? [[ln.category, cats.get(ln.category)?.name ?? ln.category]]
        : by === "top" ? [[topOf(ln.category), cats.get(topOf(ln.category))?.name ?? topOf(ln.category)]]
        : by === "account" ? [[firstAccount, accName.get(firstAccount) ?? firstAccount]]
        : by === "who" ? [[t.who ?? "(none)", t.who ?? "(none)"]]
        : by === "event" ? [[t.event ?? "(none)", t.event ?? "(none)"]]
        : (t.tags?.length ? t.tags : ["(none)"]).map((g) => [g, g] as [string, string]);
      for (const [k, n] of keys) add(k, n, v);
    }
  }
  return out;
}

/** The data for a chart widget. */
export function series(l: Ledger, q: SeriesQuery, asOf: ISODate): Series {
  const p = q.from && q.to ? { from: q.from, to: q.to } : resolvePeriod(q.period, asOf, firstActivity(l));
  if (!isDate(p.from) || !isDate(p.to) || p.from > p.to) throw new Error("bad period");
  const by: SeriesBy = q.by ?? (q.metric === "balance" ? "month" : "top");
  const time = by === "day" || by === "week" || by === "month";
  const { map: cats } = flattenCategories(l.categories);
  const cur = seriesOnce(l, q, p, by, cats);
  let points: SeriesPoint[] = [...cur.entries()].map(([key, r]) => ({ key, name: r.name, value: r.value }));
  if (!time) points = points.filter((x) => x.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, q.limit ?? 10);
  const total = q.metric === "balance" ? (points[points.length - 1]?.value ?? 0) : [...cur.values()].reduce((s, r) => s + r.value, 0);
  const out: Series = { query: q, period: p, by, total, points };

  if (q.compare && q.metric !== "balance") {
    if (q.compare === "previous") {
      const len = daysBetween(p.from, p.to);
      const wholeMonths = p.from === monthStart(p.from) && p.to === monthEnd(p.to);
      let pp: Period;
      if (wholeMonths) {
        const n = monthsBetween(p.from, p.to).length;
        pp = { from: addMonths(p.from, -n), to: monthEnd(addMonths(p.from, -1)) };
      } else if (p.from === monthStart(p.from) && p.from.slice(0, 7) === p.to.slice(0, 7)) {
        const f = addMonths(p.from, -1);
        const [y, m] = parts(f);
        pp = { from: f, to: `${f.slice(0, 7)}-${String(Math.min(parts(p.to)[2], daysInMonth(y, m))).padStart(2, "0")}` };
      } else pp = { from: addDays(p.from, -len - 1), to: addDays(p.from, -1) };
      const prev = seriesOnce(l, q, pp, by, cats);
      out.compareTotal = [...prev.values()].reduce((s, r) => s + r.value, 0);
      if (time) {
        const pv = [...prev.values()];
        points.forEach((pt, i) => (pt.compare = pv[i]?.value ?? 0));
      } else points.forEach((pt) => (pt.compare = prev.get(pt.key)?.value ?? 0));
    } else {
      const hist = Math.min(6, historyMonths(l, p.from));
      if (hist > 0) {
        const { windows, factor } = usualWindows(p, hist);
        const acc = new Map<string, number>();
        let tot = 0;
        for (const w of windows) {
          for (const [k, r] of seriesOnce(l, q, w, time ? "month" : by, cats)) {
            tot += r.value;
            acc.set(k, (acc.get(k) ?? 0) + r.value);
          }
        }
        out.compareTotal = Math.round(tot * factor);
        if (time) {
          // spread the usual total evenly over the buckets: a flat "usual" line per bucket
          const per = points.length ? Math.round(out.compareTotal / points.length) : 0;
          points.forEach((pt) => (pt.compare = per));
        } else points.forEach((pt) => (pt.compare = Math.round((acc.get(pt.key) ?? 0) * factor)));
      }
    }
  }
  return out;
}
