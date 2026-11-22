import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { dayMonth } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { useDeposits, useMe } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

export default function Deposits({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.deposits");
  const on = Boolean(useMe().data?.features?.deposits);
  const { data, error, isLoading } = useDeposits(on);
  const list = [...(data ?? [])].sort((a, b) => (a.daysToMaturity ?? 1e9) - (b.daysToMaturity ?? 1e9));
  return (
    <WidgetCard title={title} menu={menu} loading={on && isLoading} error={on ? error?.message : undefined} empty={!on || (data && list.length === 0) ? t("deposits.empty") : undefined}>
      <ul className="flex flex-col divide-y">
        {list.map((d) => (
          <li key={d.account}>
            <a href={`#/transactions?account=${encodeURIComponent(d.account)}`} className="flex min-h-11 items-center gap-2 rounded-md py-1.5 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {d.maturity ? `${d.daysToMaturity! < 0 ? t("deposits.matured") : t("deposits.inDays", { n: d.daysToMaturity! })} · ${dayMonth(d.maturity)}` : t("deposits.noMaturity")}
                  {d.rate !== null && ` · ${formatNumber(d.rate, lang, 2)}%`}
                </span>
                {d.interestAtMaturity ? <span className="text-xs text-muted-foreground">{t("deposits.interest")} <Money amount={d.interestAtMaturity} mode="short" /></span> : null}
              </span>
              <Money amount={d.balance} mode="short" className="shrink-0 text-sm font-medium" />
            </a>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
