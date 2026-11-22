/**
 * Account types the engine knows. A type not listed here is still accepted: it loads as a plain
 * account (balance only) with a warning. Details keys not listed are kept and passed through.
 */
export type DetailKind = "int" | "number" | "day" | "date" | "string" | "boolean";

export interface TypeDef {
  label: { en: string; vi: string };
  /** true when money in this account is the user's own cash-like money (counted as liquid). */
  liquid?: boolean;
  /** true when the balance is normally negative (money owed). */
  liability?: boolean;
  /** true when the account holds a non-base asset counted in qty (gold, funds...). */
  holdings?: boolean;
  details?: Record<string, { kind: DetailKind; required?: boolean; note?: string }>;
}

export const TYPES: Record<string, TypeDef> = {
  cash: { label: { en: "Cash", vi: "Tiền mặt" }, liquid: true },
  bank: { label: { en: "Bank account", vi: "Tài khoản ngân hàng" }, liquid: true, details: { bank: { kind: "string" }, number_last4: { kind: "string" } } },
  ewallet: { label: { en: "E-wallet", vi: "Ví điện tử" }, liquid: true, details: { provider: { kind: "string" } } },
  credit_card: {
    label: { en: "Credit card", vi: "Thẻ tín dụng" },
    liability: true,
    details: {
      statement_day: { kind: "day", note: "day of month the statement closes" },
      due_day: { kind: "day", note: "day of month payment is due" },
      limit: { kind: "int" },
      bank: { kind: "string" },
    },
  },
  bnpl: { label: { en: "Buy now pay later", vi: "Mua trước trả sau" }, liability: true, details: { provider: { kind: "string" }, limit: { kind: "int" }, due_day: { kind: "day" } } },
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
  gold: { label: { en: "Gold", vi: "Vàng" }, holdings: true },
  fund: { label: { en: "Fund", vi: "Chứng chỉ quỹ" }, holdings: true, details: { broker: { kind: "string" } } },
  stock: { label: { en: "Stocks", vi: "Cổ phiếu" }, holdings: true, details: { broker: { kind: "string" } } },
  etf: { label: { en: "ETF", vi: "Quỹ ETF" }, holdings: true, details: { broker: { kind: "string" } } },
  crypto: { label: { en: "Crypto", vi: "Tiền mã hoá" }, holdings: true },
  insurance: { label: { en: "Insurance", vi: "Bảo hiểm" }, details: { insurer: { kind: "string" }, cash_value: { kind: "int" } } },
  loan_given: { label: { en: "Loan given", vi: "Cho vay" }, details: { borrower: { kind: "string" }, rate: { kind: "number" } } },
  loan_taken: { label: { en: "Loan taken", vi: "Đi vay" }, liability: true, details: { lender: { kind: "string" }, rate: { kind: "number" } } },
  other: { label: { en: "Other", vi: "Khác" } },
};

export function typeDef(type: string): TypeDef | undefined {
  return Object.prototype.hasOwnProperty.call(TYPES, type) ? TYPES[type] : undefined;
}
