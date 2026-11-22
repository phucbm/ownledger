import { useState, type ReactNode } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { DrillLink } from "@/components/DrillLink";
import { useI18n } from "@/i18n";
import { formatShort } from "@/lib/format";
import { cn } from "@/lib/utils";

// Colours: one accent (chart-1), a second hue only when two measures share a chart (chart-2), greys for context.
export const chartColor = { accent: "var(--chart-1)", second: "var(--chart-2)", muted: "var(--chart-muted)" } as const;

export interface TableData {
  head: string[];
  rows: ReactNode[][];
}

/** A chart with a "Show as table" toggle (the table is the accessible form of the same numbers). */
export function ChartFrame({ children, table, className, legend }: { children: ReactNode; table?: TableData; className?: string; legend?: { label: string; color: string; dashed?: boolean }[] }) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-1", className)}>
      {legend && legend.length > 1 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0 w-4 border-t-2" style={{ borderColor: l.color, borderStyle: l.dashed ? "dashed" : "solid" }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {asTable && table ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-muted-foreground">
                {table.head.map((h, i) => (
                  <th key={h} className={cn("py-1 font-medium", i > 0 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {r.map((c, j) => (
                    <td key={j} className={cn("py-1", j > 0 && "text-right")}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{children}</div>
      )}
      {table && (
        <Button type="button" variant="ghost" size="xs" className="min-h-11 self-start text-muted-foreground md:min-h-6" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? t("chart.showChart") : t("chart.showTable")}
        </Button>
      )}
    </div>
  );
}

export interface LineSpec {
  key: string;
  label: string;
  /** "band" draws the range between a low and a high value; its data point is `[low, high]`. */
  kind: "line" | "area" | "band";
  color: string;
  width?: number;
  dashed?: boolean;
}

/** Lines and/or a soft area over a shared x axis (cumulative month, balance over time). Tooltip on hover/tap. */
export function TrendChart({ data, xKey, specs, formatX, formatTip, xTicks, className }: { data: Record<string, number | string | null | undefined | [number, number]>[]; xKey: string; specs: LineSpec[]; formatX?: (v: string | number) => string; formatTip?: (v: string | number) => string; xTicks?: (string | number)[]; className?: string }) {
  const { lang } = useI18n();
  const config: ChartConfig = Object.fromEntries(specs.map((s) => [s.key, { label: s.label, color: s.color }]));
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-full min-h-32 w-full", className)}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={6} ticks={xTicks} tickFormatter={formatX} interval={xTicks ? 0 : "preserveStartEnd"} minTickGap={24} />
        <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatShort(v, lang)} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={formatTip ? (_l, p) => formatTip(p?.[0]?.payload?.[xKey]) : undefined} formatter={(v, _n, item) => <span className="flex w-full justify-between gap-3"><span className="text-muted-foreground">{config[String(item.dataKey)]?.label}</span><span className="font-mono font-medium tabular-nums">{Array.isArray(v) ? `${formatShort(Number(v[0]), lang)} – ${formatShort(Number(v[1]), lang)}` : formatShort(Number(v), lang)}</span></span>} />} />
        {specs.map((s) =>
          s.kind === "band" ? (
            <Area key={s.key} dataKey={s.key} type="monotone" stroke="none" fill={s.color} fillOpacity={0.3} isAnimationActive={false} connectNulls={false} />
          ) : s.kind === "area" ? (
            <Area key={s.key} dataKey={s.key} type="monotone" stroke="none" fill={s.color} fillOpacity={0.22} isAnimationActive={false} connectNulls={false} />
          ) : (
            <Line key={s.key} dataKey={s.key} type="monotone" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? "4 3" : undefined} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

/** Vertical columns, one or two series per x. Each column is 2px apart; the data end is rounded. */
export function ColumnChart({ data, xKey, series, formatX, formatTip, onSelect, className }: { data: Record<string, number | string>[]; xKey: string; series: BarSeries[]; onSelect?: (x: string) => void; formatX?: (v: string | number) => string; formatTip?: (v: string | number) => string; className?: string }) {
  const { lang } = useI18n();
  const config: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-full min-h-32 w-full", className)}>
      <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={6} tickFormatter={formatX} />
        <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatShort(v, lang)} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent labelFormatter={formatTip ? (_l, p) => formatTip(p?.[0]?.payload?.[xKey]) : undefined} formatter={(v, _n, item) => <span className="flex w-full justify-between gap-3"><span className="text-muted-foreground">{config[String(item.dataKey)]?.label}</span><span className="font-mono font-medium tabular-nums">{formatShort(Number(v), lang)}</span></span>} />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} cursor={onSelect ? "pointer" : undefined} onClick={onSelect ? (d: { payload?: Record<string, unknown> }) => onSelect(String(d.payload?.[xKey])) : undefined} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export interface BarRow {
  key: string;
  name: ReactNode;
  value: number;
  /** Text under or beside the bar (share, change). */
  meta?: ReactNode;
  href?: string;
  /** Short label for the value. */
  label: ReactNode;
}

/** Horizontal bars as plain HTML: readable on a phone, every bar can drill down. */
export function HBars({ rows, className }: { rows: BarRow[]; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {rows.map((r) => {
        const inner = (
          <>
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className="shrink-0 tabular-nums">{r.label}</span>
            </span>
            <span className="h-2 w-full rounded-full bg-muted" aria-hidden>
              <span className="block h-2 rounded-full" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`, background: chartColor.accent }} />
            </span>
            {r.meta && <span className="text-xs text-muted-foreground">{r.meta}</span>}
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <DrillLink href={r.href} className="flex min-h-11 flex-col justify-center gap-1 py-1 no-underline hover:no-underline hover:bg-muted/50">{inner}</DrillLink>
            ) : (
              <div className="flex min-h-11 flex-col justify-center gap-1 py-1">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
