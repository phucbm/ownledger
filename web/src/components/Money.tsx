import { useI18n } from "@/i18n";
import { formatMoney, formatShort } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

export type MoneyTone = "auto" | "in" | "out" | "transfer" | "none";

const toneClass: Record<Exclude<MoneyTone, "auto" | "none">, string> = {
  in: "text-emerald-700",
  out: "text-red-700",
  transfer: "text-muted-foreground",
};

/**
 * One amount. `full` for reading (8.420.000 ₫), `short` for scanning (8,4 tr).
 * tone "auto" colours by sign (green in, red out); "none" keeps the text colour.
 * `plus` shows + on positive amounts (for in/out lists).
 */
export function Money({ amount, mode = "full", tone = "none", plus = false, className }: { amount: number; mode?: "full" | "short"; tone?: MoneyTone; plus?: boolean; className?: string }) {
  const { lang } = useI18n();
  const base = useMe().data?.base ?? "VND";
  const text = mode === "short" ? formatShort(amount, lang) : formatMoney(amount, lang, base);
  const sign = Math.sign(amount);
  const kind = tone === "auto" ? (sign === 1 ? "in" : sign === -1 ? "out" : "none") : tone;
  return <span className={cn("whitespace-nowrap tabular-nums", kind !== "none" && toneClass[kind], className)}>{plus && sign === 1 ? "+" : ""}{text}</span>;
}
