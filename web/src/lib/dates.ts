import type { Lang } from "@/i18n";
import { localeOf, parseDate } from "./format";

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** `yyyy-mm` shifted by n months. */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const monthName = (ym: string, lang: Lang) => new Intl.DateTimeFormat(localeOf(lang), { month: "long" }).format(parseDate(`${ym}-01`));
export const monthShort = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(2, 4)}`;
export const dayMonth = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;

export function addDaysIso(isoDate: string, n: number): string {
  const d = parseDate(isoDate);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}
