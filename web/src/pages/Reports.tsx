import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { DrillLink } from "@/components/DrillLink";
import { Money } from "@/components/Money";
import { Panel } from "@/components/Panel";
import { PinToHome } from "@/components/PinToHome";
import { BestHint } from "@/components/cards/BestHint";
import { ChartFrame, ColumnChart, chartColor } from "@/components/charts";
import { Delta } from "@/components/widgets/shared";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n";
import { monthShort, shiftMonth } from "@/lib/dates";
import { drillHref, monthRange, type DrillFilter } from "@/lib/drill";
import { formatNumber, formatShort } from "@/lib/format";
import { navigate } from "@/lib/hash";
import { useMe, useMonthReport, useUsualRange } from "@/lib/queries";
import type { SeriesQuery } from "@/lib/types";

type PeriodId = "this-month" | "last-month" | "3-months" | "6-months" | "this-year" | "last-year" | "custom";
type By = "top" | "category" | "account" | "who" | "event" | "tag";
type Kind = "expense" | "income";

const PERIODS: { id: PeriodId; key: string }[] = [
  { id: "this-month", key: "period.thisMonth" },
  { id: "last-month", key: "period.lastMonth" },
  { id: "3-months", key: "period.3months" },
  { id: "6-months", key: "period.6months" },
  { id: "this-year", key: "period.thisYear" },
  { id: "last-year", key: "period.lastYear" },
  { id: "custom", key: "period.custom" },
];

const min = (a: string, b: string) => (a < b ? a : b);

/** A preset as dates. A period that contains today ends today, so it is compared with your usual like for like. */
function rangeOf(id: Exclude<PeriodId, "custom">, today: string): { from: string; to: string } {
  const ym = today.slice(0, 7);
  const y = Number(today.slice(0, 4));
  switch (id) {
    case "this-month":
      return { from: `${ym}-01`, to: today };
    case "last-month":
      return monthRange(shiftMonth(ym, -1));
    case "3-months":
      return { from: `${shiftMonth(ym, -2)}-01`, to: today };
    case "6-months":
      return { from: `${shiftMonth(ym, -5)}-01`, to: today };
    case "this-year":
      return { from: `${y}-01-01`, to: today };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

const drillFor = (by: By, key: string, from: string, to: string): DrillFilter | null => {
  if (key === "(none)") return null;
  const f: DrillFilter = { from, to };
  if (by === "top" || by === "category") f.category = key;
  else if (by === "account") f.account = key;
  else if (by === "who") f.who = key;
  else if (by === "event") f.event = key;
  else f.tag = key;
  return f;
};

export default function Reports() {
  const { t, lang } = useI18n();
  const me = useMe().data;
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const features = me?.features;
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const pid = (PERIODS.some((p) => p.id === params.get("p")) ? params.get("p") : "this-month") as PeriodId;
  const range = pid === "custom" ? { from: params.get("from") || `${today.slice(0, 7)}-01`, to: params.get("to") || today } : rangeOf(pid, today);
  const valid = range.from <= range.to;
  const [by, setBy] = useState<By>("top");
  const [kind, setKind] = useState<Kind>("expense");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const setPeriod = (id: PeriodId, custom?: { from?: string; to?: string }) => {
    const p = new URLSearchParams();
    p.set("p", id);
    if (id === "custom") {
      p.set("from", custom?.from ?? range.from);
      p.set("to", custom?.to ?? range.to);
    }
    navigate(`/reports?${p.toString()}`, { replace: true });
  };

  const bys: By[] = ["top", "category", "account", ...(features?.who ? (["who"] as const) : []), ...(features?.event ? (["event"] as const) : []), ...(features?.tags ? (["tag"] as const) : [])];
  const byNow = bys.includes(by) ? by : "top";
  const usual = useUsualRange(range.from, range.to, byNow, kind);
  const headline = useUsualRange(range.from, range.to, "top", "expense");

  // income and spending by month: the period, or at least the 6 months ending with it
  const endYm = range.to.slice(0, 7);
  const startYm = min(range.from.slice(0, 7), shiftMonth(endYm, -5));
  const fromYm = startYm < shiftMonth(endYm, -23) ? shiftMonth(endYm, -23) : startYm;
  const monthly = useMonthReport(`${fromYm}-01`, monthRange(endYm).to);
  const months = useMemo(() => {
    const by = new Map((monthly.data?.rows ?? []).map((r) => [r.key, r]));
    const n = (Number(endYm.slice(0, 4)) - Number(fromYm.slice(0, 4))) * 12 + Number(endYm.slice(5)) - Number(fromYm.slice(5)) + 1;
    return Array.from({ length: n }, (_, i) => {
      const ym = shiftMonth(fromYm, i);
      const r = by.get(ym);
      return { ym, income: r?.income ?? 0, expense: r?.expense ?? 0 };
    });
  }, [monthly.data, fromYm, endYm]);
  const income = months.reduce((s, r) => s + r.income, 0);
  const expense = months.reduce((s, r) => s + r.expense, 0);
  const rate = income > 0 ? ((income - expense) / income) * 100 : null;
  const rateOf = (r: { income: number; expense: number }) => (r.income > 0 ? `${formatNumber(((r.income - r.expense) / r.income) * 100, lang)}%` : "");

  const usualQuery: SeriesQuery = { metric: kind === "income" ? "income" : "spending", by: byNow, from: range.from, to: range.to, compare: "usual" };
  const monthQuery: SeriesQuery = { metric: "spending", by: "month", from: `${fromYm}-01`, to: monthRange(endYm).to };
  const showHint = Boolean(features?.cards) && kind === "expense" && (byNow === "top" || byNow === "category");
  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (!n.delete(key)) n.add(key);
      return n;
    });
  const h = headline.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("reports.title")}</h1>
        {h ? (
          <p className="text-sm text-muted-foreground">
            <DrillLink filter={{ from: range.from, to: range.to }} className="text-lg font-semibold text-foreground"><Money amount={h.current} /></DrillLink>{" "}
            {h.months >= 1 ? t("reports.headlineUsual", { usual: formatShort(h.usual, lang) }) : t("reports.headline")}
          </p>
        ) : (
          <Skeleton className="h-6 w-72" />
        )}
      </header>

      <div className="flex flex-col gap-3">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <ToggleGroup type="single" variant="outline" value={pid} onValueChange={(v) => v && setPeriod(v as PeriodId)} aria-label={t("period.label")} className="w-max">
            {PERIODS.map((p) => (
              <ToggleGroupItem key={p.id} value={p.id} className="min-h-11 shrink-0 px-3 md:min-h-8">{t(p.key)}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {pid === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("period.from")}</span>
              <Input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setPeriod("custom", { from: e.target.value })} className="h-11 w-auto md:h-9" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("period.to")}</span>
              <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setPeriod("custom", { to: e.target.value })} className="h-11 w-auto md:h-9" />
            </label>
          </div>
        )}
      </div>

      {!valid ? (
        <p className="text-sm text-muted-foreground">{t("reports.badRange")}</p>
      ) : (
        <div className="grid items-start gap-6 2xl:grid-cols-2">
          <Panel title={t("reports.compare")} action={<PinToHome query={usualQuery} title={t("reports.compare")} />}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ToggleGroup type="single" variant="outline" size="sm" value={kind} onValueChange={(v) => v && setKind(v as Kind)} aria-label={t("reports.kind")}>
                <ToggleGroupItem value="expense" className="min-h-11 px-3 md:min-h-8">{t("chart.metric.spending")}</ToggleGroupItem>
                <ToggleGroupItem value="income" className="min-h-11 px-3 md:min-h-8">{t("chart.metric.income")}</ToggleGroupItem>
              </ToggleGroup>
              <div className="-mx-4 max-w-full overflow-x-auto px-4 md:mx-0 md:px-0">
                <ToggleGroup type="single" variant="outline" size="sm" value={byNow} onValueChange={(v) => v && setBy(v as By)} aria-label={t("reports.groupBy")} className="w-max">
                  {bys.map((b) => (
                    <ToggleGroupItem key={b} value={b} className="min-h-11 shrink-0 px-3 md:min-h-8">{t(`reports.by.${b}`)}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>
            {usual.error ? (
              <p className="text-sm text-muted-foreground">{t("common.error", { message: usual.error.message })}</p>
            ) : !usual.data ? (
              <Skeleton className="h-40 w-full" />
            ) : usual.data.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("reports.empty")}</p>
            ) : (
              <>
                {usual.data.months < 1 && <p className="text-xs text-muted-foreground">{t("unusual.needHistory")}</p>}
                <table className="w-full text-sm tabular-nums">
                  <caption className="sr-only">{t("reports.compare")}</caption>
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 text-left font-medium">{t(`reports.by.${byNow}`)}</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">{t("reports.thisPeriod")}</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">{t("reports.usual")}</th>
                      <th scope="col" className="py-1.5 pl-2 text-right font-medium">{t("reports.change")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...usual.data.rows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).map((r) => {
                      const f = drillFor(byNow, r.key, range.from, range.to);
                      const expanded = open.has(r.key);
                      const hint = showHint && r.key !== "(none)";
                      return (
                        <Fragment key={r.key}>
                          <tr className="border-b last:border-0">
                            <td className="max-w-0 py-0">
                              <div className="flex min-h-11 items-center gap-1">
                                {hint && (
                                  <button type="button" aria-expanded={expanded} aria-label={t("reports.bestCard", { name: r.name })} onClick={() => toggle(r.key)} className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8">
                                    {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                                  </button>
                                )}
                                {f ? <DrillLink filter={f} className="truncate">{r.name}</DrillLink> : <span className="truncate">{r.name === "(none)" ? t("reports.none") : r.name}</span>}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-right">{f ? <DrillLink filter={f}><Money amount={r.current} mode="short" /></DrillLink> : <Money amount={r.current} mode="short" />}</td>
                            <td className="px-2 py-1 text-right text-muted-foreground"><Money amount={r.usual} mode="short" /></td>
                            <td className="py-1 pl-2 text-right">
                              <Money amount={r.change} mode="short" plus />
                              <span className="block text-xs">{r.changePct === null ? (r.current > 0 ? <span className="text-muted-foreground">{t("unusual.new")}</span> : null) : <Delta pct={r.changePct} goodWhenDown={kind === "expense"} className="text-xs" />}</span>
                            </td>
                          </tr>
                          {hint && expanded && (
                            <tr className="border-b last:border-0">
                              <td colSpan={4} className="bg-muted/30 px-3 py-2"><BestHint category={r.key} /></td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-medium">
                      <th scope="row" className="py-2 text-left font-medium">{t("reports.total")}</th>
                      <td className="px-2 py-2 text-right"><Money amount={usual.data.current} mode="short" /></td>
                      <td className="px-2 py-2 text-right"><Money amount={usual.data.usual} mode="short" /></td>
                      <td className="py-2 pl-2 text-right"><Money amount={usual.data.current - usual.data.usual} mode="short" plus /></td>
                    </tr>
                  </tfoot>
                </table>
                <p className="text-xs text-muted-foreground">{t("reports.usualNote", { n: usual.data.months })}</p>
              </>
            )}
          </Panel>

          <Panel title={t("reports.byMonth")} action={<PinToHome query={monthQuery} title={t("reports.byMonth")} />}>
            {monthly.error ? (
              <p className="text-sm text-muted-foreground">{t("common.error", { message: monthly.error.message })}</p>
            ) : !monthly.data ? (
              <Skeleton className="h-48 w-full" />
            ) : income === 0 && expense === 0 ? (
              <p className="text-sm text-muted-foreground">{t("incsp.empty")}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{rate === null ? t("incsp.noIncome") : t("incsp.rate", { pct: formatNumber(rate, lang) })}</p>
                <div className="flex h-56 flex-col">
                  <ChartFrame
                    legend={[
                      { label: t("tx.in"), color: chartColor.accent },
                      { label: t("tx.out"), color: chartColor.second },
                    ]}
                    table={{
                      head: [t("chart.month"), t("tx.in"), t("tx.out"), t("incsp.rateShort")],
                      rows: months.map((r) => [<DrillLink key={r.ym} filter={monthRange(r.ym)}>{monthShort(r.ym)}</DrillLink>, formatNumber(r.income, lang), formatNumber(r.expense, lang), rateOf(r)]),
                    }}
                  >
                    <ColumnChart
                      data={months}
                      xKey="ym"
                      formatX={(v) => monthShort(String(v))}
                      onSelect={(ym) => navigate(drillHref(monthRange(ym)).slice(1))}
                      series={[
                        { key: "income", label: t("tx.in"), color: chartColor.accent },
                        { key: "expense", label: t("tx.out"), color: chartColor.second },
                      ]}
                    />
                  </ChartFrame>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
