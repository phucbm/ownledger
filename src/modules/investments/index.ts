import { accountValues } from "../../engine/balances.js";
import type { ModuleDef } from "../types.js";
import { isOpen } from "../util.js";
import { INVESTMENT_TYPES } from "./types.js";

export const investmentsModule: ModuleDef = {
  name: "investments",
  types: INVESTMENT_TYPES,
  on: (l, asOf) => l.accounts.some((a) => isOpen(a, asOf) && (a.type in INVESTMENT_TYPES || (a.asset && a.asset !== l.meta.base))),
  attention(l, asOf) {
    const unpriced = accountValues(l, asOf).filter((v) => !v.priced && (v.qty ?? 0) !== 0 && isOpen(v.account, asOf));
    if (!unpriced.length) return [];
    return [{
      kind: "unpriced",
      module: "investments",
      severity: "info",
      date: asOf,
      title: `${unpriced.length} holding(s) have no price: valued at cost (${unpriced.map((v) => v.account.id).join(", ")})`,
      count: unpriced.length,
      params: { accounts: unpriced.map((v) => v.account.name).join(", "), assets: [...new Set(unpriced.map((v) => v.asset))].join(", ") },
      link: "#/accounts",
      ask: true,
    }];
  },
};
