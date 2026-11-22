import { holdingsAt } from "./balances.js";
import { flattenCategories } from "./categories.js";
import { isDate, monthEnd, monthStart } from "./dates.js";
import { typeDef } from "./registry.js";
import type { Account, ISODate, Ledger } from "./types.js";
import { cards, type CardStatus } from "../modules/cards/engine.js";
import { deposits, type DepositStatus } from "../modules/deposits/engine.js";
import { plansDue, type DueItem } from "../modules/loans/engine.js";

// Moved into their modules (plan 003); re-exported so the engine's API stays the same.
export * from "../modules/cards/engine.js";
export * from "../modules/deposits/engine.js";
export * from "../modules/loans/engine.js";

const open = (a: Account, asOf: ISODate) => !(isDate(a.closed) && a.closed <= asOf);

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
