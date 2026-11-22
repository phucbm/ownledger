import { CARD_TYPES } from "../modules/cards/types.js";
import { DEPOSIT_TYPES } from "../modules/deposits/types.js";
import { INSURANCE_TYPES } from "../modules/insurance/types.js";
import { INVESTMENT_TYPES } from "../modules/investments/types.js";
import { LOAN_TYPES } from "../modules/loans/types.js";

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


/** Core types: everyday money. The other types belong to modules (src/modules/<name>/types.ts). */
export const CORE_TYPES: Record<string, TypeDef> = {
  cash: { label: { en: "Cash", vi: "Tiền mặt" }, liquid: true },
  bank: { label: { en: "Bank account", vi: "Tài khoản ngân hàng" }, liquid: true, details: { bank: { kind: "string" }, number_last4: { kind: "string" } } },
  ewallet: { label: { en: "E-wallet", vi: "Ví điện tử" }, liquid: true, details: { provider: { kind: "string" } } },
};

export const TYPES: Record<string, TypeDef> = {
  ...CORE_TYPES,
  ...CARD_TYPES,
  ...LOAN_TYPES,
  ...DEPOSIT_TYPES,
  ...INVESTMENT_TYPES,
  ...INSURANCE_TYPES,
  other: { label: { en: "Other", vi: "Khác" } },
};

export function typeDef(type: string): TypeDef | undefined {
  return Object.prototype.hasOwnProperty.call(TYPES, type) ? TYPES[type] : undefined;
}
