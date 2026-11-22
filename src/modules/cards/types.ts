import type { TypeDef } from "../../engine/registry.js";

export const CARD_TYPES: Record<string, TypeDef> = {
  credit_card: {
    label: { en: "Credit card", vi: "Thẻ tín dụng" },
    liability: true,
    details: {
      statement_day: { kind: "day", note: "day of month the statement closes" },
      due_day: { kind: "day", note: "day of month payment is due" },
      limit: { kind: "int" },
      bank: { kind: "string" },
      number_last4: { kind: "string" },
      annual_fee: { kind: "int" },
      fee_month: { kind: "int", note: "month (1-12) the annual fee is charged" },
      free_days_max: { kind: "int" },
    },
  },
};
