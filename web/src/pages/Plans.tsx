import { useMemo, type ReactNode } from "react";
import { AskAI } from "@/components/AskAI";
import { DrillLink } from "@/components/DrillLink";
import { Money } from "@/components/Money";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { addDaysIso, dayMonth, daysBetween } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { useMe, usePlansDue } from "@/lib/queries";
import type { PlanDue, PlanStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAYS = 30;

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} className="h-2 w-full rounded-full bg-muted">
      <div className="h-2 rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(ratio ? 2 : 0, ratio * 100)}%` }} />
    </div>
  );
}

function DueRow({ d, overdue }: { d: PlanDue; overdue?: boolean }) {
  const { t, lang } = useI18n();
  return (
    <li className="flex min-h-12 items-center gap-3 py-1.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <DrillLink filter={{ plan: d.plan }} className="truncate text-sm font-medium">{d.name}</DrillLink>
        <span className={cn("text-xs", overdue ? "font-medium text-red-700" : "text-muted-foreground")}>
          {overdue ? t("upcoming.overdue", { date: dayMonth(d.date) }) : formatDate(d.date, lang, { weekday: "short", day: "2-digit", month: "2-digit" })}
        </span>
      </span>
      <Money amount={d.amount} mode="short" className="shrink-0 text-sm font-medium" />
      {overdue && <AskAI prompt={t("ask.plan", { name: d.name })} />}
    </li>
  );
}

function PlanProgress({ p }: { p: PlanStatus }) {
  const { t } = useI18n();
  const late = p.overdue.length > 0;
  let tail: ReactNode = null;
  if (late) tail = <span className="font-medium text-red-700">{t("plans.lateCount", { n: p.overdue.length })}</span>;
  else if (p.next) tail = <span>{t("plans.next", { date: dayMonth(p.next) })}</span>;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <DrillLink filter={{ plan: p.plan }} className="min-w-0 truncate text-sm font-medium">{p.name}</DrillLink>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{p.paidCount}/{p.count ?? "–"}</span>
      </div>
      {p.count !== null && <Progress value={p.paidCount} max={p.count} label={p.name} />}
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        <span>
          {t("plans.perPayment")} <Money amount={p.perPayment} mode="short" />
          {p.leftAmount !== null && <> · {t("cards.left")} <Money amount={p.leftAmount} mode="short" /></>}
        </span>
        {tail}
      </p>
    </li>
  );
}

export default function Plans() {
  const { t, lang } = useI18n();
  const today = useMe().data?.today ?? new Date().toISOString().slice(0, 10);
  const { data, error, isLoading } = usePlansDue(DAYS);

  const model = useMemo(() => {
    const due = data?.due ?? [];
    const overdue = due.filter((d) => (d.overdue || d.date < today)).sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = due.filter((d) => !overdue.includes(d) && d.date <= addDaysIso(today, DAYS - 1)).sort((a, b) => a.date.localeCompare(b.date));
    const perDay = new Map<string, number>();
    for (const d of upcoming) perDay.set(d.date, (perDay.get(d.date) ?? 0) + d.amount);
    const days = Array.from({ length: DAYS }, (_, i) => {
      const date = addDaysIso(today, i);
      return { date, amount: perDay.get(date) ?? 0 };
    });
    const weeks = Array.from({ length: 5 }, (_, i) => ({ start: addDaysIso(today, i * 7), amount: 0 }));
    for (const d of upcoming) weeks[Math.min(4, Math.floor(daysBetween(today, d.date) / 7))]!.amount += d.amount;
    const status = (data?.status ?? []).filter((p) => !p.finished);
    const key = (p: PlanStatus) => (p.overdue.length ? "0" : "1") + (p.next ?? "9999");
    const counted = status.filter((p) => p.count !== null).sort((a, b) => key(a).localeCompare(key(b)));
    const open = status.filter((p) => p.count === null).sort((a, b) => key(a).localeCompare(key(b)));
    return { overdue, upcoming, days, weeks, counted, open, total: upcoming.reduce((s, d) => s + d.amount, 0), overdueTotal: overdue.reduce((s, d) => s + d.amount, 0) };
  }, [data, today]);

  const maxDay = Math.max(1, ...model.days.map((d) => d.amount));
  const maxWeek = Math.max(1, ...model.weeks.map((w) => w.amount));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("plans.title")}</h1>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {t("upcoming.total")} <Money amount={model.total} mode="short" className="font-medium text-foreground" />
            {model.overdue.length > 0 && <> · <span className="font-medium text-red-700">{t("plans.overdueTotal", { n: model.overdue.length })} <Money amount={model.overdueTotal} mode="short" /></span></>}
          </p>
        ) : (
          <Skeleton className="h-5 w-64" />
        )}
      </header>

      {error ? (
        <p className="text-sm text-muted-foreground">{t("common.error", { message: error.message })}</p>
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data.status.length === 0 && data.due.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <p>{t("plans.empty")}</p>
          <AskAI prompt={t("ask.addPlan")} />
        </div>
      ) : (
        <>
          {model.overdue.length > 0 && (
            <Panel title={t("plans.overdue")} className="ring-red-200">
              <ul className="flex flex-col divide-y">{model.overdue.map((d) => <DueRow key={`${d.plan}-${d.date}`} d={d} overdue />)}</ul>
            </Panel>
          )}

          <Panel title={t("plans.next30")}>
            <ol className="grid grid-cols-5 gap-1.5" aria-label={t("upcoming.weeks")}>
              {model.weeks.map((w) => (
                <li key={w.start} className="flex flex-col items-center gap-1">
                  <span className="flex h-10 w-full items-end rounded-sm bg-muted">
                    <span className="w-full rounded-sm" style={{ height: `${w.amount ? Math.max(8, (w.amount / maxWeek) * 100) : 0}%`, background: "var(--chart-1)" }} />
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{dayMonth(w.start)}</span>
                  <span className="text-xs tabular-nums">{w.amount ? <Money amount={w.amount} mode="short" /> : "–"}</span>
                </li>
              ))}
            </ol>
            <div className="-mx-4 overflow-x-auto px-4 pb-1">
              <ol className="flex gap-1" aria-label={t("plans.perDay")}>
                {model.days.map((d) => (
                  <li key={d.date} className="flex w-9 shrink-0 flex-col items-center gap-1">
                    <span className="flex h-12 w-full items-end rounded-sm bg-muted">
                      <span className="w-full rounded-sm" style={{ height: `${d.amount ? Math.max(10, (d.amount / maxDay) * 100) : 0}%`, background: "var(--chart-1)" }} />
                    </span>
                    <span className={cn("text-[11px] tabular-nums", d.date === today ? "font-semibold text-foreground" : "text-muted-foreground")}>{d.date.slice(8, 10)}</span>
                    <span className="h-3 text-[10px] text-muted-foreground tabular-nums">{d.amount ? <Money amount={d.amount} mode="short" /> : ""}</span>
                  </li>
                ))}
              </ol>
            </div>
            {model.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("upcoming.empty")}</p>
            ) : (
              <ul className="flex flex-col divide-y">{model.upcoming.map((d) => <DueRow key={`${d.plan}-${d.date}`} d={d} />)}</ul>
            )}
          </Panel>

          {model.counted.length > 0 && (
            <Panel title={t("plans.progress")}>
              <ul className="flex flex-col divide-y">{model.counted.map((p) => <PlanProgress key={p.plan} p={p} />)}</ul>
            </Panel>
          )}
          {model.open.length > 0 && (
            <Panel title={t("plans.recurring")}>
              <ul className="flex flex-col divide-y">{model.open.map((p) => <PlanProgress key={p.plan} p={p} />)}</ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
