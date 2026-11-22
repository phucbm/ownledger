import { typeDef } from "./registry.js";
import type { Account, ISODate, Ledger, Price, Transaction } from "./types.js";

export interface Holding {
  /** Sum of line amounts (base currency). For base-currency accounts this is the balance; for holdings it is the net cost. */
  amount: number;
  /** Sum of qty (non-base assets only). */
  qty: number;
}

export function live(l: Ledger): Transaction[] {
  return l.transactions.filter((t) => !t.void);
}

/** Balances of every account at the end of `asOf` (inclusive). Accounts with no lines are 0. */
export function holdingsAt(l: Ledger, asOf?: ISODate): Map<string, Holding> {
  const out = new Map<string, Holding>();
  for (const a of l.accounts) out.set(a.id, { amount: 0, qty: 0 });
  for (const t of l.transactions) {
    if (t.void) continue;
    if (asOf && t.date > asOf) break; // sorted by date
    for (const ln of t.lines) {
      if (ln.account == null) continue;
      const h = out.get(ln.account) ?? { amount: 0, qty: 0 };
      h.amount += ln.amount;
      if (typeof ln.qty === "number") h.qty += ln.qty;
      out.set(ln.account, h);
    }
  }
  return out;
}

export class PriceBook {
  private by = new Map<string, Price[]>();
  constructor(prices: Price[]) {
    for (const p of prices) {
      const arr = this.by.get(p.asset) ?? [];
      arr.push(p);
      this.by.set(p.asset, arr);
    }
    for (const arr of this.by.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  /** Latest price on or before `date`, or undefined. */
  at(asset: string, date: ISODate): Price | undefined {
    const arr = this.by.get(asset);
    if (!arr) return undefined;
    let lo = 0;
    let hi = arr.length - 1;
    let found: Price | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid]!.date <= date) {
        found = arr[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }
}

export interface AccountValue {
  account: Account;
  asset: string;
  /** Value in base currency: balance for base accounts; qty × latest price for holdings (net cost if no price). */
  value: number;
  /** Net cost (sum of amounts). */
  cost: number;
  qty: number | null;
  price: Price | null;
  priced: boolean;
}

export function valueAccount(l: Ledger, a: Account, h: Holding, prices: PriceBook, asOf: ISODate): AccountValue {
  const base = l.meta.base;
  const asset = a.asset ?? base;
  if (asset === base) return { account: a, asset, value: h.amount, cost: h.amount, qty: null, price: null, priced: true };
  const p = prices.at(asset, asOf);
  if (!p) return { account: a, asset, value: h.amount, cost: h.amount, qty: h.qty, price: null, priced: false };
  return { account: a, asset, value: Math.round(h.qty * p.price), cost: h.amount, qty: h.qty, price: p, priced: true };
}

export function accountValues(l: Ledger, asOf: ISODate): AccountValue[] {
  const hs = holdingsAt(l, asOf);
  const prices = new PriceBook(l.prices);
  return l.accounts.map((a) => valueAccount(l, a, hs.get(a.id) ?? { amount: 0, qty: 0 }, prices, asOf));
}

export function isLiabilityType(type: string): boolean {
  return Boolean(typeDef(type)?.liability);
}
