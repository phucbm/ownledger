import { ArrowDown, ArrowUp, ChevronRight, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { useHome, useMe } from "@/lib/queries";
import type { UnusualCard } from "@/lib/types";
import { useWidgetTitle, type WidgetProps } from "./shared";

function useRow(c: UnusualCard): { icon: LucideIcon; iconLabel: string; label: string; amount: number; meta: string | null; tone: string } {
  const { t } = useI18n();
  switch (c.kind) {
    case "category_up":
      return { icon: ArrowUp, iconLabel: t("delta.up"), label: c.name, amount: c.current, meta: t("unusual.vsUsual", { pct: `+${Math.round(c.changePct)}` }), tone: "text-critical" };
    case "category_down":
      return { icon: ArrowDown, iconLabel: t("delta.down"), label: c.name, amount: c.current, meta: t("unusual.vsUsual", { pct: `${Math.round(c.changePct)}`.replace("-", "−") }), tone: "text-positive" };
    case "new_category":
      return { icon: Sparkles, iconLabel: t("unusual.new"), label: t("unusual.new_category", { name: c.name }), amount: c.amount, meta: null, tone: "text-foreground" };
    case "new_who":
      return { icon: Sparkles, iconLabel: t("unusual.new"), label: t("unusual.new_who", { who: c.who }), amount: c.amount, meta: t("unusual.times", { n: c.count }), tone: "text-foreground" };
    case "large":
      return { icon: TriangleAlert, iconLabel: t("unusual.large"), label: t("unusual.large_label", { name: c.note || c.name }), amount: c.amount, meta: null, tone: "text-warning" };
  }
}

function Row({ c }: { c: UnusualCard }) {
  const r = useRow(c);
  const Icon = r.icon;
  return (
    <li>
      <a href={c.link} className="flex min-h-11 items-center gap-3 rounded-md py-1 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
        <Icon className={`size-4 shrink-0 ${r.tone}`} aria-hidden />
        <span className="sr-only">{r.iconLabel}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{r.label}</span>
          {r.meta && <span className={`text-xs ${r.tone}`}>{r.meta}</span>}
        </span>
        <Money amount={r.amount} mode="short" className="shrink-0 text-sm font-medium" />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </a>
    </li>
  );
}

export default function Unusual({ widget, menu }: WidgetProps) {
  const { t } = useI18n();
  const title = useWidgetTitle(widget, "widget.unusual");
  const { data, error, isLoading } = useHome();
  const f = useMe().data?.features;
  const cards = (data?.unusual ?? []).slice(0, 5);
  const empty = data && cards.length === 0 ? (f && f.historyMonths < 2 ? t("unusual.needHistory") : t("unusual.empty")) : undefined;
  return (
    <WidgetCard title={title} menu={menu} loading={isLoading} error={error?.message} empty={empty}>
      <ul className="flex flex-col">
        {cards.map((c, i) => (
          <Row key={`${c.kind}-${i}`} c={c} />
        ))}
      </ul>
    </WidgetCard>
  );
}
