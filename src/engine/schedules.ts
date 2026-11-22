import { holdingsAt } from "./balances.js";
import { flattenCategories } from "./categories.js";
import { addDays, addMonths, dayIn, daysBetween, isDate, monthEnd, monthStart, parts } from "./dates.js";
import { typeDef } from "./registry.js";
import type { Account, ISODate, Ledger, Plan } from "./types.js";

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const day = (v: unknown): number | undefined => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31 ? (v as number) : undefined);
const date = (v: unknown): ISODate | undefined => (isDate(v) ? v : undefined);
const open = (a: Account, asOf: ISODate) => !(isDate(a.closed) && a.closed <= asOf);

/* ------------------------------------------------------------------ cards */

export interface CardStatus {
  account: string;
  name: string;
  owed: number; // positive = owed now
  limit: number | null;
  available: number | null;
  statementDate: ISODate | null; // last statement closed on or before asOf
  statementBalance: number | null; // owed at that statement
  paidSinceStatement: number;
  toPay: number | null; // what is left to pay for that statement
  dueDate: ISODate | null;
  daysToDue: number | null;
  /** details.bank and details.product as the owner wrote them (product: the card's real product name), or null */
  bank: string | null;
  product: string | null;
  period: CardPeriod;
}

/**
 * What happened on a card in the current statement period (day after the last statement → asOf), or in the
 * calendar month when the card has no statement_day. Only transactions where the card is the only account count
 * towards spending; transfers and card payments never do.
 */
export interface CardPeriod {
  from: ISODate;
  to: ISODate;
  basis: "statement" | "month";
  /** expense lines paid with the card (before refunds) */
  spent: number;
  /** expense lines refunded to the card */
  refunds: number;
  /** spent - refunds, per expense category path, largest first */
  byCategory: { category: string; amount: number }[];
  /** income under the `cashback` category (and its children) credited to the card */
  cashback: number;
  /** transactions that touch the card together with other accounts and categories: not split, left out of the figures above */
  mixed: number;
}

function cardPeriod(l: Ledger, card: string, from: ISODate, to: ISODate, basis: CardPeriod["basis"], kinds: Map<string, string>): CardPeriod {
  let spent = 0;
  let refunds = 0;
  let cashback = 0;
  let mixed = 0;
  const by = new Map<string, number>();
  for (const t of l.transactions) {
    if (t.void || t.date < from || t.date > to) continue;
    if (!t.lines.some((ln) => ln.account === card)) continue;
    const cats = t.lines.filter((ln) => ln.category !== undefined);
    if (!cats.length) continue; // a transfer or card payment
    if (t.lines.some((ln) => ln.account !== undefined && ln.account !== card)) {
      mixed++;
      continue;
    }
    for (const ln of cats) {
      const c = ln.category!;
      if (kinds.get(c) === "expense") {
        if (ln.amount > 0) spent += ln.amount;
        else refunds -= ln.amount;
        by.set(c, (by.get(c) ?? 0) + ln.amount);
      } else if (kinds.get(c) === "income" && (c === "cashback" || c.startsWith("cashback/"))) {
        cashback -= ln.amount;
      }
    }
  }
  const byCategory = [...by].filter(([, a]) => a !== 0).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  return { from, to, basis, spent, refunds, byCategory, cashback, mixed };
}

export function cards(l: Ledger, asOf: ISODate): CardStatus[] {
  const now = holdingsAt(l, asOf);
  const kinds = new Map([...flattenCategories(l.categories).map].map(([p, c]) => [p, c.kind as string]));
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const out: CardStatus[] = [];
  for (const a of l.accounts) {
    if (a.type !== "credit_card" || !open(a, asOf)) continue;
    const d = a.details ?? {};
    const sd = day(d.statement_day);
    const dd = day(d.due_day);
    const limit = num(d.limit) ?? null;
    const owed = -(now.get(a.id)?.amount ?? 0);
    let statementDate: ISODate | null = null;
    let statementBalance: number | null = null;
    let paid = 0;
    let dueDate: ISODate | null = null;
    if (sd) {
      const [y, m] = parts(asOf);
      statementDate = dayIn(y, m, sd);
      if (statementDate > asOf) {
        const prev = addMonths(`${asOf.slice(0, 7)}-01`, -1);
        statementDate = dayIn(...(parts(prev).slice(0, 2) as [number, number]), sd);
      }
      statementBalance = -(holdingsAt(l, statementDate).get(a.id)?.amount ?? 0);
      for (const t of l.transactions) {
        if (t.void || t.date <= statementDate || t.date > asOf) continue;
        for (const ln of t.lines) if (ln.account === a.id && ln.amount > 0) paid += ln.amount;
      }
      if (dd) {
        const [sy, sm] = parts(statementDate);
        dueDate = dayIn(sy, sm, dd);
        if (dueDate <= statementDate) {
          const nx = addMonths(`${statementDate.slice(0, 7)}-01`, 1);
          dueDate = dayIn(...(parts(nx).slice(0, 2) as [number, number]), dd);
        }
      }
    }
    const toPay = statementBalance === null ? null : Math.max(0, statementBalance - paid);
    out.push({
      account: a.id,
      name: a.name,
      owed,
      limit,
      available: limit === null ? null : limit - owed,
      statementDate,
      statementBalance,
      paidSinceStatement: paid,
      toPay,
      dueDate,
      daysToDue: dueDate ? daysBetween(asOf, dueDate) : null,
      bank: str(d.bank),
      product: str(d.product),
      period: statementDate
        ? cardPeriod(l, a.id, addDays(statementDate, 1), asOf, "statement", kinds)
        : cardPeriod(l, a.id, monthStart(asOf), asOf, "month", kinds),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ plans */

export interface PlanStatus {
  plan: string;
  name: string;
  kind: string;
  account: string;
  perPayment: number;
  count: number | null;
  paidCount: number;
  paidAmount: number;
  left: number | null; // payments left
  leftAmount: number | null;
  next: ISODate | null;
  overdue: ISODate[];
  finished: boolean;
}

const STEP = { month: 1, quarter: 3, year: 12 } as const;

export function perPayment(p: Plan): number {
  if (p.amount !== undefined) return p.amount + (p.fee ?? 0);
  if (p.principal !== undefined && p.count) return Math.round(p.principal / p.count) + (p.fee ?? 0);
  return 0;
}

/** Due dates of a plan, the first `n` (or until `until`). */
export function dueDates(p: Plan, until: ISODate, max = 1000): ISODate[] {
  const out: ISODate[] = [];
  const step = STEP[p.every as keyof typeof STEP] ?? 1;
  const d0 = parts(p.start)[2];
  for (let i = 0; i < max; i++) {
    if (p.count !== undefined && i >= p.count) break;
    const d = addMonths(p.start, i * step, d0);
    if (d > until) break;
    if (p.end && d > p.end) break;
    out.push(d);
  }
  return out;
}

export function planStatus(l: Ledger, asOf: ISODate): PlanStatus[] {
  const paid = new Map<string, { n: number; amount: number }>();
  const accOf = new Map(l.plans.map((p) => [p.id, p.account]));
  for (const t of l.transactions) {
    if (t.void || !t.plan) continue;
    const acc = accOf.get(t.plan);
    const s = paid.get(t.plan) ?? { n: 0, amount: 0 };
    s.n++;
    s.amount += t.lines.filter((ln) => ln.account === acc).reduce((x, ln) => x + Math.abs(ln.amount), 0);
    paid.set(t.plan, s);
  }
  return l.plans.map((p) => {
    const per = perPayment(p);
    const s = paid.get(p.id) ?? { n: 0, amount: 0 };
    const horizon = addDays(asOf, 3660);
    const all = dueDates(p, horizon);
    const dueByNow = all.filter((d) => d <= asOf);
    const overdue = dueByNow.slice(s.n);
    const next = all[s.n] ?? null;
    const count = p.count ?? null;
    const left = count === null ? null : Math.max(0, count - s.n);
    return {
      plan: p.id,
      name: p.name ?? p.note ?? p.id,
      kind: p.kind,
      account: p.account,
      perPayment: per,
      count,
      paidCount: s.n,
      paidAmount: s.amount,
      left,
      leftAmount: left === null ? null : left * per,
      next,
      overdue,
      finished: left === 0 || (Boolean(p.end) && !next),
    };
  });
}

export interface DueItem {
  plan: string;
  name: string;
  account: string;
  date: ISODate;
  amount: number;
  overdue: boolean;
}

/** Plan payments due from (earliest unpaid) through asOf + days. */
export function plansDue(l: Ledger, asOf: ISODate, days = 30): DueItem[] {
  const until = addDays(asOf, days);
  const out: DueItem[] = [];
  for (const st of planStatus(l, asOf)) {
    const p = l.plans.find((x) => x.id === st.plan)!;
    const dates = dueDates(p, until).slice(st.paidCount);
    for (const d of dates) out.push({ plan: p.id, name: st.name, account: p.account, date: d, amount: st.perPayment, overdue: d < asOf });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ------------------------------------------------------------------ deposits */

export interface DepositStatus {
  account: string;
  name: string;
  balance: number;
  principal: number;
  rate: number | null;
  start: ISODate | null;
  maturity: ISODate | null;
  daysToMaturity: number | null;
  interestAtMaturity: number | null; // simple interest, actual/365
  rollover: string | null;
}

export function deposits(l: Ledger, asOf: ISODate): DepositStatus[] {
  const hs = holdingsAt(l, asOf);
  const out: DepositStatus[] = [];
  for (const a of l.accounts) {
    if (a.type !== "deposit" || !open(a, asOf)) continue;
    const d = a.details ?? {};
    const balance = hs.get(a.id)?.amount ?? 0;
    const principal = num(d.principal) ?? balance;
    const rate = num(d.rate) ?? null;
    const start = date(d.start) ?? date(a.opened) ?? null;
    const term = num(d.term_months);
    const maturity = date(d.maturity) ?? (start && term ? addMonths(start, term) : null);
    const interest = rate !== null && start && maturity ? Math.round((principal * rate * daysBetween(start, maturity)) / 36500) : null;
    out.push({
      account: a.id,
      name: a.name,
      balance,
      principal,
      rate,
      start,
      maturity,
      daysToMaturity: maturity ? daysBetween(asOf, maturity) : null,
      interestAtMaturity: interest,
      rollover: typeof d.rollover === "string" ? d.rollover : null,
    });
  }
  return out.sort((a, b) => (a.maturity ?? "9999") < (b.maturity ?? "9999") ? -1 : 1);
}

/* ------------------------------------------------------------------ budgets */

export interface BudgetStatus {
  category: string;
  every: "month" | "year";
  amount: number;
  spent: number;
  left: number;
  over: boolean;
}

export function budgets(l: Ledger, asOf: ISODate): BudgetStatus[] {
  const { map } = flattenCategories(l.categories);
  return l.budgets.map((b) => {
    const every = b.every ?? "month";
    const from = every === "month" ? monthStart(asOf) : `${asOf.slice(0, 4)}-01-01`;
    const to = every === "month" ? monthEnd(asOf) : `${asOf.slice(0, 4)}-12-31`;
    const kind = map.get(b.category)?.kind ?? "expense";
    let spent = 0;
    for (const t of l.transactions) {
      if (t.void || t.date < from || t.date > to) continue;
      for (const ln of t.lines) {
        if (ln.category === b.category || ln.category?.startsWith(b.category + "/")) spent += kind === "income" ? -ln.amount : ln.amount;
      }
    }
    return { category: b.category, every, amount: b.amount, spent, left: b.amount - spent, over: spent > b.amount };
  });
}

/* ------------------------------------------------------------------ today */

export interface Today {
  date: ISODate;
  due: DueItem[]; // plan payments overdue or due within 7 days
  cards: CardStatus[]; // cards with something to pay and due within 10 days (or overdue)
  maturing: DepositStatus[]; // deposits maturing within 30 days
  overBudget: BudgetStatus[];
  odd: string[]; // things worth a look
}

export function today(l: Ledger, asOf: ISODate): Today {
  const odd: string[] = [];
  const hs = holdingsAt(l, asOf);
  for (const a of l.accounts) {
    if (!open(a, asOf)) continue;
    const v = hs.get(a.id)?.amount ?? 0;
    const def = typeDef(a.type);
    if (v < 0 && def && !def.liability && !def.holdings) odd.push(`${a.name} (${a.id}) is negative: ${v}`);
  }
  return {
    date: asOf,
    due: plansDue(l, asOf, 7),
    cards: cards(l, asOf).filter((c) => (c.toPay ?? 0) > 0 && c.daysToDue !== null && c.daysToDue <= 10),
    maturing: deposits(l, asOf).filter((d) => d.daysToMaturity !== null && d.daysToMaturity <= 30),
    overBudget: budgets(l, asOf).filter((b) => b.over),
    odd,
  };
}
