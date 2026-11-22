import { holdingsAt } from "../../engine/balances.js";
import { flattenCategories } from "../../engine/categories.js";
import { addDays, addMonths, dayIn, daysBetween, monthStart, parts } from "../../engine/dates.js";
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

