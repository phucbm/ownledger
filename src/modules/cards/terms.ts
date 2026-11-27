import type { Account, Ledger } from "../../engine/types.js";
import { day, int, num, str } from "../util.js";

/* ------------------------------------------------------------------ the card terms in an account's details */

export interface CashbackRule {
  categories: string[]; // category paths (prefix match)
  /** words looked for in a transaction's merchant and note (accents and case ignored); a merchant rule wins over a category rule */
  merchants: string[];
  rate: number | null; // %; null = not known yet (a name gives the categories, never the rate)
  /** the most this rule pays per period (the global cap still applies on top) */
  cap: number | null;
  /** the bank pays it only for in-store payments (the ledger can't tell, so it's a reminder) */
  inStore: boolean;
  label: string | null;
}

/** Days before the statement date a purchase should be made to be sure it posts in time. */
export const DEFAULT_POST_MARGIN = 3;

export interface CashbackTerms {
  base: number; // % on everything else
  rules: CashbackRule[];
  cap: { amount: number; per: "statement" | "month" } | null;
  min_spend: { amount: number; per: "statement" | "month" } | null;
  spend_max: { amount: number; per: "statement" | "month" } | null;
  paid_on: { kind: "next_statement" } | { kind: "days_after"; days: number };
  /** days before the statement date that are too late to be sure a purchase lands on this statement */
  postMargin: number;
  /** auto: the bank pays it (to the card or an account); points: a balance the owner cashes in */
  payout: "auto" | "points";
  /** points: cash in only from this balance */
  redeemMin: number | null;
  /** points: earned points expire this many months after their statement */
  expireMonths: number | null;
}

export interface FeeWaiver {
  spend: number;
  within: "year";
}

export interface CardTerms {
  statementDay: number | null;
  dueDay: number | null;
  limit: number | null;
  bank: string | null;
  last4: string | null;
  annualFee: number | null;
  feeMonth: number | null; // 1-12; also the first month of the card year
  feeWaiver: FeeWaiver | null;
  freeDaysMax: number | null;
  cashback: CashbackTerms | null;
}

const per = (v: unknown): "statement" | "month" => (v === "month" ? "month" : "statement");
function amountPer(v: unknown): { amount: number; per: "statement" | "month" } | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return { amount: v, per: "statement" };
  if (v && typeof v === "object") {
    const a = int((v as Record<string, unknown>).amount);
    if (a !== undefined && a > 0) return { amount: a, per: per((v as Record<string, unknown>).per) };
  }
  return null;
}

export function parseCashback(v: unknown): CashbackTerms | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  const rules: CashbackRule[] = [];
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : typeof v === "string" && v.trim() ? [v.trim()] : []);
  for (const r of Array.isArray(c.rules) ? c.rules : []) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const categories = strings(x.categories);
    const merchants = strings(x.merchants);
    if (!categories.length && !merchants.length) continue;
    const cap = amountPer(x.cap)?.amount ?? null;
    rules.push({ categories, merchants, rate: num(x.rate) ?? null, cap, inStore: x.in_store === true, label: str(x.label) ?? null });
  }
  const paid = typeof c.paid_on === "string" ? c.paid_on : "next_statement";
  const m = /^days_after:(\d+)$/.exec(paid);
  return {
    base: num(c.base) ?? 0,
    rules,
    cap: amountPer(c.cap),
    min_spend: amountPer(c.min_spend),
    spend_max: amountPer(c.spend_max),
    paid_on: m ? { kind: "days_after", days: Number(m[1]) } : { kind: "next_statement" },
    postMargin: validMargin(c.post_margin_days) ? (c.post_margin_days as number) : DEFAULT_POST_MARGIN,
    payout: c.payout === "points" ? "points" : "auto",
    redeemMin: c.payout === "points" ? (amountPer(c.redeem_min)?.amount ?? null) : null,
    expireMonths: c.payout === "points" && Number.isInteger(c.expire_months) && (c.expire_months as number) > 0 ? (c.expire_months as number) : null,
  };
}

export const validMargin = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10;

/** Terms from the card account's details, with what the card record (cards.yaml) adds for debit cards. */
export function termsOf(a: Account, record?: CardRecord): CardTerms {
  const d = { ...(record?.kind !== "credit" ? pickTerms(record) : {}), ...(a.details ?? {}) } as Record<string, unknown>;
  const fw = d.fee_waiver as Record<string, unknown> | undefined;
  const spend = fw && typeof fw === "object" ? int(fw.spend) : undefined;
  const feeMonth = int(d.fee_month);
  return {
    statementDay: day(d.statement_day) ?? null,
    dueDay: day(d.due_day) ?? null,
    limit: int(d.limit) ?? null,
    bank: str(d.bank) ?? record?.bank ?? null,
    last4: str(d.number_last4) ?? record?.last4 ?? null,
    annualFee: int(d.annual_fee) ?? record?.annual_fee ?? null,
    feeMonth: feeMonth && feeMonth >= 1 && feeMonth <= 12 ? feeMonth : null,
    feeWaiver: spend && spend > 0 ? { spend, within: "year" } : null,
    freeDaysMax: int(d.free_days_max) ?? null,
    cashback: parseCashback(d.cashback),
  };
}

function pickTerms(r?: CardRecord): Record<string, unknown> {
  if (!r) return {};
  const out: Record<string, unknown> = {};
  for (const k of ["statement_day", "cashback", "fee_month", "fee_waiver", "annual_fee"]) if (r[k] !== undefined) out[k] = r[k];
  return out;
}

/* ------------------------------------------------------------------ the cards list (data/cards.yaml) */

export const CARDS_FILE = "data/cards.yaml";
export const STATEMENTS_FILE = "data/cards/statements.yaml";

export interface CardRecord {
  id: string;
  kind: "credit" | "debit" | "atm";
  account?: string;
  bank?: string;
  name?: string;
  network?: string;
  last4?: string;
  status?: "active" | "locked" | "inactive" | "cancelled";
  issued?: string;
  activated?: string;
  cancelled?: string;
  locked?: string;
  physical?: "physical" | "virtual" | "both";
  apple_pay?: boolean;
  annual_fee?: number;
  close_fee?: number;
  benefits?: number;
  cancel_plan?: { by?: string; note?: string };
  keep_for_limit?: boolean;
  fees_url?: string;
  note?: string;
  [k: string]: unknown;
}

export interface BankStatement {
  account: string;
  statement_date: string;
  amount: number;
}

export interface CardsData {
  records: CardRecord[];
  statements: BankStatement[];
}

/** The cards module's data, loaded with the ledger (see ModuleDef.load). */
export function cardsData(l: Ledger): CardsData {
  return (l.ext?.cards as CardsData | undefined) ?? { records: [], statements: [] };
}

/** data/cards/statements.yaml with these bank amounts set (one per account + statement date), sorted. */
export function withBankAmounts(l: Ledger, set: BankStatement[]): BankStatement[] {
  const key = (x: BankStatement) => `${x.account}|${x.statement_date}`;
  const keys = new Set(set.map(key));
  const list = [...cardsData(l).statements.filter((x) => !keys.has(key(x))), ...set];
  return list.sort((x, y) => (x.statement_date < y.statement_date ? -1 : x.statement_date > y.statement_date ? 1 : x.account < y.account ? -1 : 1));
}

export function recordFor(l: Ledger, account: string): CardRecord | undefined {
  return cardsData(l).records.find((r) => r.account === account);
}

/* ------------------------------------------------------------------ codes in MISA wallet names */

/** Category emoji → category path. The owner's mapping can add its own (mapping key `card_emoji`). */
export const DEFAULT_CARD_EMOJI: Record<string, string> = {
  "🛒": "shopping",
  "🏋": "health/sport",
  "🍿": "fun/entertainment",
  "📞": "subscriptions",
  "🍜": "food/eating-out",
  "☕": "food/cafe",
  "⛽": "transport/fuel",
  "✈": "fun/trips",
};

export interface NameCodes {
  details: Record<string, unknown>;
  warnings: string[];
}

const VS = "️?"; // optional emoji variation selector

/**
 * Reads the card terms the owner writes into a wallet name: 🗓️7 statement day, 💸3 due day, category emoji
 * before the first "•" (cashback categories), 🎉02/25 the card's anniversary (fee month), 1-5tr the cashback
 * spend band, *4506 the last 4 digits. Anything that looks like a code but can't be read is a warning.
 */
export function parseCardName(name: string, emoji: Record<string, string> = DEFAULT_CARD_EMOJI): NameCodes {
  const details: Record<string, unknown> = {};
  const warnings: string[] = [];
  const sd = new RegExp(`🗓${VS}\\s*(\\d{1,2})`, "u").exec(name);
  if (sd) {
    const v = Number(sd[1]);
    if (v >= 1 && v <= 31) details.statement_day = v;
    else warnings.push(`"${name}": statement day ${sd[1]} is not 1-31`);
  } else if (name.includes("🗓")) warnings.push(`"${name}": 🗓️ without a day`);
  const dd = new RegExp(`💸${VS}\\s*(\\d{1,2})`, "u").exec(name);
  if (dd) {
    const v = Number(dd[1]);
    if (v >= 1 && v <= 31) details.due_day = v;
    else warnings.push(`"${name}": due day ${dd[1]} is not 1-31`);
  } else if (name.includes("💸")) warnings.push(`"${name}": 💸 without a day`);
  const an = new RegExp(`🎉${VS}\\s*(\\d{1,2})/(\\d{2})`, "u").exec(name);
  if (an) {
    const m = Number(an[1]);
    if (m >= 1 && m <= 12) {
      details.fee_month = m;
      details.anniversary = `20${an[2]}-${String(m).padStart(2, "0")}`;
    } else warnings.push(`"${name}": 🎉 month ${an[1]} is not 1-12`);
  } else if (name.includes("🎉")) warnings.push(`"${name}": 🎉 without MM/YY`);
  const band = /(?:^|[\s•])(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*tr\b/u.exec(name);
  const cb: Record<string, unknown> = {};
  if (band) {
    const a = Math.round(Number(band[1]!.replace(",", ".")) * 1_000_000);
    const b = Math.round(Number(band[2]!.replace(",", ".")) * 1_000_000);
    if (a < b) {
      cb.min_spend = { amount: a, per: "statement" };
      cb.spend_max = { amount: b, per: "statement" };
    } else warnings.push(`"${name}": spend band ${band[0].trim()} has min ≥ max`);
  }
  const last4 = /\*(\d{4})(?!\d)/.exec(name);
  if (last4) details.number_last4 = last4[1];
  // category emoji: everything before the first "•" (or the whole name when there's no "•")
  const head = name.split("•")[0]!;
  const cats: string[] = [];
  for (const ch of head.replace(/️/g, "")) {
    if (!/\p{Extended_Pictographic}/u.test(ch) || ["🗓", "💸", "🎉"].includes(ch)) continue;
    const path = emoji[ch];
    if (path) cats.push(path);
    else warnings.push(`"${name}": no category for ${ch} (add it to card_emoji in the mapping)`);
  }
  if (cats.length) cb.rules = [{ categories: cats, rate: null }];
  if (Object.keys(cb).length) details.cashback = cb;
  return { details, warnings };
}

/**
 * Merges codes read from a wallet name into an account's details. `from_name` lists the keys a name gave;
 * any other key already set is the owner's (through Claude or by hand) and is never overwritten by a re-import.
 * Returns null when nothing changes.
 */
export function mergeNameCodes(current: Record<string, unknown> | undefined, codes: Record<string, unknown>): Record<string, unknown> | null {
  const cur = current ?? {};
  const fromName = new Set(Array.isArray(cur.from_name) ? (cur.from_name as string[]) : []);
  const out: Record<string, unknown> = { ...cur };
  let changed = false;
  for (const [k, v] of Object.entries(codes)) {
    if (cur[k] !== undefined && !fromName.has(k)) {
      if (k !== "cashback" || typeof cur.cashback !== "object" || !cur.cashback) continue;
      // the owner's cashback terms win; a name only fills keys they haven't set
      const merged = { ...(v as object), ...(cur.cashback as object) };
      if (JSON.stringify(merged) !== JSON.stringify(cur.cashback)) {
        out.cashback = merged;
        changed = true;
      }
      continue;
    }
    fromName.add(k);
    if (JSON.stringify(cur[k]) !== JSON.stringify(v)) {
      out[k] = v;
      changed = true;
    }
  }
  if (!changed) return null;
  out.from_name = [...fromName].sort();
  return out;
}
