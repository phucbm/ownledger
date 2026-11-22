import { HBars } from "@/components/charts";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { shiftMonth } from "@/lib/dates";
import { drillHref } from "@/lib/drill";
import { formatNumber } from "@/lib/format";
import { useMe, useUsual } from "@/lib/queries";
import { Delta, useWidgetTitle, type WidgetProps } from "./shared";

/** The report API takes yyyy-mm or yyyy; the widget option may also be a preset. */
export function reportPeriod(spec: string | undefined, today: string): string {
  const ym = today.slice(0, 7);
  switch (spec) {
    case "last-month":
      return shiftMonth(ym, -1);
    case "this-year":
      return today.slice(0, 4);
    case "last-year":
      return String(Number(today.slice(0, 4)) - 1);
    default:
      return spec && /^\d{4}(-\d{2})?$/.test(spec) ? spec : ym;
  }
}

export default function ByCategory({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.byCategory");
  const me = useMe().data;
  const period = reportPeriod(widget.period, me?.today ?? new Date().toISOString().slice(0, 10));
  const { data, error, isLoading } = useUsual(period, "top");
  const rows = (data?.rows ?? []).filter((r) => r.current > 0).sort((a, b) => b.current - a.current).slice(0, 8);
  const total = data?.current ?? 0;
  return (
    <WidgetCard title={title} titleHref="#/reports" menu={menu} loading={isLoading} error={error?.message} empty={data && rows.length === 0 ? t("bycat.empty") : undefined}>
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            {t("bycat.total")} <Money amount={total} mode="short" className="font-medium text-foreground" />
          </p>
          <HBars
            rows={rows.map((r) => ({
              key: r.key,
              name: (
                <span className="flex items-center gap-2">
                  <CategoryIcon category={r.key} name={r.name} className="size-6 [&_svg]:size-3" />
                  <span className="truncate">{r.name}</span>
                </span>
              ),
              value: r.current,
              label: <Money amount={r.current} mode="short" className="font-medium" />,
              meta: (
                <span className="flex items-center gap-2">
                  <span>{formatNumber((r.current / (total || 1)) * 100, lang)}%</span>
                  {r.changePct !== null && data.months >= 1 && <><Delta pct={r.changePct} className="text-xs" /><span>{t("pace.vsUsual")}</span></>}
                </span>
              ),
              href: drillHref({ category: r.key, from: data.period.from, to: data.period.to }),
            }))}
          />
        </>
      )}
    </WidgetCard>
  );
}
