import { addDays, addMonths, parts } from "../../engine/dates.js";
import type { ISODate, Ledger, Plan } from "../../engine/types.js";

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

