import { Money } from "@/components/Money";
import { DaysLeft, UsedBar } from "@/components/cards/bits";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { cardHref } from "@/lib/cards";
import { dayMonth } from "@/lib/dates";
import { useCardsModule, useMe } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

const SHOWN = 8;

/** Credit cards: used against limit, what to pay and the days to the due date, nearest due first. */
export default function Cards({ widget, menu }: WidgetProps) {
  const { t } = useI18n();
  const title = useWidgetTitle(widget, "widget.cards");
  const on = Boolean(useMe().data?.features?.cards);
  const { data, error, isLoading } = useCardsModule(on);
  const list = (data?.cards ?? []).filter((c) => c.status !== "cancelled");
  return (
    <WidgetCard title={title} titleHref="#/cards" menu={menu} loading={on && isLoading} error={on ? error?.message : undefined} empty={!on || (data && list.length === 0) ? t("cards.emptyCredit") : undefined}>
      <ul className="flex flex-col divide-y">
        {list.slice(0, SHOWN).map((c) => (
          <li key={c.account} className="flex flex-col gap-1.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <a href={cardHref(c.account)} className="min-w-0 truncate rounded-md text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{c.name}</a>
              {c.toPay > 0 ? (
                <span className="flex shrink-0 items-baseline gap-2">
                  <Money amount={c.toPay} mode="short" className="text-sm font-medium" />
                  {c.due && <span className="text-xs text-muted-foreground">{dayMonth(c.due)}</span>}
                  <DaysLeft days={c.daysToDue} />
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{t("cards.nothingToPay")}</span>
              )}
            </div>
            <UsedBar owed={c.owed} limit={c.limit} atLeast={c.limitAtLeast} />
          </li>
        ))}
      </ul>
      {list.length > SHOWN && (
        <a href="#/cards" className="min-h-11 self-start py-2 text-sm underline">{t("attention.seeAll", { n: list.length })}</a>
      )}
    </WidgetCard>
  );
}
