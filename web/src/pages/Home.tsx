import { Pencil } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { WidgetCard, AiMark, WidgetIconContext } from "@/components/WidgetCard";
import { GettingStarted } from "@/components/GettingStarted";
import { HomeGrid } from "@/components/HomeGrid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { widgetComponent, widgetRegistry } from "@/components/widgets/registry";
import { useI18n } from "@/i18n";
import { monthName } from "@/lib/dates";
import { formatShort } from "@/lib/format";
import { useHome, useMe } from "@/lib/queries";
import type { Widget } from "@/lib/types";
import { cn } from "@/lib/utils";

// Edit mode (drag, catalogue, settings, chart form) is its own chunk: nobody pays for it until they press Edit.
const HomeEditor = lazy(() => import("@/components/editor/HomeEditor"));

/**
 * The answer on top: one big number (spent this month), what is usual by this day, and a bar of the two.
 * Under the usual pace the bar is the accent; over it turns amber, and the words say the percentage either way.
 */
function Headline() {
  const { t, lang } = useI18n();
  const { data } = useHome();
  if (!data) return <Skeleton className="h-14 w-full max-w-md" />;
  const p = data.pace;
  const month = lang === "vi" ? monthName(p.month, lang).toLocaleLowerCase("vi") : monthName(p.month, lang);
  const usual = p.usual && p.usual.toDate > 0 ? p.usual.toDate : null;
  const ratio = usual ? p.spent / usual : null;
  const over = ratio !== null && ratio > 1;
  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-4xl font-semibold tracking-tight md:text-5xl">{formatShort(p.spent, lang)}</span>
        <span className="text-sm text-muted-foreground">
          {t("home.spentIn", { month })}
          {usual !== null && <> · {t("home.usualBy", { usual: formatShort(usual, lang) })}</>}
        </span>
      </p>
      {ratio !== null && (
        <div className="flex items-center gap-3">
          <div role="progressbar" aria-label={t("home.ofUsual", { pct: Math.round(ratio * 100) })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(ratio * 100))} className="h-1.5 flex-1 rounded-full bg-muted">
            <div className={cn("h-1.5 rounded-full", over ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(2, Math.min(1, ratio) * 100)}%` }} />
          </div>
          <span className={cn("shrink-0 text-xs font-medium tabular-nums", over ? "text-warning" : "text-muted-foreground")}>{t("home.ofUsual", { pct: Math.round(ratio * 100) })}</span>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();
  const me = useMe().data;
  const widgets = me?.dashboard?.widgets ?? [];
  const empty = Boolean(me?.features?.empty);
  const [editing, setEditing] = useState(false);

  /** One widget's card. `menu` is edit mode's buttons; an AI-added built-in widget gets its mark there too (a chart draws its own). */
  const renderWidget = (w: Widget, menu?: ReactNode) => {
    const C = widgetComponent(w);
    if (!C) return null;
    const slot = w.by_ai && w.type !== "chart" ? (
      <span className="flex items-center gap-1">
        <AiMark />
        {menu}
      </span>
    ) : (
      menu
    );
    const def = widgetRegistry[w.type];
    return (
      <WidgetIconContext.Provider value={def ? { icon: def.icon, hue: def.hue } : null}>
        <Suspense fallback={<WidgetCard title={w.title ?? t(def?.titleKey ?? "widget.chart")} loading />}>
          <C widget={w} menu={slot} />
        </Suspense>
      </WidgetIconContext.Provider>
    );
  };

  const grid = <HomeGrid widgets={widgets} renderWidget={(w) => renderWidget(w)} />;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3 pb-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="text-sm font-medium text-muted-foreground">{t("home.title")}</h1>
          {!empty && <Headline />}
        </div>
        {!empty && !editing && (
          <Button type="button" variant="outline" className="min-h-11 shrink-0 md:min-h-8" onClick={() => setEditing(true)}>
            <Pencil />
            {t("edit.start")}
          </Button>
        )}
      </header>
      {empty ? (
        <GettingStarted />
      ) : editing ? (
        <Suspense fallback={grid}>
          <HomeEditor saved={widgets} renderWidget={renderWidget} onExit={() => setEditing(false)} />
        </Suspense>
      ) : (
        grid
      )}
    </div>
  );
}
