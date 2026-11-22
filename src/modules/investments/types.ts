import type { TypeDef } from "../../engine/registry.js";

export const INVESTMENT_TYPES: Record<string, TypeDef> = {
  gold: { label: { en: "Gold", vi: "Vàng" }, holdings: true },
  fund: { label: { en: "Fund", vi: "Chứng chỉ quỹ" }, holdings: true, details: { broker: { kind: "string" } } },
  stock: { label: { en: "Stocks", vi: "Cổ phiếu" }, holdings: true, details: { broker: { kind: "string" } } },
  etf: { label: { en: "ETF", vi: "Quỹ ETF" }, holdings: true, details: { broker: { kind: "string" } } },
  crypto: { label: { en: "Crypto", vi: "Tiền mã hoá" }, holdings: true },
};
