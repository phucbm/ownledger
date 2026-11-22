import type { TypeDef } from "../../engine/registry.js";

export const DEPOSIT_TYPES: Record<string, TypeDef> = {
  deposit: {
    label: { en: "Term deposit", vi: "Tiền gửi có kỳ hạn" },
    details: {
      bank: { kind: "string" },
      principal: { kind: "int" },
      rate: { kind: "number", note: "annual %" },
      term_months: { kind: "int" },
      start: { kind: "date" },
      maturity: { kind: "date" },
      rollover: { kind: "string", note: "none | principal | principal_interest" },
    },
  },
  savings_goal: { label: { en: "Savings goal", vi: "Mục tiêu tiết kiệm" }, details: { target: { kind: "int" }, by: { kind: "date" } } },
};
