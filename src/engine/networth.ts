import { PriceBook, valueAccount, type AccountValue, type Holding } from "./balances.js";
import { monthEnd } from "./dates.js";
import { typeDef } from "./registry.js";
import { monthsBetween } from "./reports.js";
import type { ISODate, Ledger } from "./types.js";

export interface NetWorth {
  date: ISODate;
  assets: number;
  liabilities: number; // negative or 0
  net: number;
  byType: Record<string, number>;
  unpriced: string[]; // holdings valued at cost because no price was found
}

function summarise(date: ISODate, vals: AccountValue[]): NetWorth {
  let assets = 0;
  let liabilities = 0;
  const byType: Record<string, number> = {};
  const unpriced: string[] = [];
  for (const v of vals) {
    if (v.value === 0 && (v.qty ?? 0) === 0) continue;
    const liability = Boolean(typeDef(v.account.type)?.liability) || v.value < 0;
    if (liability && v.value < 0) liabilities += v.value;
    else assets += v.value;
    byType[v.account.type] = (byType[v.account.type] ?? 0) + v.value;
    if (!v.priced) unpriced.push(v.account.id);
  }
  return { date, assets, liabilities, net: assets + liabilities, byType, unpriced };
}

export function netWorth(l: Ledger, asOf: ISODate): NetWorth {
  const prices = new PriceBook(l.prices);
  const hs = new Map<string, Holding>(l.accounts.map((a) => [a.id, { amount: 0, qty: 0 }]));
  for (const t of l.transactions) {
    if (t.void) continue;
    if (t.date > asOf) break;
    for (const ln of t.lines) {
      if (ln.account == null) continue;
      const h = hs.get(ln.account);
      if (!h) continue;
      h.amount += ln.amount;
      if (typeof ln.qty === "number") h.qty += ln.qty;
    }
  }
  return summarise(asOf, l.accounts.map((a) => valueAccount(l, a, hs.get(a.id)!, prices, asOf)));
}

/** Net worth at the end of each month from `from` to `to` (one pass over the ledger). */
export function netWorthSeries(l: Ledger, from: ISODate, to: ISODate): NetWorth[] {
  const prices = new PriceBook(l.prices);
  const hs = new Map<string, Holding>(l.accounts.map((a) => [a.id, { amount: 0, qty: 0 }]));
  const out: NetWorth[] = [];
  let i = 0;
  const txs = l.transactions;
  for (const mk of monthsBetween(from, to)) {
    const end = monthEnd(`${mk}-01`);
    const at = end > to ? to : end;
    while (i < txs.length && txs[i]!.date <= at) {
      const t = txs[i++]!;
      if (t.void) continue;
      for (const ln of t.lines) {
        if (ln.account == null) continue;
        const h = hs.get(ln.account);
        if (!h) continue;
        h.amount += ln.amount;
        if (typeof ln.qty === "number") h.qty += ln.qty;
      }
    }
    out.push(summarise(at, l.accounts.map((a) => valueAccount(l, a, hs.get(a.id)!, prices, at))));
  }
  return out;
}
