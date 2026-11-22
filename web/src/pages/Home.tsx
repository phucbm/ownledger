import { Pencil } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { WidgetCard, AiMark } from "@/components/WidgetCard";
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

// Edit mode (drag, catalogue, settings, chart form) is its own chunk: nobody pays for it until they press Edit.
const HomeEditor = lazy(() => import("@/components/editor/HomeEditor"));

/** The answer on top: what was spent this month and what is usual by this day. */
function Headline() {
  const { t, lang } = useI18n();
  const { data } = useHome();
  if (!data) return <Skeleton className="h-8 w-full max-w-md" />;
  const p = data.pace;
  const vars = { spent: formatShort(p.spent, lang), month: lang === "vi" ? monthName(p.month, lang).toLocaleLowerCase("vi") : monthName(p.month, lang), usual: p.usual ? formatShort(p.usual.toDate, lang) : "" };
  return <p className="text-xl font-semibold tracking-tight text-balance md:text-2xl">{t(p.usual && p.usual.toDate > 0 ? "home.headlineUsual" : "home.headline", vars)}</p>;
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
    return (
      <Suspense fallback={<WidgetCard title={w.title ?? t(widgetRegistry[w.type]?.titleKey ?? "widget.chart")} loading />}>
        <C widget={w} menu={slot} />
      </Suspense>
    );
  };

  const grid = <HomeGrid widgets={widgets} renderWidget={(w) => renderWidget(w)} />;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
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
