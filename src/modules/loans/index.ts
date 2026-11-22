import type { ModuleDef } from "../types.js";
import { isOpen } from "../util.js";
import { plansDue } from "./engine.js";
import { LOAN_TYPES } from "./types.js";

export const loansModule: ModuleDef = {
  name: "loans",
  types: LOAN_TYPES,
  on: (l, asOf) => l.plans.length > 0 || l.accounts.some((a) => a.type in LOAN_TYPES && isOpen(a, asOf)),
  attention(l, asOf) {
    return plansDue(l, asOf, 7).map((d) => {
      const days = Math.round((Date.parse(d.date) - Date.parse(asOf)) / 86400000);
      return {
        kind: d.overdue ? "plan_overdue" : "plan_due",
        module: "loans",
        severity: d.overdue ? "red" : "amber",
        date: d.date,
        title: `${d.overdue ? "Overdue" : "Due"}: ${d.name} ${d.amount} on ${d.date}`,
        amount: d.amount,
        account: d.account,
        name: d.name,
        days,
        params: { plan: d.plan },
        link: "#/plans",
        ask: true,
      } as const;
    });
  },
};
