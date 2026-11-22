import type { TypeDef } from "../../engine/registry.js";

export const LOAN_TYPES: Record<string, TypeDef> = {
  bnpl: { label: { en: "Buy now pay later", vi: "Mua trước trả sau" }, liability: true, details: { provider: { kind: "string" }, limit: { kind: "int" }, due_day: { kind: "day" } } },
  loan_given: { label: { en: "Loan given", vi: "Cho vay" }, details: { borrower: { kind: "string" }, rate: { kind: "number" } } },
  loan_taken: { label: { en: "Loan taken", vi: "Đi vay" }, liability: true, details: { lender: { kind: "string" }, rate: { kind: "number" } } },
};
