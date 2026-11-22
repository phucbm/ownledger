import { useMemo } from "react";
import { ChartFrame, ColumnChart, chartColor } from "@/components/charts";
import { DrillLink } from "@/components/DrillLink";
import { WidgetCard } from "@/components/WidgetCard";
import { navigate } from "@/lib/hash";
import { useI18n } from "@/i18n";
import { monthShort, shiftMonth } from "@/lib/dates";
import { drillHref, monthRange } from "@/lib/drill";
import { formatNumber } from "@/lib/format";
import { useMe, useMonthReport } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

export default function IncomeSpending({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.incomeSpending");
  const today = useMe().data?.today ?? new Date().toISOString().slice(0, 10);
  const months = Math.min(24, Math.max(2, widget.months ?? 6));
  const end = today.slice(0, 7);
  const start = shiftMonth(end, -(months - 1));
  const { data, error, isLoading } = useMonthReport(`${start}-01`, monthRange(end).to);

  const rows = useMemo(() => {
    const by = new Map((data?.rows ?? []).map((r) => [r.key, r]));
    return Array.from({ length: months }, (_, i) => {
      const ym = shiftMonth(start, i);
      const r = by.get(ym);
      return { ym, income: r?.income ?? 0, expense: r?.expense ?? 0 };
    });
  }, [data, months, start]);

  const income = rows.reduce((s, r) => s + r.income, 0);
  const expense = rows.reduce((s, r) => s + r.expense, 0);
  const rate = income > 0 ? ((income - expense) / income) * 100 : null;
  const rate1 = (r: { income: number; expense: number }) => (r.income > 0 ? `${formatNumber(((r.income - r.expense) / r.income) * 100, lang)}%` : "");

  return (
    <WidgetCard title={title} titleHref="#/reports" menu={menu} loading={isLoading} error={error?.message} empty={data && income === 0 && expense === 0 ? t("incsp.empty") : undefined}>
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            {rate === null ? t("incsp.noIncome") : t("incsp.rate", { pct: formatNumber(rate, lang) })}
          </p>
          <ChartFrame
            legend={[
              { label: t("tx.in"), color: chartColor.accent },
              { label: t("tx.out"), color: chartColor.second },
            ]}
            table={{
              head: [t("chart.month"), t("tx.in"), t("tx.out"), t("incsp.rateShort")],
              rows: rows.map((r) => [<DrillLink key={r.ym} filter={monthRange(r.ym)}>{monthShort(r.ym)}</DrillLink>, formatNumber(r.income, lang), formatNumber(r.expense, lang), rate1(r)]),
            }}
          >
            <ColumnChart
              data={rows}
              xKey="ym"
              formatX={(v) => monthShort(String(v))}
              onSelect={(ym) => navigate(drillHref(monthRange(ym)).slice(1))}
              series={[
                { key: "income", label: t("tx.in"), color: chartColor.accent },
                { key: "expense", label: t("tx.out"), color: chartColor.second },
              ]}
            />
          </ChartFrame>
        </>
      )}
    </WidgetCard>
  );
}
