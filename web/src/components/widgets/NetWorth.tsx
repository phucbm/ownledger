import { useMemo } from "react";
import { Money } from "@/components/Money";
import { ChartFrame, TrendChart, chartColor } from "@/components/charts";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { formatNumber, formatShort } from "@/lib/format";
import { monthShort } from "@/lib/dates";
import { useHome } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

export default function NetWorth({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.netWorth");
  const { data, error, isLoading } = useHome();
  const nw = data?.netWorth;
  const rows = useMemo(() => (nw?.series ?? []).map((s) => ({ date: s.date, ym: s.date.slice(0, 7), net: s.net })), [nw]);
  const change = (v: number | null, key: string) =>
    v === null ? null : (
      <li className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">{t(key)}</span>
        <Money amount={v} mode="short" tone="auto" plus className="font-medium" />
      </li>
    );
  return (
    <WidgetCard title={title} titleHref="#/accounts" menu={menu} loading={isLoading} error={error?.message}>
      {nw && data && (
        <>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatShort(nw.net, lang)}</p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {change(nw.changeMonth, "nw.changeMonth")}
            {change(nw.change12, "nw.change12")}
            {data.pool.on && (
              <li className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">{data.pool.name ?? t("pool.name")}</span>
                <Money amount={data.pool.balance} mode="short" className="font-medium" />
              </li>
            )}
          </ul>
          {nw.unpriced > 0 && <p className="text-xs text-muted-foreground">{t("nw.unpriced", { n: nw.unpriced })}</p>}
          <ChartFrame table={{ head: [t("chart.month"), t("widget.netWorth")], rows: rows.map((r) => [monthShort(r.ym), formatNumber(r.net, lang)]) }}>
            <TrendChart data={rows} xKey="ym" formatX={(v) => monthShort(String(v))} specs={[{ key: "net", label: t("widget.netWorth"), kind: "line", color: chartColor.accent }]} />
          </ChartFrame>
        </>
      )}
    </WidgetCard>
  );
}
