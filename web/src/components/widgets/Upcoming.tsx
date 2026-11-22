import { useMemo } from "react";
import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { addDaysIso, daysBetween, dayMonth } from "@/lib/dates";
import { useCards, useMe, usePlansDue } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useWidgetTitle, type WidgetProps } from "./shared";

interface Due {
  key: string;
  name: string;
  date: string;
  amount: number;
  overdue: boolean;
  href?: string;
}

export default function Upcoming({ widget, menu }: WidgetProps) {
  const { t } = useI18n();
  const title = useWidgetTitle(widget, "widget.upcoming");
  const me = useMe().data;
  const today = me?.today ?? "";
  const plans = usePlansDue(30);
  const cards = useCards(Boolean(me?.features?.cards));
  const loading = plans.isLoading || (Boolean(me?.features?.cards) && cards.isLoading);

  const { items, weeks, total } = useMemo(() => {
    const items: Due[] = [];
    for (const d of plans.data?.due ?? []) items.push({ key: `p-${d.plan}-${d.date}`, name: d.name, date: d.date, amount: d.amount, overdue: d.overdue, href: "#/plans" });
    const end = addDaysIso(today, 30);
    for (const c of cards.data ?? []) {
      const owed = c.toPay ?? 0;
      if (0 < owed && c.dueDate && c.dueDate <= end) items.push({ key: `c-${c.account}`, name: c.name, date: c.dueDate, amount: c.toPay!, overdue: c.dueDate < today, href: `#/cards/${encodeURIComponent(c.account)}` });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    // five strips: days 0-6, 7-13, ... 28-34 (overdue counts in the first)
    const weeks = Array.from({ length: 5 }, (_, i) => ({ start: addDaysIso(today, i * 7), amount: 0 }));
    for (const it of items) {
      const w = Math.min(4, Math.max(0, Math.floor(daysBetween(today, it.date) / 7)));
      weeks[w]!.amount += it.amount;
    }
    return { items, weeks, total: items.reduce((s, i) => s + i.amount, 0) };
  }, [plans.data, cards.data, today]);

  const max = Math.max(1, ...weeks.map((w) => w.amount));
  return (
    <WidgetCard title={title} titleHref="#/plans" menu={menu} loading={loading} error={plans.error?.message} empty={!loading && items.length === 0 ? t("upcoming.empty") : undefined}>
      <p className="text-sm text-muted-foreground">
        {t("upcoming.total")} <Money amount={total} mode="short" className="font-medium text-foreground" />
      </p>
      <ol className="grid grid-cols-5 gap-1.5" aria-label={t("upcoming.weeks")}>
        {weeks.map((w) => (
          <li key={w.start} className="flex flex-col items-center gap-1">
            <span className="flex h-10 w-full items-end rounded-sm bg-muted">
              <span className="w-full rounded-sm" style={{ height: `${w.amount ? Math.max(8, (w.amount / max) * 100) : 0}%`, background: "var(--chart-1)" }} />
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{dayMonth(w.start)}</span>
            <span className="text-xs tabular-nums">{w.amount ? <Money amount={w.amount} mode="short" /> : "–"}</span>
          </li>
        ))}
      </ol>
      <ul className="flex flex-col divide-y">
        {items.slice(0, 6).map((it) => (
          <li key={it.key}>
            <a href={it.href} className="flex min-h-11 items-center gap-2 rounded-md py-1 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{it.name}</span>
                <span className={cn("text-xs", it.overdue ? "text-red-700" : "text-muted-foreground")}>{it.overdue ? t("upcoming.overdue", { date: dayMonth(it.date) }) : dayMonth(it.date)}</span>
              </span>
              <Money amount={it.amount} mode="short" className="shrink-0 text-sm font-medium" />
            </a>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
