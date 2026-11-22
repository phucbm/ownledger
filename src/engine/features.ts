import { holdingsAt } from "./balances.js";
import { historyMonths } from "./insights.js";
import type { FileMap } from "./load.js";
import { typeDef } from "./registry.js";
import type { ISODate, Ledger } from "./types.js";
import { MODULES } from "../modules/index.js";

/** What the ledger has. The dashboard builds its nav, pages, sections and widget catalogue from this. */
export interface Features {
  empty: boolean; // no transactions at all
  historyMonths: number; // whole months of history before this one
  accounts: number; // open accounts, the "My money" pool counted as one when it's on
  modules: string[]; // modules that are on
  cards: boolean;
  deposits: boolean;
  holdings: boolean;
  liabilities: boolean; // a loan, bnpl or anything owed
  plans: boolean;
  imports: boolean; // a mapping in imports/
  who: boolean;
  event: boolean;
  tags: boolean;
  budgets: boolean;
}

export function features(l: Ledger, asOf: ISODate, files: FileMap = {}, pool: string[] = []): Features {
  const open = l.accounts.filter((a) => !(a.closed && a.closed <= asOf));
  const hs = holdingsAt(l, asOf);
  const modules = MODULES.filter((m) => m.on(l, asOf, files)).map((m) => m.name);
  let who = false, event = false, tags = false, live = 0;
  for (const t of l.transactions) {
    if (t.void) continue;
    live++;
    if (t.who) who = true;
    if (t.event) event = true;
    if (t.tags?.length) tags = true;
  }
  return {
    empty: live === 0,
    historyMonths: historyMonths(l, asOf),
    accounts: pool.length > 1 ? open.length - pool.length + 1 : open.length,
    modules,
    cards: modules.includes("cards"),
    deposits: modules.includes("deposits"),
    holdings: open.some((a) => typeDef(a.type)?.holdings || (a.asset !== undefined && a.asset !== l.meta.base)),
    liabilities: open.some((a) => typeDef(a.type)?.liability && a.type !== "credit_card") || open.some((a) => (hs.get(a.id)?.amount ?? 0) < 0 && a.type !== "credit_card"),
    plans: l.plans.length > 0,
    imports: Object.keys(files).some((p) => /^imports\/[^/]+\.mapping\.yaml$/.test(p)),
    who,
    event,
    tags,
    budgets: l.budgets.length > 0,
  };
}
