import { addDays } from "../engine/dates.js";
import type { ISODate } from "../engine/types.js";

/**
 * Rows of a bank statement (plan 005), read on the user's computer only.
 * General rules, no bank-specific code: a row is a date + a description + an amount. Each bank's wording
 * (its closing label, the words of its credit rows) lives in imports/statements/sources.yaml as data.
 */

/** A piece of text on a line, with where it starts (PDF points from the left). */
export interface Cell {
  x: number;
  /** Where it ends, when known (amount columns are often right-aligned). */
  end?: number;
  text: string;
}

export type Line = Cell[];

/** What sources.yaml can say about a card's statements (all optional; defaults cover most banks). */
export interface StatementLayout {
  /** The label of the bank's closing figure, e.g. "Payable amount" (or a list). */
  closing_label?: string | string[];
  /** Words that mark a row as a credit (money back on the card): payment, refund, cashback… */
  credit_words?: string[];
  /** Lines with these words are never rows (headers, totals). */
  skip_words?: string[];
  /** Which amount on a row is the row's amount when there are several (zeros and other currencies not counted): 1 = first, -1 = last (default). */
  amount_column?: number;
}

/* ------------------------------------------------------------------ layout-keeping text */

interface PdfItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** The PDF's text as lines of cells, top to bottom, page by page (columns kept by x position). */
export async function pdfLines(bytes: Uint8Array): Promise<Line[]> {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const out: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    out.push(...linesOf((tc.items as PdfItem[]).filter((i) => typeof i.str === "string")));
  }
  return out;
}

/** Groups text items into lines (same baseline) and cells (a gap wider than about a character starts a new cell). */
export function linesOf(items: PdfItem[]): Line[] {
  const rows: { y: number; size: number; items: PdfItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = it.transform[5]!;
    const size = Math.hypot(it.transform[2]!, it.transform[3]!) || it.height || 10;
    const row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, size * 0.3));
    if (row) row.items.push(it);
    else rows.push({ y, size, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const its = r.items.sort((a, b) => a.transform[4]! - b.transform[4]!);
    const cells: Cell[] = [];
    let end = -Infinity;
    for (const it of its) {
      const x = it.transform[4]!;
      const gap = x - end;
      const last = cells[cells.length - 1];
      if (last && gap < r.size * 0.9) last.text += (gap > r.size * 0.12 && !last.text.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
      else cells.push({ x, text: it.str });
      end = x + (it.width || it.str.length * r.size * 0.5);
      cells[cells.length - 1]!.end = end;
    }
    return cells.map((c) => ({ x: c.x, end: c.end, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text);
  });
}

/** Lines as text, cells split by two spaces (what `statements check` prints). */
export function linesText(lines: Line[]): string {
  return lines.map((l) => l.map((c) => c.text).join("  ")).join("\n");
}

/** Lines from plain text (cells split by 2+ spaces or tabs): for tests and pasted text. */
export function linesFromText(text: string): Line[] {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const cells: Cell[] = [];
    for (const m of l.matchAll(/\S+(?: \S+)*/g)) cells.push({ x: m.index!, end: m.index! + m[0].length, text: m[0] });
    return cells;
  });
}

/* ------------------------------------------------------------------ words, dates, amounts */

/** Lowercase without Vietnamese marks, for matching words. */
export function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export const DEFAULT_CLOSING_LABELS = [
  "tong so tien phai thanh toan", "so tien phai thanh toan", "tong du no cuoi ky", "du no cuoi ky", "so du cuoi ky",
  "payable amount", "total amount due", "total payment due", "new balance", "closing balance", "statement balance", "amount due",
];
export const DEFAULT_CREDIT_WORDS = ["payment", "refund", "cashback", "cash back", "reversal", "hoan tien", "hoan tra", "thanh toan the", "thanh toan du no", "tra no"];
export const DEFAULT_SKIP_WORDS = [
  "due date", "statement date", "payment due", "minimum", "opening balance", "previous balance", "credit limit", "available", "total",
  "ngay sao ke", "han thanh toan", "toi thieu", "du no dau ky", "han muc", "tong cong",
];

const DATE_RE = /(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?![\d/.-])|(?<![\d/.-])(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?![\d/.-])/g;

/** The dates written in a cell, as ISO dates (dd/mm with no year: the year that puts it on or before `near`, within a year). */
export function datesOf(text: string, near: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    let y: number, mo: number, d: number;
    if (m[4]) (y = +m[4]), (mo = +m[5]!), (d = +m[6]!);
    else {
      d = +m[1]!;
      mo = +m[2]!;
      if (m[3]) y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      else {
        y = +near.slice(0, 4);
        if (`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` > addDays(near, 31)) y--;
      }
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.push(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export interface Amount {
  value: number; // whole units, always positive
  sign: -1 | 1 | 0; // -1: written as a credit (CR, minus, brackets); 1: DR or plus; 0: no mark
  currency?: string; // when written ("VND 33,300", "10.00 USD", "50.000đ")
}

const AMOUNT_RE = /^(?:([A-Za-z]{2,3})\s+)?(\(?)\s*([-+]?)\s*(\d{1,3}(?:[.,\s]\d{3})+|\d{1,9})(?:([.,])(\d{1,2}))?\s*(\)?)\s*(?:(cr|dr|[A-Za-z]{3}|vnđ|đ|₫)|\((vnđ|[A-Za-z]{3})\))?\s*([-+]?)$/i;

/** A cell that is an amount ("1,234,567", "1.234.567", "909", "-50,000", "(50,000)", "50,000 CR", "CR 50,000", "1,234.00", "VND 33,300", "3,483,958 (VND)"); else null. */
export function amountOf(text: string): Amount | null {
  const m = AMOUNT_RE.exec(text.trim());
  if (!m) return null;
  const [, before, open, pre, int, , dec, close, unit1, unit2, post] = m;
  if ((open && !close) || (!open && close)) return null;
  const value = Math.round(Number(int!.replace(/[.,\s]/g, "") + (dec ? "." + dec : "")));
  const b = before?.toLowerCase();
  const u = (unit1 ?? unit2)?.toLowerCase();
  const mark = b === "cr" || b === "dr" ? b : u === "cr" || u === "dr" ? u : undefined;
  const curB = b && b !== "cr" && b !== "dr" ? b : undefined;
  if (b && !curB && !mark) return null;
  if (curB && curB.length !== 3) return null;
  const curU = u && u !== "cr" && u !== "dr" ? u : undefined;
  if (curB && curU) return null; // two currencies
  const sign: Amount["sign"] = open || pre === "-" || post === "-" || mark === "cr" ? -1 : pre === "+" || post === "+" || mark === "dr" ? 1 : 0;
  const cur = curB ?? curU;
  const currency = cur === "đ" || cur === "₫" || cur === "vnđ" ? "VND" : cur?.toUpperCase();
  return { value, sign, ...(currency ? { currency } : {}) };
}

/** A cell that starts with a date. */
const STARTS_WITH_DATE = /^(\d{1,2}[/.-]\d{1,2}([/.-](\d{4}|\d{2}))?|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})(?![\d])/;

const hasWord = (text: string, words: string[]) => {
  const p = plain(text);
  return words.some((w) => {
    const q = plain(w);
    return new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(p);
  });
};

/* ------------------------------------------------------------------ rows */

export interface StatementRow {
  date: ISODate;
  /** On the card, like the ledger: negative = spent (a charge), positive = paid back, refunded, cashback. */
  amount: number;
  description: string;
  /** Why it counts as a credit, when it does. */
  credit?: "mark" | "column" | "word";
  line: number; // 0-based line in the statement
}

export interface ParsedStatement {
  rows: StatementRow[];
  /** The bank's closing figure (positive = owed), when found. */
  closing: number | null;
  closingLabel?: string;
}

/** Where a "credit" column header sits, if the statement has separate debit and credit columns. */
function creditColumn(lines: Line[]): { debit: Cell; credit: Cell } | null {
  for (const l of lines) {
    const d = l.find((c) => /^(debit|ghi no|no|dr|so tien ghi no)$/.test(plain(c.text)));
    const c = l.find((x) => /^(credit|ghi co|co|cr|so tien ghi co)$/.test(plain(x.text)));
    if (d && c) return { debit: d, credit: c };
  }
  return null;
}

/** How far a cell is from a column header: by left edges or right edges, whichever is closer. */
function offset(c: Cell, h: Cell): number {
  const left = Math.abs(c.x - h.x);
  return c.end !== undefined && h.end !== undefined ? Math.min(left, Math.abs(c.end - h.end)) : left;
}

/**
 * Rows and the closing figure of one statement. `period`: the statement period the ledger has for it
 * (rows dated far outside are header dates, not rows).
 */
export function parseStatement(lines: Line[], period: { from: ISODate; close: ISODate }, layout: StatementLayout = {}, base?: string): ParsedStatement {
  /** Amounts in another currency than the ledger's are the original amounts of foreign purchases: not the billed amount. */
  const billed = (a: Amount | null): a is Amount => a !== null && (!a.currency || !base || a.currency === base.toUpperCase());
  const labels = (layout.closing_label ? [layout.closing_label].flat() : DEFAULT_CLOSING_LABELS).map(plain);
  const credits = layout.credit_words ?? DEFAULT_CREDIT_WORDS;
  const skips = [...DEFAULT_SKIP_WORDS, ...(layout.skip_words ?? []), ...labels];
  const col = layout.amount_column ?? -1;
  const cols = creditColumn(lines);
  const lo = addDays(period.from, -40);
  const hi = addDays(period.close, 5);

  // closing figure: the first label (in the order given) found on a line; its amount is the first after it, on the line or the next two
  let closing: number | null = null;
  let closingLabel: string | undefined;
  for (const label of labels) {
    for (let i = 0; i < lines.length && closing === null; i++) {
      const l = lines[i]!;
      const at = l.findIndex((c) => plain(c.text).includes(label));
      if (at < 0 || /minimum|toi thieu/.test(plain(l.map((c) => c.text).join(" ")))) continue;
      // the label's own cell may end with the amount ("Payable amount: 1,234,000")
      const tail = plain(l[at]!.text).split(label)[1]?.replace(/^[\s:]+/, "") ?? "";
      const own = tail ? amountOf(l[at]!.text.slice(l[at]!.text.length - tail.length)) : null;
      // the next lines count only up to a minimum-payment line (its figure is not the closing one)
      const after: Cell[] = [...l.slice(at + 1)];
      for (const n of [lines[i + 1], lines[i + 2]]) {
        if (!n || /minimum|toi thieu/.test(plain(n.map((c) => c.text).join(" ")))) break;
        after.push(...n);
      }
      const found = (billed(own) ? own : null) ?? after.map((c) => amountOf(c.text)).find(billed) ?? null;
      if (found) {
        closing = found.sign === -1 ? -found.value : found.value;
        closingLabel = label;
      }
    }
    if (closing !== null) break;
  }

  const rows: StatementRow[] = [];
  const isCurrency = (t: string) => /^[A-Z]{3}$/.test(t.trim());
  const dated = (l: Line | undefined) => !!l && l.slice(0, 2).some((c) => STARTS_WITH_DATE.test(c.text));
  lines.forEach((l, i) => {
    if (l.length < 2) return;
    // a row starts with a date in its first two cells
    const head = l.slice(0, 2).filter((c) => STARTS_WITH_DATE.test(c.text)).flatMap((c) => datesOf(c.text, period.close));
    const date = head[0];
    if (!date || date < lo || date > hi) return;
    const text = l.map((c) => c.text).join(" ");
    if (hasWord(text, skips)) return;
    const amounts: { cell: Cell; a: Amount }[] = [];
    const desc: string[] = [];
    for (const c of l) {
      const stripped = c.text.replace(DATE_RE, "").trim();
      if (!stripped) continue; // a date cell
      const a = amountOf(c.text);
      if (billed(a)) {
        if (a.value) amounts.push({ cell: c, a }); // a 0 is an empty column (no discount), not the row's amount
      } else if (!a && !isCurrency(stripped)) desc.push(stripped);
    }
    if (!amounts.length) return;
    // no description on the row itself: the bank wrapped it onto the lines around it (lines with no date and no amount)
    if (!desc.length) {
      for (const n of [lines[i - 1], lines[i + 1]]) {
        if (!n || dated(n) || n.some((c) => amountOf(c.text))) continue;
        const t = n.map((c) => c.text).join(" ");
        if (!hasWord(t, skips)) desc.push(t);
      }
    }
    const pick = amounts[col < 0 ? amounts.length + col : col - 1] ?? amounts[amounts.length - 1]!;
    if (!pick.a.value) return;
    const description = desc.join(" ");
    let credit: StatementRow["credit"];
    if (pick.a.sign === -1) credit = "mark";
    else if (pick.a.sign === 0 && cols && offset(pick.cell, cols.credit) < offset(pick.cell, cols.debit)) credit = "column";
    else if (pick.a.sign === 0 && hasWord(description, credits)) credit = "word";
    rows.push({ date, amount: credit ? pick.a.value : -pick.a.value, description, ...(credit ? { credit } : {}), line: i });
  });
  return { rows, closing, ...(closingLabel ? { closingLabel } : {}) };
}
