import type { ModuleDef } from "../types.js";
import { isOpen } from "../util.js";
import { deposits } from "./engine.js";
import { DEPOSIT_TYPES } from "./types.js";

export const depositsModule: ModuleDef = {
  name: "deposits",
  types: DEPOSIT_TYPES,
  on: (l, asOf) => l.accounts.some((a) => a.type in DEPOSIT_TYPES && isOpen(a, asOf)),
  attention(l, asOf) {
    return deposits(l, asOf)
      .filter((d) => d.daysToMaturity !== null && d.daysToMaturity <= 30 && d.maturity)
      .map((d) => ({
        kind: d.daysToMaturity! < 0 ? "deposit_matured" : "deposit_maturing",
        module: "deposits",
        severity: d.daysToMaturity! <= 7 ? "amber" : "info",
        date: d.maturity!,
        title: `Deposit ${d.name} matures on ${d.maturity}`,
        amount: d.balance + (d.interestAtMaturity ?? 0),
        account: d.account,
        name: d.name,
        days: d.daysToMaturity!,
        link: `#/transactions?account=${encodeURIComponent(d.account)}`,
      }));
  },
};
