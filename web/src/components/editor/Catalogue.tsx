import { ChartColumn } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { widgetRegistry } from "@/components/widgets/registry";
import { useI18n } from "@/i18n";
import type { Features } from "@/lib/types";

type Sketch = "stat" | "line" | "columns" | "bars" | "list" | "strip";

/** A light sketch of each widget's shape: cheap to draw, so the catalogue does not run sixteen live charts. */
const sketchOf: Record<string, Sketch> = {
  pace: "line",
  attention: "list",
  unusual: "list",
  net_worth: "line",
  left: "stat",
  by_category: "bars",
  income_spending: "columns",
  recent: "list",
  account: "line",
  upcoming: "strip",
  deposits: "list",
  chart: "columns",
  cards: "bars",
  cashback: "list",
  which_card: "list",
  cards_value: "bars",
};

const bar = "rounded-sm bg-muted-foreground/25";

function SketchBox({ kind }: { kind: Sketch }) {
  return (
    <div className="flex h-16 w-24 shrink-0 flex-col gap-1.5 overflow-hidden rounded-md border bg-muted/40 p-2" aria-hidden>
      {kind === "stat" && (
        <>
          <div className={`${bar} h-2 w-1/2`} />
          <div className={`rounded-sm h-5 w-4/5 bg-muted-foreground/40`} />
        </>
      )}
      {kind === "line" && (
        <>
          <div className={`${bar} h-2 w-1/2`} />
          <svg viewBox="0 0 80 28" className="h-full w-full text-muted-foreground/60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" preserveAspectRatio="none">
            <path d="M2 24 L16 18 L30 21 L44 10 L58 13 L78 3" />
          </svg>
        </>
      )}
      {kind === "columns" && (
        <div className="flex h-full items-end gap-1">
          {[40, 65, 50, 85, 60, 75].map((h, i) => (
            <div key={i} className={`rounded-sm flex-1 bg-muted-foreground/40`} style={{ height: `${h}%` }} />
          ))}
        </div>
      )}
      {kind === "bars" && (
        <div className="flex flex-col gap-1.5">
          {[90, 65, 45, 30].map((w, i) => (
            <div key={i} className={`rounded-sm h-2 bg-muted-foreground/40`} style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {kind === "list" && (
        <div className="flex flex-col gap-1.5">
          {[100, 85, 95, 70].map((w, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
              <div className={`${bar} h-2`} style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      )}
      {kind === "strip" && (
        <>
          <div className={`${bar} h-2 w-1/2`} />
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`${bar} h-7 flex-1`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Entry({ name, description, sketch, icon, onPick }: { name: string; description: string; sketch: Sketch; icon?: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex min-h-11 w-full items-start gap-3 rounded-xl border bg-card p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
      <SketchBox kind={sketch} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon && <ChartColumn className="size-4" aria-hidden />}
          {name}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

/** The widget types the ledger can fill: the registry's "when offered" rules applied to `features`. */
export function offeredTypes(features: Features | undefined): string[] {
  return Object.values(widgetRegistry)
    .filter((d) => d.type !== "chart" && (d.available ? d.available(features) : true))
    .map((d) => d.type);
}

export function Catalogue({ open, onOpenChange, features, onPick, onCustom }: { open: boolean; onOpenChange: (open: boolean) => void; features: Features | undefined; onPick: (type: string) => void; onCustom: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("cat.title")}</SheetTitle>
          <SheetDescription>{t("cat.description")}</SheetDescription>
        </SheetHeader>
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          <li>
            <Entry name={t("cat.custom")} description={t("cat.customDesc")} sketch="columns" icon onPick={onCustom} />
          </li>
          {offeredTypes(features).map((type) => (
            <li key={type}>
              <Entry name={t(widgetRegistry[type]!.titleKey)} description={t(`widget.desc.${type}`)} sketch={sketchOf[type] ?? "list"} onPick={() => onPick(type)} />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
