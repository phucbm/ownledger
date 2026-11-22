import { holdingsAt } from "../../engine/balances.js";
import { addMonths, dayIn, daysBetween, parts } from "../../engine/dates.js";
import type { ISODate, Ledger } from "../../engine/types.js";
import { day, isOpen as open, num } from "../util.js";

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
}

export function cards(l: Ledger, asOf: ISODate): CardStatus[] {
  const now = holdingsAt(l, asOf);
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
    });
  }
  return out;
}

