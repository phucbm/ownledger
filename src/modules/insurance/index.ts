import type { ModuleDef } from "../types.js";
import { isOpen } from "../util.js";
import { INSURANCE_TYPES } from "./types.js";

/** Premiums due come through plans (kind insurance_premium) in "Needs you" via the loans module's plan items. */
export const insuranceModule: ModuleDef = {
  name: "insurance",
  types: INSURANCE_TYPES,
  on: (l, asOf) => l.accounts.some((a) => a.type in INSURANCE_TYPES && isOpen(a, asOf)) || l.plans.some((p) => p.kind === "insurance_premium"),
};
