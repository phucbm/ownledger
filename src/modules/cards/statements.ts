import { holdingsAt } from "../../engine/balances.js";
import { flattenCategories, isSystemCategory, topOf } from "../../engine/categories.js";
import { addDays, addMonths, dayIn, daysBetween, monthStart, parts } from "../../engine/dates.js";
import type { Account, Category, ISODate, Ledger, Plan, Transaction } from "../../engine/types.js";
import { dueDates } from "../loans/engine.js";
import { isOpen } from "../util.js";
import { fold } from "../../engine/reports.js";
import { cardsData, recordFor, termsOf, type CardRecord, type CardTerms, type CashbackRule, type CashbackTerms } from "./terms.js";

/* ------------------------------------------------------------------ dates */

/** The statement date in month (y, m). */
export const closeIn = (y: number, m: number, sd: number) => dayIn(y, m, sd);

/** The first statement date on or after d. */
export function closeOnOrAfter(d: ISODate, sd: number): ISODate {
  const [y, m] = parts(d);
  const c = closeIn(y, m, sd);
  if (c >= d) return c;
  const [ny, nm] = parts(addMonths(monthStart(d), 1));
  return closeIn(ny, nm, sd);
}

/** The statement date just before close c. */
export function prevClose(c: ISODate, sd: number): ISODate {
  const [y, m] = parts(addMonths(monthStart(c), -1));
  return closeIn(y, m, sd);
}

/** The next statement date after close c. */
export function nextClose(c: ISODate, sd: number): ISODate {
  const [y, m] = parts(addMonths(monthStart(c), 1));
  return closeIn(y, m, sd);
}

/** The due date of the statement that closes on c (the first due day after it). */
export function dueAfter(c: ISODate, dd: number): ISODate {
  const [y, m] = parts(c);
  const d = dayIn(y, m, dd);
  if (d > c) return d;
  const [ny, nm] = parts(addMonths(monthStart(c), 1));
  return dayIn(ny, nm, dd);
}

/** Pay a purchase made on `date` by this date to pay no interest: the due date of the statement it falls into. */
export function interestFreeUntil(t: CardTerms, date: ISODate): ISODate | null {
  if (!t.statementDay || !t.dueDay) return null;
  return dueAfter(closeOnOrAfter(date, t.statementDay), t.dueDay);
}

/* ------------------------------------------------------------------ what a card line is */

export type LineKind = "purchase" | "fee" | "charge" | "payment" | "refund" | "cashback" | "adjust";

const FEE_TOP = new Set(["bank-fees"]);
const ANNUAL_FEE_RE = /thường niên|thuong nien|phí năm|annual fee|ptn\b/i;

/** What one transaction does to a card account (by its card lines and the other lines). */
export function lineKind(t: Transaction, account: string, cats: Map<string, Category>): { kind: LineKind; amount: number } | null {
  let amount = 0;
  for (const ln of t.lines) if (ln.account === account) amount += ln.amount;
  if (!amount) return null;
  const catLines = t.lines.filter((ln) => ln.category != null);
  const real = catLines.filter((ln) => !isSystemCategory(ln.category!));
  if (catLines.length && !real.length) return { kind: "adjust", amount };
  if (amount < 0) {
    if (real.some((ln) => FEE_TOP.has(topOf(ln.category!)))) return { kind: "fee", amount: -amount };
    if (real.length) return { kind: "purchase", amount: -amount };
    return { kind: "charge", amount: -amount }; // money moved out of the card to another account (cash advance, transfer)
  }
  if (real.some((ln) => topOf(ln.category!) === "cashback" || (cats.get(ln.category!)?.kind === "income"))) return { kind: "cashback", amount };
  if (real.length) return { kind: "refund", amount };
  return { kind: "payment", amount };
}

export function isAnnualFee(t: Transaction): boolean {
  return t.lines.some((ln) => ln.category && FEE_TOP.has(topOf(ln.category))) && ANNUAL_FEE_RE.test([t.note, ...t.lines.map((l) => l.note)].filter(Boolean).join(" "));
}

/* ------------------------------------------------------------------ statements */

export interface Statement {
  from: ISODate; // first day of the period
  close: ISODate; // statement date (or asOf for the open period)
  open: boolean; // the current period, not closed yet
  opening: number; // owed at the start (positive = owed)
  purchases: number;
  refunds: number;
  cashback: number;
  fees: number;
  charges: number; // moves out of the card (cash advance, transfers)
  payments: number; // payments made during this period (they pay the statement before)
  adjust: number;
  closing: number; // owed at close
  /** Part of the closing balance that is 0% instalments not billed yet. */
  deferred: number;
  /** What this statement asks you to pay: the bank's amount when entered, else closing − deferred. */
  amountDue: number;
  bank: number | null; // the bank's amount, when entered
  bankDiff: number | null; // computed − bank
  due: ISODate | null;
  paidByDue: number;
  paid: number; // paid after close so far (up to the next close or asOf)
  toPay: number;
  status: "none" | "paid" | "due" | "late" | "partly" | "unpaid" | "open";
}

interface InstalmentPlan {
  plan: Plan;
  sourceDate: ISODate;
  principalPer: number;
  count: number;
}

function instalmentsOf(l: Ledger, account: string): InstalmentPlan[] {
  const byId = new Map(l.transactions.map((t) => [t.id, t]));
  const out: InstalmentPlan[] = [];
  for (const p of l.plans) {
    if (p.kind !== "instalment" || p.account !== account || !p.count) continue;
    const src = typeof p.source === "string" ? byId.get(p.source) : undefined;
    const principalPer = p.amount ?? (p.principal !== undefined ? Math.round(p.principal / p.count) : 0);
    out.push({ plan: p, sourceDate: src?.date ?? p.start, principalPer, count: p.count });
  }
  return out;
}

/** Instalment principal included in the balance at close c but billed on later statements. */
function deferredAt(ins: InstalmentPlan[], c: ISODate): number {
  let s = 0;
  for (const i of ins) {
    if (i.sourceDate > c) continue;
    const billed = dueDates(i.plan, c).length;
    s += i.principalPer * Math.max(0, i.count - billed);
  }
  return s;
}

/** Every statement period of a credit card from its first transaction to asOf (the last one open). */
export function statements(l: Ledger, account: string, asOf: ISODate): Statement[] {
  const a = l.accounts.find((x) => x.id === account);
  if (!a) throw new Error(`no account ${account}`);
  const t = termsOf(a, recordFor(l, account));
  const sd = t.statementDay;
  if (!sd) return [];
  const { map: cats } = flattenCategories(l.categories);
  const txs = l.transactions.filter((x) => !x.void && x.date <= asOf && x.lines.some((ln) => ln.account === account));
  if (!txs.length) return [];
  const bankAmounts = new Map(cardsData(l).statements.filter((s) => s.account === account).map((s) => [s.statement_date, s.amount]));
  const ins = instalmentsOf(l, account);

  // owed at the end of each day, from one pass
  const owedAt = (d: ISODate) => -(holdingsAt(l, d).get(account)?.amount ?? 0);
  const closes: ISODate[] = [];
  for (let c = closeOnOrAfter(txs[0]!.date, sd); c <= asOf; c = nextClose(c, sd)) closes.push(c);

  const out: Statement[] = [];
  const periods: { from: ISODate; close: ISODate; open: boolean }[] = closes.map((c) => ({ from: addDays(prevClose(c, sd), 1), close: c, open: false }));
  const lastClose = closes[closes.length - 1];
  if (!lastClose || lastClose < asOf) periods.push({ from: lastClose ? addDays(lastClose, 1) : addDays(prevClose(closeOnOrAfter(txs[0]!.date, sd), sd), 1), close: asOf, open: true });

  for (const p of periods) {
    const s: Statement = {
      from: p.from, close: p.close, open: p.open, opening: owedAt(addDays(p.from, -1)), purchases: 0, refunds: 0, cashback: 0, fees: 0, charges: 0, payments: 0, adjust: 0,
      closing: 0, deferred: 0, amountDue: 0, bank: null, bankDiff: null, due: null, paidByDue: 0, paid: 0, toPay: 0, status: "open",
    };
    for (const x of txs) {
      if (x.date < p.from || x.date > p.close) continue;
      const k = lineKind(x, account, cats);
      if (!k) continue;
      if (k.kind === "purchase") s.purchases += k.amount;
      else if (k.kind === "fee") s.fees += k.amount;
      else if (k.kind === "charge") s.charges += k.amount;
      else if (k.kind === "payment") s.payments += k.amount;
      else if (k.kind === "refund") s.refunds += k.amount;
      else if (k.kind === "cashback") s.cashback += k.amount;
      else s.adjust += -k.amount;
    }
    s.closing = owedAt(p.close);
    s.deferred = deferredAt(ins, p.close);
    if (!p.open) {
      const computed = Math.max(0, s.closing - s.deferred);
      const bank = bankAmounts.get(p.close);
      s.bank = bank ?? null;
      s.bankDiff = bank === undefined ? null : computed - bank;
      s.amountDue = bank ?? computed;
      s.due = t.dueDay ? dueAfter(p.close, t.dueDay) : null;
      const until = nextClose(p.close, sd) < asOf ? nextClose(p.close, sd) : asOf;
      for (const x of txs) {
        if (x.date <= p.close || x.date > until) continue;
        const k = lineKind(x, account, cats);
        if (k?.kind !== "payment") continue;
        s.paid += k.amount;
        if (s.due && x.date <= s.due) s.paidByDue += k.amount;
      }
      s.toPay = Math.max(0, s.amountDue - s.paid);
      s.status =
        s.amountDue <= 0 ? "none"
        : s.paidByDue >= s.amountDue ? "paid"
        : !s.due || asOf <= s.due ? "due"
        : s.paid >= s.amountDue ? "late"
        : s.paid > 0 ? "partly"
        : "unpaid";
    }
    out.push(s);
  }
  return out;
}

/* ------------------------------------------------------------------ cashback */

export interface CashbackGroup {
  /** the rule's label, else its categories and merchants; "other" for the base rate */
  label: string;
  categories: string[];
  merchants: string[];
  rate: number | null;
  spend: number;
  earned: number; // before the minimum and the global cap, after the rule's cap
  cap: number | null;
  /** more spend this rule still pays for (its cap and the global cap left); null when it has no cap */
  room: number | null;
  inStore: boolean;
}

export interface CashbackPeriod {
  from: ISODate;
  close: ISODate;
  open: boolean;
  spend: number; // eligible spending on the card in the period (refunds take it down)
  byRate: { rate: number | null; spend: number; categories: string[] }[];
  groups: CashbackGroup[];
  expected: number; // from the rules (0 when the minimum spend isn't reached)
  incomplete: boolean; // some spending is in a category whose rate isn't known
  minSpend: number | null;
  minMet: boolean;
  needForMin: number; // more spending to reach the minimum (0 when met)
  cap: number | null;
  capLeft: number | null;
  received: number; // cashback rows that pay this period (by paid_on); for points cards: points cashed in then
  payBy: ISODate; // when the bank should have paid it
  /** open period: the statement date it will close on */
  closesOn?: ISODate;
  /** open period: the last day a purchase is sure to land on this statement (closesOn − post margin) */
  safeUntil?: ISODate;
  /** open period: days from asOf to safeUntil (0 = today is the last day; negative = too late, it counts for the next one) */
  daysLeft?: number;
  /** open period: more spend worth making on the whole card, when no rule has its own cap (spend_max, or the global cap ÷ the best rate) */
  roomSpend?: number | null;
  /** roomSpend comes from the global cap and the best rate, not from spend_max */
  roomEstimate?: boolean;
  /** open period: cashback still to earn before the caps (null with no cap at all) */
  earnLeft?: number | null;
}

/** Folded words of a transaction a merchant rule looks in. */
const merchantText = (x: Transaction) => fold(`${x.merchant ?? ""} ${x.note ?? ""}`);

function ruleFor(cb: CashbackTerms, category: string, text?: string): CashbackRule | null {
  if (text) for (const r of cb.rules) if (r.merchants.some((m) => text.includes(fold(m)))) return r;
  for (const r of cb.rules) if (r.categories.some((c) => category === c || category.startsWith(c + "/"))) return r;
  return null;
}

const ruleLabel = (r: CashbackRule) => r.label ?? [...r.categories, ...r.merchants].join(", ");

/** The statement date the open period will close on (the first one after asOf). */
export function openClose(asOf: ISODate, sd: number): ISODate {
  return closeOnOrAfter(addDays(asOf, 1), sd);
}

/** Cashback periods: the statement periods (credit) or monthly cycles from statement_day (debit cards). */
function cyclesFor(l: Ledger, account: string, sd: number, asOf: ISODate, from: ISODate): { from: ISODate; close: ISODate; open: boolean }[] {
  void l;
  const out: { from: ISODate; close: ISODate; open: boolean }[] = [];
  let c = closeOnOrAfter(from, sd);
  for (; c <= asOf; c = nextClose(c, sd)) out.push({ from: addDays(prevClose(c, sd), 1), close: c, open: false });
  out.push({ from: addDays(prevClose(c, sd), 1), close: asOf, open: true });
  return out;
}

/** Cashback rows booked for this card in [from, to]: on the card, or elsewhere carrying card: <account>. */
function cashbackIn(txs: Transaction[], account: string, cats: Map<string, Category>, from: ISODate, to: ISODate): { date: ISODate; amount: number }[] {
  const out: { date: ISODate; amount: number }[] = [];
  for (const x of txs) {
    if (x.date < from || x.date > to) continue;
    const k = lineKind(x, account, cats);
    let a = 0;
    if (k?.kind === "cashback") a = k.amount;
    else if (x.card === account && !x.lines.some((ln) => ln.account === account)) {
      for (const ln of x.lines) if (ln.category && topOf(ln.category) === "cashback") a += -ln.amount;
    }
    if (a) out.push({ date: x.date, amount: a });
  }
  return out;
}

/** Expected against received cashback, per statement (or cashback cycle), for a card with cashback terms. */
export function cashback(l: Ledger, account: string, asOf: ISODate): CashbackPeriod[] {
  const a = l.accounts.find((x) => x.id === account);
  if (!a) throw new Error(`no account ${account}`);
  const t = termsOf(a, recordFor(l, account));
  const cb = t.cashback;
  if (!cb) return [];
  const sd = t.statementDay ?? 1;
  const { map: cats } = flattenCategories(l.categories);
  const txs = l.transactions.filter((x) => !x.void && x.date <= addMonths(asOf, 2) && (x.lines.some((ln) => ln.account === account) || x.card === account));
  if (!txs.length) return [];
  const hasMerchantRules = cb.rules.some((r) => r.merchants.length);
  const out: CashbackPeriod[] = [];
  for (const p of cyclesFor(l, account, sd, asOf, txs[0]!.date)) {
    // one group per rule (by its index), "base" for everything else
    const groups = new Map<string, { rule: CashbackRule | null; spend: number; categories: Set<string> }>();
    let spend = 0;
    for (const x of txs) {
      if (x.date < p.from || x.date > p.close || x.date > asOf) continue;
      const k = lineKind(x, account, cats);
      if (!k || (k.kind !== "purchase" && k.kind !== "refund")) continue;
      const text = hasMerchantRules ? merchantText(x) : undefined;
      for (const ln of x.lines) {
        if (!ln.category || isSystemCategory(ln.category) || cats.get(ln.category)?.kind === "income") continue;
        const rule = ruleFor(cb, ln.category, text);
        const key = rule ? String(cb.rules.indexOf(rule)) : "base";
        const g = groups.get(key) ?? { rule, spend: 0, categories: new Set<string>() };
        g.spend += ln.amount;
        g.categories.add(ln.category);
        groups.set(key, g);
        spend += ln.amount;
      }
    }
    // every rule shows in the open period, spent on or not, so its room is known
    if (p.open) cb.rules.forEach((r, i) => { if (!groups.has(String(i))) groups.set(String(i), { rule: r, spend: 0, categories: new Set() }); });
    const minSpend = cb.min_spend?.amount ?? null;
    const minMet = minSpend === null || spend >= minSpend;
    const scale = cb.spend_max && spend > cb.spend_max.amount ? cb.spend_max.amount / spend : 1;
    let raw = 0;
    let incomplete = false;
    const list: CashbackGroup[] = [];
    for (const g of groups.values()) {
      const rate = g.rule ? g.rule.rate : cb.base;
      let earned = 0;
      if (rate === null) {
        if (g.spend > 0) incomplete = true;
      } else {
        earned = (Math.max(0, g.spend) * rate) / 100;
        if (g.rule?.cap != null) earned = Math.min(earned, g.rule.cap);
      }
      raw += earned;
      list.push({
        label: g.rule ? ruleLabel(g.rule) : "other",
        categories: g.rule ? (g.rule.categories.length ? g.rule.categories : [...g.categories]) : [...g.categories],
        merchants: g.rule?.merchants ?? [],
        rate,
        spend: g.spend,
        earned: Math.round(earned),
        cap: g.rule?.cap ?? null,
        room: null,
        inStore: g.rule?.inStore ?? false,
      });
    }
    let expected = minMet ? Math.round(raw * scale) : 0;
    const cap = cb.cap?.amount ?? null;
    if (cap !== null) expected = Math.min(expected, cap);
    // room: what the caps still pay for, counted on what was earned before the minimum (the minimum is its own warning)
    const globalLeft = cap === null ? null : Math.max(0, cap - Math.round(raw * scale));
    for (const g of list) {
      if (g.cap === null || !g.rate) continue;
      let left = Math.max(0, g.cap - g.earned);
      if (globalLeft !== null) left = Math.min(left, globalLeft);
      g.room = Math.ceil((left * 100) / g.rate);
    }
    const byRateMap = new Map<string, { rate: number | null; spend: number; categories: string[] }>();
    for (const g of list) {
      if (!g.spend && !g.categories.length) continue;
      const r = byRateMap.get(String(g.rate)) ?? { rate: g.rate, spend: 0, categories: [] };
      r.spend += g.spend;
      r.categories.push(...g.categories.filter((c) => !r.categories.includes(c)));
      byRateMap.set(String(g.rate), r);
    }
    const payBy = cb.paid_on.kind === "next_statement" ? nextClose(p.open ? closeOnOrAfter(p.close, sd) : p.close, sd) : addDays(p.close, cb.paid_on.days);
    const winFrom = p.open ? payBy : addDays(p.close, 1);
    const received = p.open ? 0 : cashbackIn(txs, account, cats, winFrom, payBy).reduce((s, x) => s + x.amount, 0);
    const row: CashbackPeriod = {
      from: p.from, close: p.close, open: p.open, spend,
      byRate: [...byRateMap.values()].filter((r) => r.spend !== 0).sort((x, y) => y.spend - x.spend),
      groups: list.filter((g) => p.open || g.spend !== 0).sort((x, y) => (y.rate ?? -1) - (x.rate ?? -1)),
      expected, incomplete, minSpend, minMet, needForMin: minSpend === null ? 0 : Math.max(0, minSpend - spend),
      cap, capLeft: cap === null ? null : Math.max(0, cap - expected), received, payBy,
    };
    if (p.open) {
      const closesOn = openClose(asOf, sd);
      const safeUntil = addDays(closesOn, -cb.postMargin);
      const ruleCaps = list.some((g) => g.room !== null);
      const best = Math.max(0, ...list.map((g) => g.rate ?? 0));
      let roomSpend: number | null = null;
      let roomEstimate = false;
      if (!ruleCaps) {
        if (cb.spend_max) roomSpend = Math.max(0, cb.spend_max.amount - spend);
        else if (globalLeft !== null && best > 0) {
          roomSpend = Math.ceil((globalLeft * 100) / best);
          roomEstimate = true;
        }
      }
      const groupLeft = list.reduce((s, g) => s + (g.cap !== null && g.rate ? Math.max(0, g.cap - g.earned) : 0), 0);
      const earnLeft = ruleCaps ? (globalLeft === null ? groupLeft : Math.min(groupLeft, globalLeft)) : globalLeft;
      Object.assign(row, { closesOn, safeUntil, daysLeft: daysBetween(asOf, safeUntil), roomSpend, roomEstimate, earnLeft });
    }
    out.push(row);
  }
  return out;
}

/* ------------------------------------------------------------------ points */

export interface PointsStatus {
  account: string;
  name: string;
  /** points held now: earned at each closed statement, less cashed in and expired */
  balance: number;
  /** earned in the open period, added at its statement date */
  pending: number;
  redeemMin: number | null;
  /** balance ≥ redeemMin (or no minimum known) */
  canRedeem: boolean;
  /** points still held, oldest first, with when they expire (null = no expiry known) */
  lots: { close: ISODate; left: number; expires: ISODate | null }[];
  expired: number;
}

/** A points card's balance (details.cashback.payout: points); null for other cards. */
export function points(l: Ledger, account: string, asOf: ISODate): PointsStatus | null {
  const a = l.accounts.find((x) => x.id === account);
  if (!a) return null;
  const cb = termsOf(a, recordFor(l, account)).cashback;
  if (!cb || cb.payout !== "points") return null;
  const periods = cashback(l, account, asOf);
  const { map: cats } = flattenCategories(l.categories);
  const txs = l.transactions.filter((x) => !x.void && x.date <= asOf && (x.lines.some((ln) => ln.account === account) || x.card === account));
  const lots = periods.filter((p) => !p.open && p.expected > 0).map((p) => ({ close: p.close, left: p.expected, expires: cb.expireMonths ? addMonths(p.close, cb.expireMonths) : null }));
  let expired = 0;
  const expireBefore = (d: ISODate) => {
    for (const x of lots) if (x.left > 0 && x.expires && x.expires < d) { expired += x.left; x.left = 0; }
  };
  const cashed = periods.length ? cashbackIn(txs, account, cats, periods[0]!.from, asOf).sort((x, y) => (x.date < y.date ? -1 : 1)) : [];
  for (const r of cashed) {
    expireBefore(r.date);
    let left = r.amount;
    for (const x of lots) {
      if (left <= 0) break;
      if (x.close >= r.date || x.left <= 0) continue;
      const take = Math.min(x.left, left);
      x.left -= take;
      left -= take;
    }
  }
  expireBefore(addDays(asOf, 1));
  const held = lots.filter((x) => x.left > 0);
  const balance = held.reduce((s, x) => s + x.left, 0);
  const open = periods.find((p) => p.open);
  return {
    account,
    name: a.name,
    balance,
    pending: open?.expected ?? 0,
    redeemMin: cb.redeemMin,
    canRedeem: balance > 0 && (cb.redeemMin === null || balance >= cb.redeemMin),
    lots: held,
    expired,
  };
}

/* ------------------------------------------------------------------ which card to use */

export interface BestCard {
  account: string;
  name: string;
  rate: number | null;
  earn: number | null; // cashback this purchase would earn (cap left respected), null when the rate is unknown
  capLeft: number | null; // cashback left under the caps that apply (the rule's and the card's)
  minSpendShort: number; // spend still missing for the minimum, after this purchase (0 = fine)
  payBy: ISODate | null;
  freeDays: number | null;
  limitLeft: number | null;
  /** the rule that applies (its label), when the card has one for this purchase */
  rule?: string | null;
  /** the bank pays this rule only in store */
  inStore?: boolean;
  /** the last day a purchase is sure to land on this statement; after it, it counts for the next one */
  safeUntil?: ISODate | null;
  /** the purchase date is after safeUntil: it may post on the next statement (its minimum and caps) */
  nextPeriod?: boolean;
  reason: string; // one line, plain English (the dashboard builds its own in the UI language)
}

export function bestCard(l: Ledger, q: { category: string; amount?: number; date: ISODate; merchant?: string }): BestCard[] {
  const amount = q.amount ?? 0;
  const owed = holdingsAt(l, q.date);
  const recs = cardsData(l).records;
  const text = q.merchant ? fold(q.merchant) : undefined;
  const candidates: { a: Account; rec?: CardRecord }[] = [];
  for (const a of l.accounts) {
    if (!isOpen(a, q.date)) continue;
    const rec = recs.find((r) => r.account === a.id);
    if (rec && (rec.status === "cancelled" || rec.status === "locked" || rec.status === "inactive")) continue;
    if (a.type === "credit_card" || (rec && rec.kind === "debit" && rec.cashback)) candidates.push({ a, rec });
  }
  const out: BestCard[] = [];
  for (const { a, rec } of candidates) {
    const t = termsOf(a, rec);
    const cb = t.cashback;
    const rule = cb ? ruleFor(cb, q.category, text) : null;
    const rate = cb ? (rule ? rule.rate : cb.base) : null;
    let capLeft: number | null = null;
    let minShort = 0;
    let safeUntil: ISODate | null = null;
    let nextPeriod = false;
    if (cb) {
      const cur = cashback(l, a.id, q.date).find((p) => p.open);
      const g = rule && cur ? cur.groups.find((x) => x.label === ruleLabel(rule)) : undefined;
      const ruleLeft = rule?.cap != null ? Math.max(0, rule.cap - (g?.earned ?? 0)) : null;
      const cardLeft = cb.cap ? (cur?.capLeft ?? cb.cap.amount) : null;
      capLeft = ruleLeft === null ? cardLeft : cardLeft === null ? ruleLeft : Math.min(ruleLeft, cardLeft);
      if (cb.min_spend) minShort = Math.max(0, cb.min_spend.amount - ((cur?.spend ?? 0) + amount));
      if (a.type === "credit_card" && t.statementDay) {
        safeUntil = cur?.safeUntil ?? null;
        nextPeriod = safeUntil !== null && q.date > safeUntil;
      }
    }
    const raw = rate === null ? null : Math.round((amount * rate) / 100);
    const earn = raw === null ? null : capLeft === null ? raw : Math.min(raw, capLeft);
    const payBy = a.type === "credit_card" ? interestFreeUntil(t, q.date) : null;
    const freeDays = payBy ? daysBetween(q.date, payBy) : null;
    const limitLeft = t.limit === null ? null : t.limit + (owed.get(a.id)?.amount ?? 0);
    const bits = [
      rate === null ? "cashback rate not set" : `${rate}%${rule && (rule.label || rule.merchants.length) ? ` on ${ruleLabel(rule)}` : ""}${capLeft !== null ? ` (cap left ${capLeft})` : ""}`,
      ...(rule?.inStore ? ["in store only, not online"] : []),
      ...(minShort > 0 ? [`spend ${minShort} more for the minimum`] : []),
      ...(nextPeriod ? [`after ${safeUntil}: may post on the next statement`] : safeUntil ? [`last safe day ${safeUntil}`] : []),
      ...(payBy ? [`pay by ${payBy} (${freeDays} days)`] : []),
    ];
    out.push({
      account: a.id, name: a.name, rate, earn, capLeft, minSpendShort: minShort, payBy, freeDays, limitLeft,
      ...(cb ? { rule: rule ? ruleLabel(rule) : null, inStore: rule?.inStore ?? false, safeUntil, nextPeriod } : {}),
      reason: `${a.name}: ${bits.join(" · ")}`,
    });
  }
  // no cashback (unknown or 0%) ranks by interest-free days and limit instead
  const effective = (b: BestCard) => (!b.earn ? -1 : b.minSpendShort > 0 ? b.earn / 2 : b.earn);
  return out
    .filter((b) => b.limitLeft === null || b.limitLeft >= amount)
    .sort((x, y) => effective(y) - effective(x) || (effective(y) > 0 ? (y.rate ?? -1) - (x.rate ?? -1) : 0) || (y.freeDays ?? -1) - (x.freeDays ?? -1) || (y.limitLeft ?? 0) - (x.limitLeft ?? 0));
}

/* ------------------------------------------------------------------ annual fee waiver */

export interface FeeWaiverStatus {
  account: string;
  name: string;
  target: number;
  yearFrom: ISODate;
  deadline: ISODate; // the next fee date (first day of the fee month)
  spent: number;
  needed: number;
  perMonth: number; // spend needed per remaining month
  daysLeft: number;
  onTrack: boolean;
  met: boolean;
}

/** Card year: from the 1st of the fee month on or before asOf, for 12 months. */
export function cardYear(feeMonth: number, asOf: ISODate): { from: ISODate; to: ISODate } {
  const [y, m] = parts(asOf);
  const from = `${m >= feeMonth ? y : y - 1}-${String(feeMonth).padStart(2, "0")}-01`;
  return { from, to: addMonths(from, 12) };
}

function spentOn(l: Ledger, account: string, from: ISODate, to: ISODate): number {
  const { map: cats } = flattenCategories(l.categories);
  let s = 0;
  for (const t of l.transactions) {
    if (t.void || t.date < from || t.date > to) continue;
    const k = lineKind(t, account, cats);
    if (k?.kind === "purchase") s += k.amount;
    else if (k?.kind === "refund") s -= k.amount;
  }
  return s;
}

export function feeWaiver(l: Ledger, account: string, asOf: ISODate): FeeWaiverStatus | null {
  const a = l.accounts.find((x) => x.id === account);
  if (!a) return null;
  const t = termsOf(a, recordFor(l, account));
  if (!t.feeWaiver || !t.feeMonth) return null;
  const y = cardYear(t.feeMonth, asOf);
  const spent = spentOn(l, account, y.from, asOf);
  const needed = Math.max(0, t.feeWaiver.spend - spent);
  const daysLeft = daysBetween(asOf, y.to);
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30.44));
  const elapsed = Math.max(1, daysBetween(y.from, asOf) + 1);
  const projected = (spent / elapsed) * (elapsed + daysLeft);
  return { account, name: a.name, target: t.feeWaiver.spend, yearFrom: y.from, deadline: y.to, spent, needed, perMonth: Math.round(needed / monthsLeft), daysLeft, onTrack: needed === 0 || projected >= t.feeWaiver.spend, met: needed === 0 };
}

/* ------------------------------------------------------------------ net value per card */

export interface CardValue {
  card: string; // record id or account id
  account: string | null;
  name: string;
  kind: "credit" | "debit" | "atm";
  status: string;
  benefits: number;
  cashback: number;
  fees: number;
  feesFrom: "ledger" | "record" | "none";
  closeFee: number;
  net: number;
  last12: { benefits: number; cashback: number; fees: number; net: number };
  feeMonth: number | null;
}

function received(l: Ledger, account: string, from: ISODate, to: ISODate, cats: Map<string, Category>): { cashback: number; fees: number } {
  let cb = 0;
  let fees = 0;
  for (const t of l.transactions) {
    if (t.void || t.date < from || t.date > to) continue;
    const k = lineKind(t, account, cats);
    if (k?.kind === "cashback") cb += k.amount;
    else if (k?.kind === "fee" && isAnnualFee(t)) fees += k.amount;
    else if (!k && t.card === account) for (const ln of t.lines) if (ln.category && topOf(ln.category) === "cashback") cb += -ln.amount;
  }
  return { cashback: cb, fees };
}

/** benefits + cashback received − annual fees − close fee, since the card was issued and over the last 12 months. */
export function cardValues(l: Ledger, asOf: ISODate): CardValue[] {
  const { map: cats } = flattenCategories(l.categories);
  const recs = cardsData(l).records;
  const out: CardValue[] = [];
  const seen = new Set<string>();
  const yearAgo = addMonths(asOf, -12);
  const rows: { rec?: CardRecord; a?: Account }[] = recs.map((rec) => ({ rec, a: rec.account ? l.accounts.find((x) => x.id === rec.account) : undefined }));
  for (const a of l.accounts) if (a.type === "credit_card" && !recs.some((r) => r.account === a.id)) rows.push({ a });
  for (const { rec, a } of rows) {
    const id = rec?.id ?? a!.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = a ? termsOf(a, rec) : null;
    const knownIssued = rec?.issued ?? rec?.activated ?? a?.opened;
    const issued = knownIssued ?? "1900-01-01";
    const all = a ? received(l, a.id, issued, asOf, cats) : { cashback: 0, fees: 0 };
    const y12 = a ? received(l, a.id, yearAgo, asOf, cats) : { cashback: 0, fees: 0 };
    const recFee = rec?.annual_fee ?? t?.annualFee ?? 0;
    let fees = all.fees;
    let fees12 = y12.fees;
    let feesFrom: CardValue["feesFrom"] = all.fees ? "ledger" : "none";
    if (!all.fees && recFee) {
      // one fee per started card year; with no issue date known, only the last 12 months can be estimated
      const years = knownIssued ? Math.max(1, Math.ceil(daysBetween(issued, asOf) / 365.25)) : 1;
      fees = recFee * years;
      fees12 = recFee;
      feesFrom = "record";
    }
    const benefits = rec?.benefits ?? 0;
    const benefits12 = issued >= yearAgo ? benefits : 0;
    const closeFee = rec?.status === "cancelled" ? (rec.close_fee ?? 0) : 0;
    out.push({
      card: id,
      account: a?.id ?? null,
      name: rec?.name ?? a?.name ?? id,
      kind: rec?.kind ?? "credit",
      status: rec?.status ?? (a && !isOpen(a, asOf) ? "cancelled" : "active"),
      benefits,
      cashback: all.cashback,
      fees,
      feesFrom,
      closeFee,
      net: benefits + all.cashback - fees - closeFee,
      last12: { benefits: benefits12, cashback: y12.cashback, fees: fees12, net: benefits12 + y12.cashback - fees12 },
      feeMonth: t?.feeMonth ?? null,
    });
  }
  return out.sort((x, y) => x.last12.net - y.last12.net);
}
