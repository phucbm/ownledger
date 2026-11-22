import type { Lang } from "@/i18n";

const locales: Record<Lang, string> = { vi: "vi-VN", en: "en-US" };
export const localeOf = (lang: Lang) => locales[lang];

/** Tailwind classes for money and counts: tabular figures, right-aligned. */
export const tabular = "tabular-nums text-right";

const nf = (lang: Lang, max: number) => new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: max });
const sign = (n: number) => (n < 0 ? "−" : "");

/** Full money for reading: `8.420.000 ₫` (vi), `8,420,000 ₫` (en). VND keeps the mark after the number. */
export function formatMoney(amount: number, lang: Lang, base = "VND"): string {
  if (base === "VND") return `${sign(amount)}${nf(lang, 0).format(Math.abs(amount))} ₫`;
  return new Intl.NumberFormat(localeOf(lang), { style: "currency", currency: base }).format(amount);
}

/** Short money for scanning, no currency mark: `8,4 tr` / `1,24 tỷ` / `900k` (vi), `8.4M` / `1.24B` / `900k` (en). */
export function formatShort(amount: number, lang: Lang): string {
  const a = Math.abs(amount);
  const s = sign(amount);
  const vi = lang === "vi";
  if (a >= 999_500_000) return `${s}${nf(lang, 2).format(a / 1e9)}${vi ? " t\u1ef7" : "B"}`;
  if (a >= 999_500) return `${s}${nf(lang, 1).format(a / 1e6)}${vi ? " tr" : "M"}`;
  if (a >= 1000) return `${s}${nf(lang, 0).format(a / 1e3)}k`;
  return `${s}${nf(lang, 0).format(a)}`;
}

export const formatNumber = (n: number, lang: Lang, max = 0) => nf(lang, max).format(n);

/** Parses `YYYY-MM-DD` as a local date (no timezone shift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function formatDate(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }): string {
  return new Intl.DateTimeFormat(localeOf(lang), opts).format(parseDate(iso));
}
