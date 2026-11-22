import { CircleAlert, Clock, Info, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { AskAI } from "@/components/AskAI";
import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { Button } from "@/components/ui/button";
import { translate, useI18n } from "@/i18n";
import { dayMonth } from "@/lib/dates";
import { drillHref } from "@/lib/drill";
import { useHome } from "@/lib/queries";
import type { AttentionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWidgetTitle, type WidgetProps } from "./shared";

const COLLAPSED = 5;

/** Severity shows as an icon (shape differs, so colour is never the only cue), the label is there for screen readers. */
const sev: Record<AttentionItem["severity"], { icon: LucideIcon; cls: string; row?: string }> = {
  red: { icon: CircleAlert, cls: "text-critical", row: "bg-critical/5" },
  amber: { icon: Clock, cls: "text-warning" },
  info: { icon: Info, cls: "text-muted-foreground" },
};

/** Text for one item: by kind and params. An unknown kind (a newer server) falls back to the English title. */
export function attentionLabel(item: AttentionItem, lang: "vi" | "en"): string {
  const vars = { name: item.name ?? "", count: item.count ?? 0, n: item.count ?? 0, ...(item.params ?? {}) };
  const key = `attention.${item.kind}`;
  const s = translate(lang, key, vars);
  return s === key ? item.title : s;
}

export function whenText(item: AttentionItem, t: (k: string, v?: Record<string, string | number>) => string): string | null {
  if (item.days === undefined) return null;
  if (item.days < 0) return t("attention.overdueDays", { n: -item.days });
  if (item.days === 0) return t("attention.today");
  return t("attention.inDays", { n: item.days });
}

function askPrompt(item: AttentionItem, t: (k: string, v?: Record<string, string | number>) => string): string {
  const name = item.name ?? "";
  switch (item.kind) {
    case "uncategorised":
      return t("ask.uncategorised", { n: item.count ?? 0, from: String(item.params?.from ?? "") });
    case "plan_due":
    case "plan_overdue":
      return t("ask.plan", { name });
    case "unmatched":
      return t("ask.unmatched", { name });
    case "negative":
      return t("ask.negative", { name });
    default:
      return t("ask.generic", { title: item.title });
  }
}

export default function Attention({ widget, menu }: WidgetProps) {
  const { t, lang } = useI18n();
  const title = useWidgetTitle(widget, "widget.attention");
  const { data, error, isLoading } = useHome();
  const [all, setAll] = useState(false);
  const items = data?.attention ?? [];
  const shown = all ? items : items.slice(0, COLLAPSED);
  return (
    <WidgetCard
      title={
        <span className="flex items-center gap-2">
          {title}
          {items.length > 0 && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", items.some((x) => x.severity === "red") ? "bg-critical/10 text-critical" : "bg-secondary text-secondary-foreground")}>{items.length}</span>}
        </span>
      }
      menu={menu}
      loading={isLoading}
      error={error?.message}
      empty={data && items.length === 0 ? t("attention.empty") : undefined}
    >
      <ul className="flex flex-col gap-0.5">
        {shown.map((it, i) => {
          const when = whenText(it, t);
          const label = attentionLabel(it, lang);
          const s = sev[it.severity];
          const SevIcon = s.icon;
          const body = (
            <>
              <span className="mt-0.5 flex shrink-0 items-center"><SevIcon className={cn("size-4", s.cls)} aria-hidden /><span className="sr-only">{t(`attention.sev.${it.severity}`)}</span></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm">{label}</span>
                <span className="text-xs text-muted-foreground">{[when, !when || it.days === undefined ? null : dayMonth(it.date)].filter(Boolean).join(" · ")}</span>
              </span>
              {it.amount !== undefined && <Money amount={Math.abs(it.amount)} mode="short" className="shrink-0 text-sm font-medium" />}
            </>
          );
          return (
            <li key={`${it.kind}-${i}`} className={cn("-mx-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5", s.row)}>
              {it.link ? (
                <a href={it.link.startsWith("#") ? it.link : drillHref()} className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-md py-1 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                  {body}
                </a>
              ) : (
                <div className="flex min-h-11 min-w-0 flex-1 items-start gap-2 py-1">{body}</div>
              )}
              {it.ask && <AskAI prompt={askPrompt(it, t)} />}
            </li>
          );
        })}
      </ul>
      {items.length > COLLAPSED && (
        <Button type="button" variant="ghost" size="sm" className="min-h-11 self-start md:min-h-8" onClick={() => setAll((v) => !v)}>
          {all ? t("common.showLess") : t("attention.seeAll", { n: items.length })}
        </Button>
      )}
    </WidgetCard>
  );
}
