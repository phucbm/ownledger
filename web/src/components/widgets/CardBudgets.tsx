import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { cardHref } from "@/lib/cards";
import { formatDate, formatShort } from "@/lib/format";
import { useCardsModule, useMe } from "@/lib/queries";
import type { CardSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWidgetTitle, type WidgetProps } from "./shared";

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} className="h-1.5 w-full rounded-full bg-muted">
      <div className="h-1.5 rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(ratio ? 2 : 0, ratio * 100)}%` }} />
    </div>
  );
}

/** Soonest last safe day first; cards past it (counting for the next statement) go last. */
const order = (c: CardSummary) => {
  const d = c.cashback?.daysLeft;
  return d === undefined ? 1e6 : d < 0 ? 1e5 + d : d;
};

/**
 * The owner's spend budget per card this statement: for each cashback group, what it earned against its cap and how
 * much more spending still earns, with the last safe day to spend (statement date − post margin).
 */
export default function CardBudgets({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.card_budgets");
  const on = Boolean(useMe().data?.features?.cards);
  const { data, error, isLoading } = useCardsModule(on);
  const rows = (data?.cards ?? []).filter((c) => c.status !== "cancelled" && c.cashback?.safeUntil).sort((x, y) => order(x) - order(y));
  return (
    <WidgetCard title={title} titleHref="#/cards" menu={menu} loading={on && isLoading} error={on ? error?.message : undefined} empty={!on || (data && rows.length === 0) ? t("budgets.empty") : undefined}>
      <ul className="flex flex-col divide-y">
        {rows.map((c) => {
          const cb = c.cashback!;
          const days = cb.daysLeft ?? 0;
          const capped = (cb.groups ?? []).filter((g) => g.cap !== null);
          return (
            <li key={c.account} className="flex flex-col gap-1.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <a href={cardHref(c.account)} className="min-w-0 truncate rounded-md text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{c.name}</a>
                <span className={cn("shrink-0 text-xs tabular-nums", days < 0 ? "text-muted-foreground" : days <= 3 ? "font-medium text-warning" : "text-muted-foreground")}>
                  {days < 0 ? t("budgets.nextPeriod") : t("budgets.safe", { date: formatDate(cb.safeUntil!, lang, { day: "2-digit", month: "2-digit" }), n: days })}
                </span>
              </div>
              {cb.minSpend !== null && !cb.minMet && <p className="text-xs text-warning">{t("cards.minNeed", { amount: formatShort(cb.needForMin, lang), min: formatShort(cb.minSpend, lang) })}</p>}
              {capped.map((g) => (
                <div key={g.label} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{g.label}{g.rate !== null && <span className="text-muted-foreground"> · {g.rate}%</span>}{g.inStore && <span className="text-muted-foreground"> · {t("cards.inStore")}</span>}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{g.room ? t("budgets.room", { amount: formatShort(g.room, lang) }) : t("budgets.full")}</span>
                  </div>
                  <Bar value={g.earned} max={g.cap!} label={g.label} />
                </div>
              ))}
              {!capped.length && cb.roomSpend != null && (
                <p className="text-xs text-muted-foreground">{cb.roomSpend > 0 ? t(cb.roomEstimate ? "cards.roomEstimate" : "cards.room", { amount: formatShort(cb.roomSpend, lang) }) : t("budgets.full")}</p>
              )}
              {c.points?.canRedeem && c.points.redeemMin !== null && (
                <p className="text-xs text-muted-foreground">{t("budgets.points", { points: formatShort(c.points.balance, lang) })}</p>
              )}
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
