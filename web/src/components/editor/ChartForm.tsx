import { Suspense, useEffect, useMemo, useState } from "react";
import { Combobox, type ComboGroup } from "@/components/transactions/Combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { widgetRegistry } from "@/components/widgets/registry";
import { WidgetSkeleton } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { BYS, CHART_KINDS, METRICS, PERIOD_PRESETS, TIME_BYS, TITLE_MAX, chartErrors, cleanQuery, isTimeBy } from "@/lib/dashboard";
import { useMe, useMeta } from "@/lib/queries";
import type { SeriesQuery, Widget } from "@/lib/types";
import { Field, OptionSelect } from "./Field";

type Kind = (typeof CHART_KINDS)[number];
export interface ChartValue {
  query: SeriesQuery;
  chart: Kind;
  title: string;
}

export const DEFAULT_CHART: ChartValue = { query: { metric: "spending", period: "last-3-months", by: "month" }, chart: "bar", title: "" };

const ANY = "__any";
const MULTI = "__multi";
const POOL = "pool";
const OTHER = "__other";

const useDebounced = <T,>(v: T, ms: number): T => {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
};

/**
 * The custom chart form: a metric, filters, a period, a grouping, a comparison, a chart kind and a title, with a live
 * preview from /api/series. Checks the same rules as the server before it lets you save.
 */
export function ChartForm({ initial, submitLabel, onSubmit, onCancel }: { initial: ChartValue; submitLabel: string; onSubmit: (v: ChartValue) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const features = useMe().data?.features;
  const poolName = useMe().data?.pool?.name || t("pool.name");
  const meta = useMeta().data;
  const [q, setQ] = useState<SeriesQuery>(() => ({ ...initial.query, period: initial.query.period ?? "this-month", by: initial.query.by ?? (initial.query.metric === "balance" ? "month" : "top") }));
  const [chart, setChart] = useState<Kind>(initial.chart);
  const [title, setTitle] = useState(initial.title);
  const [other, setOther] = useState(() => Boolean(initial.query.period) && !(PERIOD_PRESETS as readonly string[]).includes(initial.query.period!));
  const set = (patch: Partial<SeriesQuery>) => setQ((cur) => ({ ...cur, ...patch }));
  const text = (key: "who" | "event" | "tag" | "text") => (v: string) => set({ [key]: v });

  const errors = chartErrors(q, title);
  const value = cleanQuery(q);
  const key = JSON.stringify(value);
  const shown = useDebounced(key, 350);
  const previewQuery = useMemo(() => JSON.parse(shown) as SeriesQuery, [shown]);
  const previewWidget: Widget = { id: "preview", type: "chart", x: 0, y: 0, w: 6, h: 4, title: title.trim() || undefined, query: previewQuery, chart };
  const Chart = widgetRegistry.chart!.component;

  const categories: ComboGroup[] = [
    {
      options: [
        { value: ANY, label: t("cf.any") },
        ...(meta?.categories ?? []).map((c) => ({ value: c.path, label: c.name, keywords: [c.path], depth: c.path.split("/").length - 1 })),
        ...(q.category && !meta?.categories.some((c) => c.path === q.category) ? [{ value: q.category, label: q.category }] : []),
      ],
    },
  ];
  const accounts: ComboGroup[] = [
    {
      options: [
        { value: ANY, label: t("cf.any") },
        { value: POOL, label: t("cf.pool", { name: poolName }) },
        ...(meta?.accounts ?? []).filter((a) => !a.closed || a.id === q.account).map((a) => ({ value: a.id, label: a.name, keywords: [a.id] })),
        ...(Array.isArray(q.account) ? [{ value: MULTI, label: q.account.map((id) => meta?.accounts.find((a) => a.id === id)?.name ?? id).join(", ") }] : []),
      ],
    },
  ];
  const accountValue = Array.isArray(q.account) ? MULTI : (q.account ?? ANY);

  const bys = q.metric === "balance" ? TIME_BYS : BYS;
  const byOptions = bys.filter((b) => (b === "who" ? features?.who || q.by === "who" : b === "event" ? features?.event || q.by === "event" : b === "tag" ? features?.tags || q.by === "tag" : true));
  const periodValue = other ? OTHER : (q.period ?? "this-month");
  const optional = (k: "who" | "event" | "tag", on: boolean | undefined) => on || Boolean(q[k]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (errors.length) return;
        onSubmit({ query: value, chart, title: title.trim() });
      }}
    >
      <section aria-label={t("cf.preview")} className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">{t("cf.preview")}</h3>
        <div className="flex h-72 flex-col *:flex-1">
          {errors.length ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground" role="alert">
              {errors.map((e) => (
                <p key={e}>{t(e)}</p>
              ))}
            </div>
          ) : (
            <Suspense fallback={<WidgetSkeleton />}>
              <Chart widget={previewWidget} />
            </Suspense>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("cf.metric")}>
          {(id) => (
            <OptionSelect
              id={id}
              value={q.metric}
              options={METRICS.map((m) => ({ value: m, label: t(`cf.metric.${m}`) }))}
              onChange={(m) => set({ metric: m as SeriesQuery["metric"], ...(m === "balance" && !isTimeBy(q.by) ? { by: "month" as const } : {}) })}
            />
          )}
        </Field>
        <Field label={t("cf.kind")}>
          {(id) => <OptionSelect id={id} value={chart} options={CHART_KINDS.map((k) => ({ value: k, label: t(`cf.kind.${k}`) }))} onChange={(k) => setChart(k as Kind)} />}
        </Field>
        <Field label={t("cf.period")}>
          {(id) => (
            <OptionSelect
              id={id}
              value={periodValue}
              options={[...PERIOD_PRESETS.map((p) => ({ value: p, label: t(`cf.period.${p}`) })), { value: OTHER, label: t("cf.periodOther") }]}
              onChange={(p) => {
                if (p === OTHER) {
                  setOther(true);
                  set({ period: (PERIOD_PRESETS as readonly string[]).includes(q.period ?? "") ? "" : q.period });
                } else {
                  setOther(false);
                  set({ period: p });
                }
              }}
            />
          )}
        </Field>
        {other && (
          <Field label={t("cf.periodValue")}>
            {(id) => <Input id={id} className="min-h-11 md:min-h-8" inputMode="numeric" placeholder="2026-11" value={q.period ?? ""} aria-invalid={errors.includes("cf.err.period")} onChange={(e) => set({ period: e.target.value.trim() })} />}
          </Field>
        )}
        <Field label={t("cf.by")} hint={q.metric === "balance" ? t("cf.balanceHint") : undefined}>
          {(id) => <OptionSelect id={id} value={q.by ?? "top"} options={byOptions.map((b) => ({ value: b, label: t(`cf.by.${b}`) }))} onChange={(b) => set({ by: b as SeriesQuery["by"] })} />}
        </Field>
        <Field label={t("cf.compare")}>
          {(id) => (
            <OptionSelect
              id={id}
              value={q.compare ?? "none"}
              options={["none", "previous", "usual"].map((c) => ({ value: c, label: t(`cf.compare.${c}`) }))}
              onChange={(c) => set({ compare: c === "none" ? undefined : (c as SeriesQuery["compare"]) })}
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t("cf.filters")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">{t("cf.category")}</span>
            <Combobox className="w-full" label={t("cf.any")} ariaLabel={t("cf.category")} groups={categories} value={q.category ?? ANY} onSelect={(v) => set({ category: v === ANY ? undefined : v })} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">{t("cf.account")}</span>
            <Combobox className="w-full" label={t("cf.any")} ariaLabel={t("cf.account")} groups={accounts} value={accountValue} onSelect={(v) => (v === MULTI ? undefined : set({ account: v === ANY ? undefined : v }))} />
          </div>
          {optional("who", features?.who) && (
            <Field label={t("cf.who")}>{(id) => <Input id={id} className="min-h-11 md:min-h-8" value={q.who ?? ""} onChange={(e) => text("who")(e.target.value)} />}</Field>
          )}
          {optional("event", features?.event) && (
            <Field label={t("cf.event")}>{(id) => <Input id={id} className="min-h-11 md:min-h-8" value={q.event ?? ""} onChange={(e) => text("event")(e.target.value)} />}</Field>
          )}
          {optional("tag", features?.tags) && (
            <Field label={t("cf.tag")}>{(id) => <Input id={id} className="min-h-11 md:min-h-8" value={q.tag ?? ""} onChange={(e) => text("tag")(e.target.value)} />}</Field>
          )}
          <Field label={t("cf.text")}>{(id) => <Input id={id} className="min-h-11 md:min-h-8" value={q.text ?? ""} onChange={(e) => text("text")(e.target.value)} />}</Field>
        </div>
      </fieldset>

      <Field label={t("cf.title")} hint={t("wset.titleHint")}>
        {(id) => <Input id={id} className="min-h-11 md:min-h-8" maxLength={TITLE_MAX + 20} placeholder={t("cf.titlePlaceholder")} value={title} aria-invalid={errors.includes("cf.err.title")} onChange={(e) => setTitle(e.target.value)} />}
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-11 md:min-h-8" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="min-h-11 md:min-h-8" disabled={errors.length > 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
