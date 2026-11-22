import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { cardHref } from "@/lib/cards";
import { formatShort } from "@/lib/format";
import { useCardsModule, useMe } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

/** Cashback this period on every card with cashback terms: expected, and what is left of its cap. */
export default function Cashback({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.cashback");
  const on = Boolean(useMe().data?.features?.cards);
  const { data, error, isLoading } = useCardsModule(on);
  const rows = (data?.cards ?? []).filter((c) => c.status !== "cancelled" && c.cashback && (c.cashback.cap !== null || c.cashback.expected > 0 || c.cashback.spend > 0 || c.cashback.incomplete));
  const total = rows.reduce((s, c) => s + (c.cashback?.expected ?? 0), 0);
  return (
    <WidgetCard title={title} titleHref="#/cards" menu={menu} loading={on && isLoading} error={on ? error?.message : undefined} empty={!on || (data && rows.length === 0) ? t("cashback.empty") : undefined}>
      <p className="text-sm text-muted-foreground">
        {t("cashback.total")} <Money amount={total} mode="short" className="font-medium text-foreground" />
      </p>
      <ul className="flex flex-col divide-y">
        {rows.map((c) => {
          const cb = c.cashback!;
          const used = cb.cap ? Math.min(1, (cb.cap - (cb.capLeft ?? cb.cap)) / cb.cap) : 0;
          return (
            <li key={c.account} className="flex flex-col gap-1 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <a href={cardHref(c.account)} className="min-w-0 truncate rounded-md text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{c.name}</a>
                {cb.incomplete ? <span className="shrink-0 text-xs text-amber-700">{t("cards.rateNotSet")}</span> : <Money amount={cb.expected} mode="short" className="shrink-0 text-sm font-medium" />}
              </div>
              {cb.cap !== null && (
                <>
                  <div role="progressbar" aria-label={t("cards.capLeftLabel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} className="h-1.5 w-full rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(used ? 2 : 0, used * 100)}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{t("cards.capLeft", { amount: formatShort(cb.capLeft ?? cb.cap, lang) })}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
