import { useMemo } from "react";
import { ChartFrame, TrendChart, chartColor } from "@/components/charts";
import { DrillLink } from "@/components/DrillLink";
import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { monthShort } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { useMe, useMeta, useSeries } from "@/lib/queries";
import type { WidgetProps } from "./shared";

export default function Account({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const meta = useMeta().data;
  const id = widget.account;
  const me = useMe().data;
  const name = id === "pool" ? me?.pool?.name || t("pool.name") : meta?.accounts.find((a) => a.id === id)?.name;
  const title = widget.title?.trim() || name || t("widget.account");
  const { data, error, isLoading } = useSeries({ metric: "balance", account: id ?? "", by: "month", period: "last-12-months" }, Boolean(id));
  const rows = useMemo(() => (data?.points ?? []).map((p) => ({ ym: p.key, v: p.value })), [data]);
  const last = rows[rows.length - 1];
  return (
    <WidgetCard title={title} titleHref={id ? `#/transactions?account=${encodeURIComponent(id)}` : undefined} menu={menu} loading={Boolean(id) && isLoading} error={id ? error?.message : undefined} empty={!id ? t("account.pick") : data && rows.length === 0 ? t("account.empty") : undefined}>
      {last && (
        <>
          <DrillLink filter={{ account: id }} className="text-2xl font-semibold tracking-tight"><Money amount={last.v} /></DrillLink>
          <ChartFrame table={{ head: [t("chart.month"), t("account.balance")], rows: rows.map((r) => [monthShort(r.ym), formatNumber(r.v, lang)]) }}>
            <TrendChart data={rows} xKey="ym" formatX={(v) => monthShort(String(v))} specs={[{ key: "v", label: t("account.balance"), kind: "line", color: chartColor.accent }]} />
          </ChartFrame>
        </>
      )}
    </WidgetCard>
  );
}
