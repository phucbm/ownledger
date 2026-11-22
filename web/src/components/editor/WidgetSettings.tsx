import { useState } from "react";
import { Combobox } from "@/components/transactions/Combobox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { widgetRegistry } from "@/components/widgets/registry";
import { useI18n } from "@/i18n";
import { TITLE_MAX } from "@/lib/dashboard";
import { useMe, useMeta } from "@/lib/queries";
import type { Widget } from "@/lib/types";
import { ChartForm, DEFAULT_CHART } from "./ChartForm";
import { Field, OptionSelect } from "./Field";

const PERIODS = ["this-month", "last-month", "this-year", "last-year"];
const MONTHS = [3, 6, 12, 18, 24];
const COUNTS = [5, 8, 10, 15, 20, 30];

const withCurrent = (list: number[], cur: number) => (list.includes(cur) ? list : [...list, cur].sort((a, b) => a - b));

/** Options of the built-in widgets: period, months, count, account, and a title. */
function BuiltinForm({ widget, submitLabel, onSubmit, onCancel }: { widget: Widget; submitLabel: string; onSubmit: (w: Widget) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const options = widgetRegistry[widget.type]?.options ?? [];
  const me = useMe().data;
  const meta = useMeta().data;
  const [w, setW] = useState<Widget>(widget);
  const [title, setTitle] = useState(widget.title ?? "");
  const poolName = me?.pool?.name || t("pool.name");
  const accountOptions = [
    { value: "pool", label: t("cf.pool", { name: poolName }) },
    ...(meta?.accounts ?? []).filter((a) => !a.closed || a.id === w.account).map((a) => ({ value: a.id, label: a.name, keywords: [a.id] })),
  ];
  const needsAccount = options.includes("account") && !w.account;
  const tooLong = title.length > TITLE_MAX;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (needsAccount || tooLong) return;
        const out = { ...w };
        if (title.trim()) out.title = title.trim();
        else delete out.title;
        onSubmit(out);
      }}
    >
      {options.includes("period") && (
        <Field label={t("wset.period")}>
          {(id) => <OptionSelect id={id} value={PERIODS.includes(w.period ?? "") ? w.period! : "this-month"} options={PERIODS.map((p) => ({ value: p, label: t(`wset.period.${p}`) }))} onChange={(period) => setW({ ...w, period })} />}
        </Field>
      )}
      {options.includes("months") && (
        <Field label={t("wset.months")}>
          {(id) => <OptionSelect id={id} value={String(w.months ?? 6)} options={withCurrent(MONTHS, w.months ?? 6).map((n) => ({ value: String(n), label: t("wset.monthsN", { n }) }))} onChange={(n) => setW({ ...w, months: Number(n) })} />}
        </Field>
      )}
      {options.includes("count") && (
        <Field label={t("wset.count")}>
          {(id) => <OptionSelect id={id} value={String(w.count ?? 8)} options={withCurrent(COUNTS, w.count ?? 8).map((n) => ({ value: String(n), label: String(n) }))} onChange={(n) => setW({ ...w, count: Number(n) })} />}
        </Field>
      )}
      {options.includes("account") && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("wset.account")}</span>
          <Combobox className="w-full" label={t("wset.accountNone")} ariaLabel={t("wset.account")} groups={[{ options: accountOptions }]} value={w.account} onSelect={(account) => setW({ ...w, account })} />
        </div>
      )}
      <Field label={t("wset.titleLabel")} hint={t("wset.titleHint")}>
        {(id) => <Input id={id} className="min-h-11 md:min-h-8" value={title} aria-invalid={tooLong} placeholder={t(widgetRegistry[widget.type]?.titleKey ?? "widget.chart")} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      {tooLong && (
        <p className="text-sm text-destructive" role="alert">
          {t("cf.err.title")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-11 md:min-h-8" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="min-h-11 md:min-h-8" disabled={needsAccount || tooLong}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** A dialog for one widget's options. `isNew` when it is being added (the button then says "Add to Home"). */
export function WidgetSettings({ widget, isNew, onSave, onClose }: { widget: Widget | null; isNew: boolean; onSave: (w: Widget) => void; onClose: () => void }) {
  const { t } = useI18n();
  const name = widget ? widget.title?.trim() || t(widgetRegistry[widget.type]?.titleKey ?? "widget.chart") : "";
  const label = isNew ? t("wset.add") : t("wset.save");
  return (
    <Dialog open={widget !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("wset.title", { name })}</DialogTitle>
          <DialogDescription>{t("wset.description")}</DialogDescription>
        </DialogHeader>
        {widget &&
          (widget.type === "chart" ? (
            <ChartForm
              key={widget.id}
              initial={widget.query ? { query: widget.query, chart: widget.chart ?? "bar", title: widget.title ?? "" } : DEFAULT_CHART}
              submitLabel={label}
              onCancel={onClose}
              onSubmit={(v) => {
                const out: Widget = { ...widget, query: v.query, chart: v.chart };
                if (v.title) out.title = v.title;
                else delete out.title;
                onSave(out);
              }}
            />
          ) : (
            <BuiltinForm key={widget.id} widget={widget} submitLabel={label} onCancel={onClose} onSubmit={onSave} />
          ))}
      </DialogContent>
    </Dialog>
  );
}
