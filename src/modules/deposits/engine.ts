import { holdingsAt } from "../../engine/balances.js";
import { addMonths, daysBetween } from "../../engine/dates.js";
import type { ISODate, Ledger } from "../../engine/types.js";
import { date, isOpen as open, num } from "../util.js";

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

