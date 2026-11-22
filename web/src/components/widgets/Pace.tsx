import { useMemo } from "react";
import { DrillLink } from "@/components/DrillLink";
import { Money } from "@/components/Money";
import { ChartFrame, TrendChart, chartColor, type LineSpec } from "@/components/charts";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/lib/format";
import { useHome } from "@/lib/queries";
import { Delta, useWidgetTitle, type WidgetProps } from "./shared";

export default function Pace({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.pace");
  const { data, error, isLoading } = useHome();
  const p = data?.pace;

  const rows = useMemo(() => {
    if (!p) return [];
    return Array.from({ length: p.daysInMonth }, (_, i) => ({
      day: i + 1,
      now: p.daily[i] ?? null,
      last: p.lastMonth?.daily[i] ?? null,
      usual: p.usual?.daily[i] ?? null,
      band: p.usual?.low?.[i] !== undefined && p.usual?.high?.[i] !== undefined ? ([p.usual.low[i]!, p.usual.high[i]!] as [number, number]) : null,
      low: p.usual?.low?.[i] ?? null,
      high: p.usual?.high?.[i] ?? null,
    }));
  }, [p]);

  const specs: LineSpec[] = [
    ...(p?.usual?.low?.length ? [{ key: "band", label: t("pace.range"), kind: "band" as const, color: chartColor.muted }] : []),
    ...(p?.usual ? [{ key: "usual", label: t("pace.usual"), kind: "line" as const, color: chartColor.muted, width: 1.5 }] : []),
    ...(p?.lastMonth ? [{ key: "last", label: t("pace.lastMonth"), kind: "line" as const, color: chartColor.muted, width: 1, dashed: true }] : []),
    { key: "now", label: t("pace.thisMonth"), kind: "line" as const, color: chartColor.accent, width: 2 },
  ];

  const ref = p?.usual && p.usual.toDate > 0 ? p.usual.toDate : p?.lastMonth && p.lastMonth.toDate > 0 ? p.lastMonth.toDate : null;
  const pct = p && ref ? ((p.spent - ref) / ref) * 100 : null;
  const range = p ? { from: `${p.month}-01`, to: p.asOf } : {};

  return (
    <WidgetCard title={title} titleHref="#/transactions" menu={menu} loading={isLoading} error={error?.message}>
      {p && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <DrillLink filter={range} className="text-2xl font-semibold tracking-tight"><Money amount={p.spent} /></DrillLink>
            {pct !== null && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Delta pct={pct} />
                {p.usual ? t("pace.vsUsual") : t("pace.vsLast")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("pace.estimate")} <Money amount={p.estimate} mode="short" className="font-medium text-foreground" />
          </p>
          <ChartFrame
            legend={specs.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))}
            table={{
              head: [t("chart.day"), t("pace.thisMonth"), ...(p.usual ? [t("pace.usual")] : []), ...(p.usual?.low?.length ? [t("pace.low"), t("pace.high")] : []), ...(p.lastMonth ? [t("pace.lastMonth")] : [])],
              rows: rows.map((r) => [r.day, r.now === null ? "" : formatNumber(r.now, lang), ...(p.usual ? [formatNumber(r.usual ?? 0, lang)] : []), ...(p.usual?.low?.length ? [formatNumber(r.low ?? 0, lang), formatNumber(r.high ?? 0, lang)] : []), ...(p.lastMonth ? [formatNumber(r.last ?? 0, lang)] : [])]),
            }}
          >
            <TrendChart data={rows} xKey="day" specs={specs} xTicks={[1, 8, 15, 22, p.daysInMonth]} />
          </ChartFrame>
        </>
      )}
    </WidgetCard>
  );
}
