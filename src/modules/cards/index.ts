import { parse as parseYaml } from "yaml";
import { holdingsAt } from "../../engine/balances.js";
import { addDays, daysBetween, isDate } from "../../engine/dates.js";
import type { ISODate, Issue, Ledger } from "../../engine/types.js";
import type { AttentionItem, ModuleDef } from "../types.js";
import { isOpen } from "../util.js";
import { cashback, cardValues, feeWaiver, isAnnualFee, openClose, points, statements, type CashbackPeriod, type PointsStatus, type Statement } from "./statements.js";
import { CARDS_FILE, STATEMENTS_FILE, cardsData, recordFor, termsOf, validMargin, DEFAULT_POST_MARGIN, type BankStatement, type CardRecord, type CardsData } from "./terms.js";
import { CARD_TYPES } from "./types.js";

const KINDS = new Set(["credit", "debit", "atm"]);
const STATUSES = new Set(["active", "locked", "inactive", "cancelled"]);
const NETWORKS = new Set(["visa", "mastercard", "amex", "jcb", "napas", "unionpay"]);

function loadCards(files: Record<string, string>, issues: Issue[]): CardsData {
  const read = <T>(path: string): T[] => {
    const text = files[path];
    if (text === undefined) return [];
    try {
      const v = parseYaml(text);
      if (v == null) return [];
      if (!Array.isArray(v)) {
        issues.push({ level: "error", file: path, message: "expected a list" });
        return [];
      }
      return v as T[];
    } catch (e) {
      issues.push({ level: "error", file: path, message: `YAML parse error: ${(e as Error).message.split("\n")[0]}` });
      return [];
    }
  };
  return { records: read<CardRecord>(CARDS_FILE), statements: read<BankStatement>(STATEMENTS_FILE) };
}

function checkCards(l: Ledger): Issue[] {
  const out: Issue[] = [];
  const err = (file: string, where: string, message: string) => out.push({ level: "error", file, where, message });
  const warn = (file: string, where: string, message: string) => out.push({ level: "warning", file, where, message });
  const { records, statements: bank } = cardsData(l);
  const accounts = new Map(l.accounts.map((a) => [a.id, a]));
  const ids = new Set<string>();
  records.forEach((r, i) => {
    const w = r && typeof r.id === "string" ? r.id : `#${i + 1}`;
    if (!r || typeof r.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.id)) return err(CARDS_FILE, w, "id must be letters, digits, . _ -");
    if (ids.has(r.id)) err(CARDS_FILE, w, "duplicate card id");
    ids.add(r.id);
    if (!KINDS.has(r.kind)) err(CARDS_FILE, w, "kind must be credit, debit or atm");
    if (r.status !== undefined && !STATUSES.has(r.status)) err(CARDS_FILE, w, "status must be active, locked, inactive or cancelled");
    if (r.network !== undefined && !NETWORKS.has(String(r.network).toLowerCase())) warn(CARDS_FILE, w, `unknown network "${r.network}"`);
    if (r.last4 !== undefined && !/^\d{4}$/.test(String(r.last4))) err(CARDS_FILE, w, 'last4 must be exactly 4 digits, quoted ("3584"); never store a full card number');
    for (const k of ["number", "card_number", "pan", "cvv"]) if (r[k] !== undefined) err(CARDS_FILE, w, `${k}: never store card numbers or codes here (only last4)`);
    for (const k of ["issued", "activated", "cancelled", "locked"] as const) if (r[k] !== undefined && !isDate(r[k])) err(CARDS_FILE, w, `${k} is not a date (yyyy-mm-dd)`);
    for (const k of ["annual_fee", "close_fee", "benefits"] as const) if (r[k] !== undefined && (!Number.isInteger(r[k]) || (r[k] as number) < 0)) err(CARDS_FILE, w, `${k} must be a whole amount ≥ 0`);
    if (r.cancel_plan?.by !== undefined && !/^\d{4}-\d{2}(-\d{2})?$/.test(String(r.cancel_plan.by))) err(CARDS_FILE, w, "cancel_plan.by: yyyy-mm or yyyy-mm-dd");
    if (r.account !== undefined) {
      const a = accounts.get(r.account);
      if (!a) err(CARDS_FILE, w, `unknown account "${r.account}"`);
      else if (r.kind === "credit" && a.type !== "credit_card") err(CARDS_FILE, w, `a credit card's account must be a credit_card (${a.id} is ${a.type})`);
      else if (r.status === "cancelled" && !a.closed) warn(CARDS_FILE, w, `cancelled, but account ${a.id} is still open (close it with closed: <date>)`);
    } else if (r.kind === "credit") warn(CARDS_FILE, w, "a credit card should name its account");
  });
  bank.forEach((s, i) => {
    const w = `#${i + 1}`;
    if (!s || !accounts.has(s.account)) err(STATEMENTS_FILE, w, `unknown account "${s?.account}"`);
    if (!s || !isDate(s.statement_date)) err(STATEMENTS_FILE, w, "statement_date is not a date");
    if (!s || !Number.isInteger(s.amount)) err(STATEMENTS_FILE, w, "amount must be a whole amount");
  });
  // the new detail fields
  for (const a of l.accounts) {
    if (a.type !== "credit_card" && !records.some((r) => r.account === a.id && r.kind === "debit")) continue;
    const d = { ...(records.find((r) => r.account === a.id && r.kind !== "credit") ?? {}), ...(a.details ?? {}) } as Record<string, unknown>;
    const cb = d.cashback as Record<string, unknown> | undefined;
    if (cb !== undefined) {
      if (!cb || typeof cb !== "object") warn("data/accounts.yaml", a.id, "details.cashback should be a map");
      else {
        if (cb.base !== undefined && !(typeof cb.base === "number" && cb.base >= 0 && cb.base <= 100)) warn("data/accounts.yaml", a.id, "cashback.base: a % from 0 to 100");
        for (const [j, r] of (Array.isArray(cb.rules) ? cb.rules : []).entries()) {
          const rule = r as Record<string, unknown>;
          const rate = rule?.rate;
          if (rate !== null && rate !== undefined && !(typeof rate === "number" && rate >= 0 && rate <= 100)) warn("data/accounts.yaml", `${a.id} cashback.rules[${j}]`, "rate: a % from 0 to 100");
          const cats = Array.isArray(rule?.categories) ? (rule.categories as string[]) : [];
          for (const c of cats) if (!categoryExists(l, c)) warn("data/accounts.yaml", `${a.id} cashback.rules[${j}]`, `unknown category "${c}"`);
          if (rule?.merchants !== undefined && !(Array.isArray(rule.merchants) && rule.merchants.every((m) => typeof m === "string" && m.trim()))) warn("data/accounts.yaml", `${a.id} cashback.rules[${j}]`, "merchants: a list of words (e.g. [shopee, lazada])");
          if (!cats.length && !(Array.isArray(rule?.merchants) && rule.merchants.length)) warn("data/accounts.yaml", `${a.id} cashback.rules[${j}]`, "a rule needs categories or merchants");
          if (rule?.cap !== undefined) {
            const amt = typeof rule.cap === "number" ? rule.cap : (rule.cap as Record<string, unknown> | null)?.amount;
            if (!(Number.isInteger(amt) && (amt as number) > 0)) warn("data/accounts.yaml", `${a.id} cashback.rules[${j}]`, "cap: a positive whole amount");
          }
          if (rule?.in_store !== undefined && typeof rule.in_store !== "boolean") warn("data/accounts.yaml", `${a.id} cashback.rules[${j}]`, "in_store: true or false");
        }
        if (cb.post_margin_days !== undefined && !validMargin(cb.post_margin_days)) warn("data/accounts.yaml", a.id, "cashback.post_margin_days: whole days from 0 to 10 (3 is used)");
        if (cb.payout !== undefined && cb.payout !== "auto" && cb.payout !== "points") warn("data/accounts.yaml", a.id, "cashback.payout: auto or points");
        for (const k of ["redeem_min", "expire_months"]) if (cb[k] !== undefined && cb.payout !== "points") warn("data/accounts.yaml", a.id, `cashback.${k} only counts with payout: points`);
        if (cb.expire_months !== undefined && !(Number.isInteger(cb.expire_months) && (cb.expire_months as number) > 0)) warn("data/accounts.yaml", a.id, "cashback.expire_months: a whole number of months");
        for (const k of ["cap", "min_spend", "spend_max", "redeem_min"]) {
          const v = cb[k] as Record<string, unknown> | number | undefined;
          if (v === undefined) continue;
          const amt = typeof v === "number" ? v : v?.amount;
          if (!(Number.isInteger(amt) && (amt as number) > 0)) warn("data/accounts.yaml", a.id, `cashback.${k}: a positive whole amount`);
        }
        if (cb.paid_on !== undefined && !/^(next_statement|days_after:\d+)$/.test(String(cb.paid_on))) warn("data/accounts.yaml", a.id, "cashback.paid_on: next_statement or days_after:<n>");
      }
    }
    const fw = d.fee_waiver as Record<string, unknown> | undefined;
    if (fw !== undefined && !(fw && typeof fw === "object" && Number.isInteger(fw.spend) && (fw.spend as number) > 0)) warn("data/accounts.yaml", a.id, "fee_waiver: { spend: <amount>, within: year }");
    if (d.fee_month !== undefined && !(Number.isInteger(d.fee_month) && (d.fee_month as number) >= 1 && (d.fee_month as number) <= 12)) warn("data/accounts.yaml", a.id, "fee_month: 1 to 12");
  }
  return out;
}

function categoryExists(l: Ledger, path: string): boolean {
  const walk = (nodes: { id: string; children?: unknown[] }[] | undefined, parts: string[]): boolean => {
    const n = (nodes ?? []).find((x) => x.id === parts[0]);
    if (!n) return false;
    return parts.length === 1 || walk(n.children as never, parts.slice(1));
  };
  const parts = path.split("/");
  return walk(l.categories.expense as never, parts) || walk(l.categories.income as never, parts);
}

/* ------------------------------------------------------------------ the All cards list */

export interface CardSummary {
  account: string;
  name: string;
  bank: string | null;
  last4: string | null;
  status: string;
  owed: number;
  limit: number | null;
  /** At least this limit: the most ever owed (when no limit is set). */
  limitAtLeast: number | null;
  used: number | null; // owed / limit, 0-1
  last: Statement | null; // the last closed statement
  current: Statement | null; // the open period
  toPay: number;
  due: ISODate | null;
  daysToDue: number | null;
  cashback: CashbackPeriod | null; // this period
  points: PointsStatus | null; // points cards (cashback payout: points)
  /** the open statement's close and the last day a purchase is sure to land on it (needs statement_day; margin from the cashback terms, else 3) */
  safe: { closesOn: ISODate; safeUntil: ISODate; daysLeft: number } | null;
  missing: string[]; // terms not set yet (statement_day, due_day, limit, cashback rates…)
}

export function cardList(l: Ledger, asOf: ISODate, o: { includeClosed?: boolean } = {}): CardSummary[] {
  const hs = holdingsAt(l, asOf);
  const out: CardSummary[] = [];
  for (const a of l.accounts) {
    if (a.type !== "credit_card" || (!o.includeClosed && !isOpen(a, asOf))) continue;
    const rec = recordFor(l, a.id);
    const t = termsOf(a, rec);
    const st = statements(l, a.id, asOf);
    const last = [...st].reverse().find((s) => !s.open) ?? null;
    const current = st.find((s) => s.open) ?? null;
    const cb = cashback(l, a.id, asOf).find((p) => p.open) ?? null;
    const owed = -(hs.get(a.id)?.amount ?? 0);
    let maxOwed = 0;
    if (t.limit === null) {
      let b = 0;
      for (const x of l.transactions) {
        if (x.void || x.date > asOf) continue;
        for (const ln of x.lines) if (ln.account === a.id) b += ln.amount;
        maxOwed = Math.max(maxOwed, -b);
      }
    }
    const missing: string[] = [];
    if (!t.statementDay) missing.push("statement_day");
    if (!t.dueDay) missing.push("due_day");
    if (t.limit === null) missing.push("limit");
    if (t.cashback?.rules.some((r) => r.rate === null)) missing.push("cashback_rates");
    out.push({
      account: a.id,
      name: a.name,
      bank: t.bank,
      last4: t.last4,
      status: rec?.status ?? (isOpen(a, asOf) ? "active" : "cancelled"),
      owed,
      limit: t.limit,
      limitAtLeast: t.limit === null && maxOwed > 0 ? maxOwed : null,
      used: t.limit ? owed / t.limit : null,
      last,
      current,
      toPay: last?.toPay ?? 0,
      due: last?.due ?? null,
      daysToDue: last?.due ? daysBetween(asOf, last.due) : null,
      cashback: cb,
      points: points(l, a.id, asOf),
      safe: safeDay(t, asOf),
      missing,
    });
  }
  const key = (c: CardSummary) => (c.toPay > 0 && c.due ? c.due : "9999-99-99");
  return out.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : y.owed - x.owed));
}

function safeDay(t: ReturnType<typeof termsOf>, asOf: ISODate): CardSummary["safe"] {
  if (!t.statementDay) return null;
  const closesOn = openClose(asOf, t.statementDay);
  const safeUntil = addDays(closesOn, -(t.cashback?.postMargin ?? DEFAULT_POST_MARGIN));
  return { closesOn, safeUntil, daysLeft: daysBetween(asOf, safeUntil) };
}

/* ------------------------------------------------------------------ Needs you */

function cardAttention(l: Ledger, asOf: ISODate): AttentionItem[] {
  const out: AttentionItem[] = [];
  const link = (id: string) => `#/cards/${encodeURIComponent(id)}`;
  for (const c of cardList(l, asOf)) {
    const s = c.last;
    if (s && s.due && s.toPay > 0) {
      const days = daysBetween(asOf, s.due);
      if (s.status === "due" && days <= 7) {
        out.push({ kind: "card_due", module: "cards", severity: days <= 3 ? "red" : "amber", date: s.due, title: `Card ${c.name}: pay ${s.toPay} by ${s.due}`, amount: s.toPay, account: c.account, name: c.name, days, link: link(c.account) });
      } else if (s.status === "partly" || s.status === "unpaid") {
        out.push({ kind: "card_overdue", module: "cards", severity: "red", date: s.due, title: `Card ${c.name}: statement of ${s.close} not fully paid (due ${s.due}, ${s.toPay} left)`, amount: s.toPay, account: c.account, name: c.name, days, link: link(c.account) });
      }
    }
    if (s && s.status === "late" && daysBetween(s.due!, asOf) <= 30) {
      out.push({ kind: "card_paid_late", module: "cards", severity: "info", date: s.due!, title: `Card ${c.name}: the statement of ${s.close} was paid after its due date`, account: c.account, name: c.name, params: { close: s.close }, link: link(c.account) });
    }
    if (s && s.bankDiff !== null && Math.abs(s.bankDiff) > 1000) {
      out.push({ kind: "card_bank_diff", module: "cards", severity: "amber", date: s.close, title: `Card ${c.name}: computed ${(s.bank ?? 0) + s.bankDiff} vs the bank's ${s.bank} for ${s.close}`, amount: s.bankDiff, account: c.account, name: c.name, params: { bank: s.bank, close: s.close }, link: link(c.account), ask: true });
    }
    if (c.used !== null && c.used >= 0.8) {
      out.push({ kind: "card_near_limit", module: "cards", severity: "amber", date: asOf, title: `Card ${c.name} is at ${Math.round(c.used * 100)}% of its limit`, amount: c.owed, account: c.account, name: c.name, params: { pct: Math.round(c.used * 100), limit: c.limit }, link: link(c.account) });
    }
    // cashback: expected for a closed period but not received by when the bank pays it
    for (const p of c.points ? [] : cashback(l, c.account, asOf)) {
      if (p.open || p.expected <= 0 || p.received >= p.expected || p.payBy >= asOf || daysBetween(p.payBy, asOf) > 45) continue;
      out.push({ kind: "cashback_missing", module: "cards", severity: "amber", date: p.payBy, title: `Card ${c.name}: expected cashback ${p.expected} for ${p.from}…${p.close}, received ${p.received}`, amount: p.expected - p.received, account: c.account, name: c.name, params: { from: p.from, close: p.close, expected: p.expected, received: p.received }, link: link(c.account), ask: true });
    }
    const cb = c.cashback;
    if (cb && cb.cap !== null && cb.capLeft !== null && cb.capLeft <= cb.cap * 0.1 && cb.expected > 0) {
      out.push({ kind: "cashback_cap", module: "cards", severity: "info", date: asOf, title: `Card ${c.name}: cashback cap almost used (${cb.capLeft} left)`, amount: cb.capLeft, account: c.account, name: c.name, link: link(c.account) });
    }
    // the minimum and the room left, counted to the last safe day (statement date − post margin), not to the close
    const days = cb?.daysLeft;
    if (cb && cb.safeUntil && days !== undefined && days >= 0) {
      if (cb.minSpend !== null && !cb.minMet && days <= 7) {
        out.push({ kind: "cashback_min", module: "cards", severity: days <= 2 ? "red" : "amber", date: cb.safeUntil, title: `Card ${c.name}: spend ${cb.needForMin} more by ${cb.safeUntil} (${days} days left) to get cashback`, amount: cb.needForMin, account: c.account, name: c.name, days, params: { amount: cb.needForMin, safe_until: cb.safeUntil }, link: link(c.account) });
      } else if (days <= 3) {
        const rooms = cb.groups.filter((g) => g.room !== null && g.room > 0);
        const total = rooms.length ? rooms.reduce((s, g) => s + g.room!, 0) : (cb.roomSpend ?? 0);
        if (total > 0 && (cb.earnLeft === null || cb.earnLeft === undefined || cb.earnLeft > 0)) {
          const list = rooms.length ? rooms.map((g) => `${g.label} ${g.room} at ${g.rate}%${g.inStore ? " (in store)" : ""}`).join(", ") : `${cb.roomSpend}${cb.roomEstimate ? " (estimate)" : ""}`;
          out.push({ kind: "card_spend_room", module: "cards", severity: "info", date: cb.safeUntil, title: `Card ${c.name}: room left to earn cashback by ${cb.safeUntil} (${days} days left): ${list}`, amount: cb.earnLeft ?? total, account: c.account, name: c.name, days, params: { safe_until: cb.safeUntil, groups: list, earn_left: cb.earnLeft ?? null }, link: link(c.account) });
        }
      }
    }
    if (c.points) {
      const p = c.points;
      if (p.canRedeem && p.redeemMin !== null) out.push({ kind: "card_points_redeem", module: "cards", severity: "info", date: asOf, title: `Card ${c.name}: ${p.balance} points can be cashed in (from ${p.redeemMin})`, amount: p.balance, account: c.account, name: c.name, params: { points: p.balance, min: p.redeemMin }, link: link(c.account) });
      const soon = p.lots.filter((x) => x.expires && daysBetween(asOf, x.expires) <= 30);
      if (soon.length) {
        const n = soon.reduce((s, x) => s + x.left, 0);
        const first = soon[0]!.expires!;
        out.push({ kind: "card_points_expiring", module: "cards", severity: "amber", date: first, title: `Card ${c.name}: ${n} points expire by ${soon[soon.length - 1]!.expires}${p.canRedeem ? "" : ` (below the ${p.redeemMin} to cash in)`}`, amount: n, account: c.account, name: c.name, days: daysBetween(asOf, first), params: { points: n, expires: first }, link: link(c.account) });
      }
    }
  }
  // fee waivers and annual fees
  for (const a of l.accounts) {
    if (a.type !== "credit_card" || !isOpen(a, asOf)) continue;
    const fw = feeWaiver(l, a.id, asOf);
    if (fw && !fw.met && !fw.onTrack && fw.daysLeft <= 30) {
      out.push({ kind: "fee_waiver_risk", module: "cards", severity: fw.daysLeft <= 7 ? "red" : "amber", date: fw.deadline, title: `Card ${a.name}: spend ${fw.needed} more by ${fw.deadline} to waive the annual fee`, amount: fw.needed, account: a.id, name: a.name, days: fw.daysLeft, link: link(a.id) });
    }
    for (const t of l.transactions) {
      if (t.void || t.date > asOf || daysBetween(t.date, asOf) > 30 || !isAnnualFee(t) || !t.lines.some((ln) => ln.account === a.id)) continue;
      const prev = feeWaiver(l, a.id, addDays(t.date, -1));
      out.push({ kind: "annual_fee_charged", module: "cards", severity: prev?.met ? "amber" : "info", date: t.date, title: `Card ${a.name}: annual fee charged on ${t.date}${prev?.met ? " although the waiver target was met: ask the bank for a refund" : ""}`, account: a.id, name: a.name, params: { met: prev?.met ? 1 : 0 }, link: link(a.id), ask: Boolean(prev?.met) });
    }
  }
  // lifecycle and cancel plans (cards.yaml)
  const hs = holdingsAt(l, asOf);
  for (const r of cardsData(l).records) {
    const a = r.account ? l.accounts.find((x) => x.id === r.account) : undefined;
    const name = r.name ?? a?.name ?? r.id;
    if (r.cancel_plan?.by && r.status !== "cancelled") {
      const by = r.cancel_plan.by.length === 7 ? `${r.cancel_plan.by}-01` : r.cancel_plan.by;
      const days = daysBetween(asOf, by);
      if (days <= 30 && days >= -30) out.push({ kind: "card_cancel_plan", module: "cards", severity: days <= 7 ? "red" : "amber", date: by, title: `${name}: planned cancel by ${r.cancel_plan.by}. Call ${r.bank ?? "the bank"} to cancel or ask for a fee waiver`, name, days, params: { bank: r.bank ?? null, note: r.cancel_plan.note ?? null }, link: a ? link(a.id) : "#/cards" });
    }
    const t = a ? termsOf(a, r) : null;
    const feeMonth = t?.feeMonth ?? null;
    if (feeMonth && (r.cancel_plan || r.status === "locked" || r.status === "inactive") && !r.keep_for_limit && (r.annual_fee ?? t?.annualFee ?? 0) > 0 && r.status !== "cancelled") {
      const [y, m] = [Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7))];
      const next = `${feeMonth >= m ? y : y + 1}-${String(feeMonth).padStart(2, "0")}-01`;
      const days = daysBetween(asOf, next);
      if (days <= 30) out.push({ kind: "card_fee_soon", module: "cards", severity: "amber", date: next, title: `${name}: annual fee ${r.annual_fee ?? t?.annualFee} due in ${next.slice(0, 7)} for a card you're not keeping`, amount: r.annual_fee ?? t?.annualFee ?? undefined, name, days, link: a ? link(a.id) : "#/cards" });
    }
    if (r.status === "cancelled" && a && !a.closed) out.push({ kind: "card_cancelled_open", module: "cards", severity: "amber", date: asOf, title: `${name} is cancelled but its account ${a.id} is still open`, account: a.id, name, link: link(a.id), ask: true });
    if (r.status === "locked" && a && (hs.get(a.id)?.amount ?? 0) !== 0) out.push({ kind: "card_locked_balance", module: "cards", severity: "info", date: asOf, title: `${name} is locked but has a balance of ${-(hs.get(a.id)?.amount ?? 0)}`, amount: -(hs.get(a.id)?.amount ?? 0), account: a.id, name, link: link(a.id) });
  }
  // cards that cost more than they gave in the last 12 months, before the fee month
  for (const v of cardValues(l, asOf)) {
    if (v.status === "cancelled" || v.last12.net >= 0 || !v.feeMonth) continue;
    const [y, m] = [Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7))];
    const next = `${v.feeMonth >= m ? y : y + 1}-${String(v.feeMonth).padStart(2, "0")}-01`;
    const days = daysBetween(asOf, next);
    if (days <= 60) out.push({ kind: "card_not_worth", module: "cards", severity: "info", date: next, title: `${v.name}: cost ${-v.last12.net} more than it gave in the last 12 months; fee month ${next.slice(0, 7)}`, amount: v.last12.net, account: v.account ?? undefined, name: v.name, days, link: v.account ? link(v.account) : "#/cards", ask: true });
  }
  return out;
}

export const cardsModule: ModuleDef = {
  name: "cards",
  types: CARD_TYPES,
  on: (l, asOf, files) => l.accounts.some((a) => a.type in CARD_TYPES && isOpen(a, asOf)) || cardsData(l).records.length > 0 || Boolean(files?.[CARDS_FILE]),
  load: loadCards,
  check: checkCards,
  attention: cardAttention,
};
