import type { ISODate } from "./types.js";

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(s: unknown): s is ISODate {
  if (typeof s !== "string") return false;
  const m = RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parts(d: ISODate): [number, number, number] {
  return [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
}

export function fmt(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Same day-of-month n months later, clamped to the month's last day. */
export function addMonths(d: ISODate, n: number, day?: number): ISODate {
  const [y, m, dd] = parts(d);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return fmt(ny, nm, Math.min(day ?? dd, daysInMonth(ny, nm)));
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = Date.UTC(...ymd0(d)) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.UTC(...ymd0(b)) - Date.UTC(...ymd0(a))) / 86400000);
}

function ymd0(d: ISODate): [number, number, number] {
  const [y, m, dd] = parts(d);
  return [y, m - 1, dd];
}

/** The date in month (y, m) for a day-of-month, clamped. */
export function dayIn(y: number, m: number, day: number): ISODate {
  return fmt(y, m, Math.min(day, daysInMonth(y, m)));
}

export function monthOf(d: ISODate): string {
  return d.slice(0, 7);
}

export function monthStart(d: ISODate): ISODate {
  return d.slice(0, 7) + "-01";
}

export function monthEnd(d: ISODate): ISODate {
  const [y, m] = parts(d);
  return fmt(y, m, daysInMonth(y, m));
}

export function todayIn(tz = "Asia/Ho_Chi_Minh", now = new Date()): ISODate {
  // en-CA formats as yyyy-mm-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
