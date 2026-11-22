import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useI18n } from "@/i18n";
import type { Widget } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Props every widget component takes. `menu` is the slot edit mode fills with its buttons (step 7). */
export interface WidgetProps {
  widget: Widget;
  menu?: ReactNode;
}

/** The widget's own title, or the translated default for its type. */
export function useWidgetTitle(w: Widget, key: string): string {
  const { t } = useI18n();
  return w.title?.trim() || t(key);
}

/** An up or down arrow with a percentage; the arrow is the cue, colour only helps. `goodWhenDown` for spending. */
export function Delta({ pct, goodWhenDown = true, className }: { pct: number; goodWhenDown?: boolean; className?: string }) {
  const { t } = useI18n();
  const up = pct > 0;
  const good = up !== goodWhenDown;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-medium tabular-nums", pct === 0 ? "text-muted-foreground" : good ? "text-emerald-700" : "text-red-700", className)}>
      {pct !== 0 && <Icon className="size-3.5" aria-hidden />}
      <span className="sr-only">{up ? t("delta.up") : pct < 0 ? t("delta.down") : ""}</span>
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

export const monthOf = (isoDate: string) => isoDate.slice(0, 7);
