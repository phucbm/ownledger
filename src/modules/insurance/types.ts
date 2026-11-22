import type { TypeDef } from "../../engine/registry.js";

export const INSURANCE_TYPES: Record<string, TypeDef> = {
  insurance: { label: { en: "Insurance", vi: "Bảo hiểm" }, details: { insurer: { kind: "string" }, cash_value: { kind: "int" } } },
};
