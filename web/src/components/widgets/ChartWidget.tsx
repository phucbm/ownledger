import { useMemo } from "react";
import { ChartFrame, ColumnChart, HBars, TrendChart, chartColor } from "@/components/charts";
import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { dayMonth, monthShort } from "@/lib/dates";
import { drillHref } from "@/lib/drill";
import { formatNumber } from "@/lib/format";
import { useSeries } from "@/lib/queries";
import type { Series, SeriesQuery } from "@/lib/types";
import { Delta, type WidgetProps } from "./shared";

const TIME_BY = new Set(["day", "week", "month"]);

/** Where a point of the series drills down to. */
function pointHref(q: SeriesQuery, by: string, key: string, period: { from: string; to: string }): string | undefined {
  const base = { from: period.from, to: period.to, category: q.category, account: Array.isArray(q.account) ? undefined : q.account, who: q.who, event: q.event, tag: q.tag, text: q.text };
  switch (by) {
    case "category":
    case "top":
      return drillHref({ ...base, category: key });
    case "account":
      return drillHref({ ...base, account: key });
    case "who":
      return drillHref({ ...base, who: key });
    case "event":
      return drillHref({ ...base, event: key });
    case "tag":
      return drillHref({ ...base, tag: key });
    case "month": {
      const [y, m] = key.split("-").map(Number) as [number, number];
      return drillHref({ ...base, from: `${key}-01`, to: `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` });
    }
    case "day":
      return drillHref({ ...base, from: key, to: key });
    default:
      return undefined;
  }
}

export default function ChartWidget({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const q = widget.query;
  const { data, error, isLoading } = useSeries(q ?? { metric: "spending" }, Boolean(q));
  const kind = widget.chart ?? "bar";
  const title = widget.title?.trim() || t("widget.chart");
  return (
    <WidgetCard title={title} menu={menu} byAi={widget.by_ai} loading={Boolean(q) && isLoading} error={q ? error?.message : undefined} empty={!q ? t("chart.noQuery") : data && data.points.length === 0 && kind !== "stat" ? t("chart.empty") : undefined}>
      {data && q && <Body data={data} q={q} kind={kind} lang={lang} />}
    </WidgetCard>
  );
}

function Body({ data, q, kind, lang }: { data: Series; q: SeriesQuery; kind: NonNullable<WidgetProps["widget"]["chart"]>; lang: "vi" | "en" }) {
  const { t } = useI18n();
  const isTime = TIME_BY.has(data.by);
  const isCount = q.metric === "count";
  const xFmt = (v: string | number) => (data.by === "month" ? monthShort(String(v)) : dayMonth(String(v)));
  const rows = useMemo(() => data.points.map((p) => ({ key: p.key, name: p.name, value: p.value, compare: p.compare ?? null })), [data]);
  const hasCompare = rows.some((r) => r.compare !== null);
  const table = {
    head: [t("chart.item"), t("chart.value"), ...(hasCompare ? [t("chart.compare")] : [])],
    rows: rows.map((r) => [isTime ? xFmt(r.key) : r.name, formatNumber(r.value, lang), ...(hasCompare ? [formatNumber(r.compare ?? 0, lang)] : [])]),
  };
  const money = (n: number) => (isCount ? <span className="tabular-nums">{formatNumber(n, lang)}</span> : <Money amount={n} mode="short" />);

  if (kind === "stat") {
    const pct = data.compareTotal ? ((data.total - data.compareTotal) / Math.abs(data.compareTotal)) * 100 : null;
    return (
      <>
        <a href={drillHref({ from: data.period.from, to: data.period.to, category: q.category, account: Array.isArray(q.account) ? undefined : q.account, who: q.who, event: q.event, tag: q.tag, text: q.text })} className="text-2xl font-semibold tracking-tight outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          {isCount ? formatNumber(data.total, lang) : <Money amount={data.total} />}
        </a>
        {pct !== null && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Delta pct={pct} goodWhenDown={q.metric === "spending"} />
            {q.compare === "usual" ? t("pace.vsUsual") : t("chart.vsPrevious")}
          </p>
        )}
      </>
    );
  }
  if (kind === "table") {
    return (
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            {table.head.map((h, i) => (
              <th key={h} className={`py-1 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-t">
              <td className="py-1.5">
                <a className="hover:underline" href={pointHref(q, data.by, r.key, data.period)}>{table.rows[i]![0]}</a>
              </td>
              <td className="py-1.5 text-right">{money(r.value)}</td>
              {hasCompare && <td className="py-1.5 text-right text-muted-foreground">{money(r.compare ?? 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (kind === "hbar") {
    return (
      <HBars
        rows={rows.map((r) => ({ key: r.key, name: isTime ? xFmt(r.key) : r.name, value: r.value, label: money(r.value), href: pointHref(q, data.by, r.key, data.period) }))}
      />
    );
  }
  // line and bar: time on x when the query goes by day, week or month; otherwise one column per group
  const series = [{ key: "value", label: title(q, t), color: chartColor.accent }, ...(hasCompare ? [{ key: "compare", label: q.compare === "usual" ? t("pace.usual") : t("chart.previous"), color: chartColor.muted }] : [])];
  return (
    <ChartFrame table={table} legend={series.map((s) => ({ label: s.label, color: s.color }))}>
      {kind === "line" ? (
        <TrendChart data={rows} xKey="key" formatX={isTime ? xFmt : (v) => rows.find((r) => r.key === v)?.name ?? String(v)} specs={series.map((s) => ({ key: s.key, label: s.label, kind: "line" as const, color: s.color, width: s.key === "value" ? 2 : 1, dashed: s.key !== "value" }))} />
      ) : (
        <ColumnChart data={rows.map((r) => ({ key: r.key, value: r.value, ...(hasCompare ? { compare: r.compare ?? 0 } : {}) }))} xKey="key" formatX={isTime ? xFmt : (v) => rows.find((r) => r.key === v)?.name ?? String(v)} series={series} />
      )}
    </ChartFrame>
  );
}

function title(q: SeriesQuery, t: (k: string) => string) {
  return t(`chart.metric.${q.metric}`);
}
