import { addDays, daysBetween } from "../engine/dates.js";
import type { ISODate, Ledger, Transaction } from "../engine/types.js";
import { statements } from "../modules/cards/statements.js";
import type { StatementRow } from "./statement-rows.js";

/**
 * Every filed statement of a card against the ledger (plan 005). Reports only; never writes.
 * Amounts are on the card like the ledger: negative = spent, positive = paid back / refunded / cashback.
 */

export interface FiledStatement {
  month: string; // YYYY-MM of the close date
  path: string;
  rows: StatementRow[];
  closing: number | null; // the bank's figure read from the PDF (positive = owed)
  error?: string; // the PDF couldn't be read
}

export interface LedgerRow {
  id: string;
  date: ISODate;
  amount: number; // on this card
  note: string;
  against: string; // the other lines' categories / accounts
}

export interface RowRef {
  date: ISODate;
  amount: number;
  description: string;
  month: string;
}

export interface MonthResult {
  month: string;
  from: ISODate;
  close: ISODate;
  file: string;
  rows: number;
  /** The bank's figure: read from the PDF, else the one saved with add_statement_amount. */
  bank: number | null;
  bankFrom: "pdf" | "saved" | null;
  /** ownledger's amount for the same statement (closing − instalments not billed yet, 0 if in credit). */
  ledger: number | null;
  /** ledger − bank (like bankDiff); null without a bank figure. */
  diff: number | null;
  /** diff − the month before's diff: what changed this month. */
  change: number | null;
  /** The part of the gap from matched rows the ledger and the bank put on different sides of a close date (goes away later). */
  timing: number;
  missing: number;
  error?: string;
}

export type BatchHint =
  | { op: "add"; date: ISODate; kind: "expense" | "income"; amount: number; account: string; note: string; category: null }
  | { op: "edit"; id: string; amount: number }
  | { op: "edit"; id: string; account: string };

export interface ReconcileResult {
  account: string;
  from: ISODate;
  to: ISODate;
  months: MonthResult[];
  matched: number;
  /** On a statement, not on the ledger. */
  missing: (RowRef & { hint: BatchHint })[];
  /** On the ledger (inside the statements' periods), on no statement. Balance adjustments are listed apart. */
  notOnStatement: LedgerRow[];
  /** Balance adjustments (_adjust) on the card inside the statements' periods: usually covering a gap. */
  adjustments: LedgerRow[];
  /** Same date (±3 days), close amount (digits swapped, or within 1%). */
  amountDiffs: { statement: RowRef; ledger: LedgerRow; hint: BatchHint }[];
  /** A missing row whose amount is on another account the same days: probably booked on the wrong account. */
  otherAccount: { statement: RowRef; ledger: LedgerRow & { account: string }; hint: BatchHint }[];
  /** Several rows on one side that add up to one row on the other (a fee and its VAT booked as one). */
  joined: { statement: RowRef[]; ledger: LedgerRow[] }[];
  /** Statement rows missing on the ledger that cancel out (a purchase refunded in full as cashback). */
  netZero: RowRef[][];
}

const DAYS = 7;

function ledgerRows(l: Ledger, account: string, from: ISODate, to: ISODate): LedgerRow[] {
  return l.transactions
    .filter((t) => !t.void && t.date >= from && t.date <= to && t.lines.some((x) => x.account === account))
    .map((t) => rowOf(t, account));
}

function rowOf(t: Transaction, account: string): LedgerRow {
  const own = t.lines.filter((x) => x.account === account);
  return {
    id: t.id,
    date: t.date,
    amount: own.reduce((s, x) => s + x.amount, 0),
    note: [t.note, ...own.map((x) => x.note)].filter(Boolean).join(" · "),
    against: t.lines.filter((x) => x.account !== account).map((x) => x.category ?? x.account).filter(Boolean).join(", "),
  };
}

const digits = (n: number) => String(Math.abs(n)).split("").sort().join("");
const dist = (a: ISODate, b: ISODate) => Math.abs(daysBetween(a, b));

export function reconcile(l: Ledger, account: string, filed: FiledStatement[], asOf: ISODate): ReconcileResult {
  const periods = statements(l, account, asOf).filter((s) => !s.open);
  const byMonth = new Map(periods.map((s) => [s.close.slice(0, 7), s]));
  const used = filed.filter((f) => byMonth.has(f.month)).sort((a, b) => a.month.localeCompare(b.month));
  const months: MonthResult[] = filed
    .filter((f) => !byMonth.has(f.month))
    .map((f) => ({ month: f.month, from: "", close: "", file: f.path, rows: f.rows.length, bank: f.closing, bankFrom: f.closing === null ? null : "pdf", ledger: null, diff: null, change: null, timing: 0, missing: 0, error: f.error ?? "ownledger has no closed statement period closing this month" }));

  // every statement row, with its month
  type S = RowRef & { k: number; done: boolean };
  type L = LedgerRow & { done: boolean };
  const srows: S[] = [];
  for (const f of used) for (const r of f.rows) srows.push({ date: r.date, amount: r.amount, description: r.description, month: f.month, k: srows.length, done: false });
  const first = used[0] ? byMonth.get(used[0].month)! : null;
  const last = used.length ? byMonth.get(used[used.length - 1]!.month)! : null;
  const from = first?.from ?? asOf;
  const to = last?.close ?? asOf;
  const lrows: L[] = ledgerRows(l, account, addDays(from, -DAYS), addDays(to, DAYS)).map((r) => ({ ...r, done: false }));
  const ref = (s: S): RowRef => ({ date: s.date, amount: s.amount, description: s.description, month: s.month });
  const plainL = ({ done: _d, ...r }: L): LedgerRow => r;

  // 1. same signed amount within ±7 days, nearest first
  const pairs: { s: S; r: L; d: number }[] = [];
  for (const s of srows) for (const r of lrows) if (r.amount === s.amount && dist(s.date, r.date) <= DAYS) pairs.push({ s, r, d: dist(s.date, r.date) });
  pairs.sort((a, b) => a.d - b.d || a.s.k - b.s.k);
  let matched = 0;
  const kept: { s: S[]; r: L[] }[] = []; // matched groups, for timing
  for (const p of pairs) {
    if (p.s.done || p.r.done) continue;
    p.s.done = p.r.done = true;
    kept.push({ s: [p.s], r: [p.r] });
    matched++;
  }

  // 2. two or three rows on one side that add up to one on the other (a fee and its VAT; a purchase with its DCC fee and VAT)
  const joined: ReconcileResult["joined"] = [];
  const openS = () => srows.filter((s) => !s.done);
  const openL = () => lrows.filter((r) => !r.done);
  /** Sets of 2–3 rows on the same date that sum to `amount`. */
  function sumOf<T extends { date: ISODate; amount: number; done: boolean }>(pool: T[], amount: number, near: ISODate): T[] | null {
    const c = pool.filter((x) => !x.done && dist(x.date, near) <= DAYS);
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) {
        if (c[i]!.date !== c[j]!.date) continue;
        if (c[i]!.amount + c[j]!.amount === amount) return [c[i]!, c[j]!];
        for (let k = j + 1; k < c.length; k++) if (c[k]!.date === c[i]!.date && c[i]!.amount + c[j]!.amount + c[k]!.amount === amount) return [c[i]!, c[j]!, c[k]!];
      }
    return null;
  }
  for (const r of openL()) {
    const set = sumOf(srows, r.amount, r.date);
    if (!set) continue;
    for (const x of set) x.done = true;
    r.done = true;
    kept.push({ s: set, r: [r] });
    joined.push({ statement: set.map(ref), ledger: [plainL(r)] });
  }
  for (const s of openS()) {
    const set = sumOf(lrows, s.amount, s.date);
    if (!set) continue;
    for (const x of set) x.done = true;
    s.done = true;
    kept.push({ s: [s], r: set });
    joined.push({ statement: [ref(s)], ledger: set.map(plainL) });
  }

  // 3. close amounts on close dates: a typo
  const amountDiffs: ReconcileResult["amountDiffs"] = [];
  for (const s of openS()) {
    const r = openL()
      .filter((x) => Math.sign(x.amount) === Math.sign(s.amount) && dist(x.date, s.date) <= 3 && (digits(x.amount) === digits(s.amount) || Math.abs(x.amount - s.amount) <= Math.abs(s.amount) * 0.01))
      .sort((a, b) => dist(a.date, s.date) - dist(b.date, s.date))[0];
    if (!r) continue;
    s.done = r.done = true;
    amountDiffs.push({ statement: ref(s), ledger: plainL(r), hint: { op: "edit", id: r.id, amount: Math.abs(s.amount) } });
  }

  // 4. missing rows that cancel out (purchase + cashback/refund of the same amount)
  const netZero: RowRef[][] = [];
  for (const a of openS()) {
    if (a.done || a.amount >= 0) continue;
    const b = openS().find((x) => x.amount === -a.amount && dist(x.date, a.date) <= 62);
    if (!b) continue;
    a.done = b.done = true;
    netZero.push([ref(a), ref(b)]);
  }

  // 5. still missing: is the amount on another account those days?
  const otherAccount: ReconcileResult["otherAccount"] = [];
  const missing: ReconcileResult["missing"] = [];
  for (const s of openS()) {
    const elsewhere = l.transactions.find(
      (t) => !t.void && dist(t.date, s.date) <= 3 && !t.lines.some((x) => x.account === account) && t.lines.some((x) => x.account && x.account !== account && x.amount === s.amount),
    );
    if (elsewhere) {
      const acc = elsewhere.lines.find((x) => x.account && x.amount === s.amount)!.account!;
      otherAccount.push({ statement: ref(s), ledger: { ...rowOf(elsewhere, acc), account: acc }, hint: { op: "edit", id: elsewhere.id, account } });
      continue;
    }
    missing.push({
      ...ref(s),
      hint: { op: "add", date: s.date, kind: s.amount < 0 ? "expense" : "income", amount: Math.abs(s.amount), account, note: s.description, category: null },
    });
  }

  // on the ledger, on no statement: only inside the filed statements' periods
  const covered = used.map((f) => byMonth.get(f.month)!).map((p) => [p.from, p.close] as const);
  const inside = (d: ISODate) => covered.some(([a, b]) => d >= a && d <= b);
  const isAdjust = (r: LedgerRow) => r.against.split(", ").includes("_adjust");
  const left = openL().filter((r) => inside(r.date)).map(plainL);

  // per month: the bank's figure against the ledger's
  let prev: number | null = null;
  const res: MonthResult[] = used.map((f) => {
    const p = byMonth.get(f.month)!;
    const ledger = Math.max(0, p.closing - p.deferred);
    const bank = f.closing ?? p.bank;
    const diff = bank === null ? null : ledger - bank;
    const change = diff === null || prev === null ? null : diff - prev;
    // owed by the close on the ledger's side but not yet on the bank's, minus the other way round
    let timing = 0;
    for (const g of kept) {
      for (const r of g.r) if (r.date <= p.close) timing -= r.amount;
      for (const x of g.s) if (byMonth.get(x.month)!.close <= p.close) timing += x.amount;
    }
    const m: MonthResult = {
      month: f.month, from: p.from, close: p.close, file: f.path, rows: f.rows.length, bank, bankFrom: f.closing !== null ? "pdf" : p.bank !== null ? "saved" : null,
      ledger, diff, change, timing, missing: missing.filter((x) => x.month === f.month).length, ...(f.error ? { error: f.error } : {}),
    };
    if (diff !== null) prev = diff;
    return m;
  });
  return {
    account,
    from,
    to,
    months: [...months, ...res].sort((a, b) => a.month.localeCompare(b.month)),
    matched,
    missing,
    notOnStatement: left.filter((r) => !isAdjust(r)),
    adjustments: left.filter(isAdjust),
    amountDiffs,
    otherAccount,
    joined,
    netZero,
  };
}
