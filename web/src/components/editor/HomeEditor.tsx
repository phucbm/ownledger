import { Check, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HomeGrid, STACK_BELOW } from "@/components/HomeGrid";
import { Button } from "@/components/ui/button";
import { widgetRegistry } from "@/components/widgets/registry";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n";
import { appendedWidget, byPosition, moveWidget, resetDashboard, saveWidgets } from "@/lib/dashboard";
import { useMe } from "@/lib/queries";
import type { Layout } from "react-grid-layout";
import type { Widget } from "@/lib/types";
import { Catalogue } from "./Catalogue";
import { DEFAULT_CHART } from "./ChartForm";
import { EditMenu } from "./EditMenu";
import { WidgetSettings } from "./WidgetSettings";

/**
 * Home in edit mode: the edit bar (Reset to default, Add widget, Cancel, Done), the grid with drag, resize and the
 * per-widget buttons, the catalogue and the settings dialog. Changes live in `draft`; Cancel drops them, Done saves
 * the whole layout in one PUT and stays here when the server says no.
 */
export default function HomeEditor({ saved, renderWidget, onExit }: { saved: Widget[]; renderWidget: (w: Widget, menu: ReactNode) => ReactNode; onExit: () => void }) {
  const { t } = useI18n();
  const features = useMe().data?.features;
  const stacked = useMediaQuery(`(max-width: ${STACK_BELOW - 1}px)`);
  const [draft, setDraft] = useState<Widget[]>(() => saved.map((w) => ({ ...w })));
  const [catalogue, setCatalogue] = useState(false);
  const [dialog, setDialog] = useState<{ widget: Widget; isNew: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [refocus, setRefocus] = useState<{ id: string; dir: -1 | 1 } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const nameOf = (w: Widget) => w.title?.trim() || t(widgetRegistry[w.type]?.titleKey ?? "widget.chart");
  const ordered = [...draft].sort(byPosition);

  // After a move the button may have been re-created or disabled (first or last place): keep focus on the same widget.
  useEffect(() => {
    if (!refocus) return;
    const pick = (d: string) => document.querySelector(`[data-move="${d}:${refocus.id}"]`) as HTMLButtonElement | null;
    const same = pick(refocus.dir < 0 ? "up" : "down");
    const target = same && !same.disabled ? same : pick(refocus.dir < 0 ? "down" : "up");
    target?.focus();
  }, [refocus]);

  const onLayout = (layout: Layout) =>
    setDraft((cur) => {
      let changed = false;
      const next = cur.map((w) => {
        const l = layout.find((i) => i.i === w.id);
        if (!l || (l.x === w.x && l.y === w.y && l.w === w.w && l.h === w.h)) return w;
        changed = true;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      });
      return changed ? next : cur;
    });

  const add = (w: Widget) => {
    setDraft((cur) => [...cur, w]);
    setStatus(t("edit.added", { name: nameOf(w) }));
  };

  const pick = (type: string) => {
    const def = widgetRegistry[type];
    if (!def) return;
    setCatalogue(false);
    const w = appendedWidget(draft, { type }, def.size);
    // An account widget is empty until an account is chosen: ask first.
    if (def.options?.includes("account")) setDialog({ widget: w, isNew: true });
    else add(w);
  };

  const custom = () => {
    setCatalogue(false);
    setDialog({ widget: appendedWidget(draft, { type: "chart", query: DEFAULT_CHART.query, chart: DEFAULT_CHART.chart }, widgetRegistry.chart!.size), isNew: true });
  };

  const saveDialog = (w: Widget) => {
    if (dialog?.isNew) add(w);
    else {
      setDraft((cur) => cur.map((x) => (x.id === w.id ? w : x)));
      setStatus(t("edit.updated", { name: nameOf(w) }));
    }
    setDialog(null);
  };

  const remove = (w: Widget) => {
    setDraft((cur) => cur.filter((x) => x.id !== w.id));
    setStatus(t("edit.removed", { name: nameOf(w) }));
    headingRef.current?.focus();
  };

  const move = (w: Widget, dir: -1 | 1) => {
    setDraft((cur) => moveWidget(cur, w.id, dir));
    setStatus(t("edit.moved", { name: nameOf(w) }));
    setRefocus({ id: w.id, dir });
  };

  const run = async (kind: "save" | "reset") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "save") await saveWidgets(draft);
      else await resetDashboard();
      onExit();
    } catch (e) {
      setError(t(kind === "save" ? "edit.saveError" : "edit.resetError", { message: (e as Error).message }));
      setConfirmReset(false);
      setBusy(null);
    }
  };

  const button = "min-h-11 md:min-h-8";
  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-30 -mx-4 flex flex-col gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="mr-auto text-sm font-medium outline-none">
            {t("home.title")} · {t("edit.editing")}
          </h2>
          {confirmReset ? (
            <div role="alertdialog" aria-label={t("edit.reset")} className="flex flex-wrap items-center gap-2">
              <p className="text-sm">{t("edit.resetConfirm")}</p>
              <Button type="button" variant="destructive" className={button} disabled={busy !== null} onClick={() => void run("reset")}>
                {busy === "reset" ? t("edit.saving") : t("edit.resetYes")}
              </Button>
              <Button type="button" variant="outline" className={button} disabled={busy !== null} onClick={() => setConfirmReset(false)}>
                {t("edit.resetKeep")}
              </Button>
            </div>
          ) : (
            <>
              <Button type="button" variant="ghost" className={button} disabled={busy !== null} onClick={() => setConfirmReset(true)}>
                <RotateCcw />
                {t("edit.reset")}
              </Button>
              <Button type="button" variant="outline" className={button} disabled={busy !== null} onClick={() => setCatalogue(true)}>
                <Plus />
                {t("edit.add")}
              </Button>
              <Button type="button" variant="outline" className={button} disabled={busy !== null} onClick={onExit}>
                {t("common.cancel")}
              </Button>
              <Button type="button" className={button} disabled={busy !== null} onClick={() => void run("save")}>
                <Check />
                {busy === "save" ? t("edit.saving") : t("edit.done")}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t(stacked ? "edit.hintPhone" : "edit.hintDesktop")}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p role="status" className="sr-only">
          {status}
        </p>
      </div>

      {draft.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("edit.empty")}</p>
      ) : (
        <HomeGrid
          widgets={draft}
          editing
          onLayoutChange={onLayout}
          renderWidget={(w) => {
            const i = ordered.findIndex((x) => x.id === w.id);
            return renderWidget(
              w,
              <EditMenu
                id={w.id}
                name={nameOf(w)}
                first={i === 0}
                last={i === ordered.length - 1}
                canDrag={!stacked}
                canSettings={!stacked && Boolean(widgetRegistry[w.type]?.options?.length)}
                onMove={(dir) => move(w, dir)}
                onSettings={() => setDialog({ widget: w, isNew: false })}
                onRemove={() => remove(w)}
              />,
            );
          }}
        />
      )}

      <Catalogue open={catalogue} onOpenChange={setCatalogue} features={features} onPick={pick} onCustom={custom} />
      <WidgetSettings widget={dialog?.widget ?? null} isNew={dialog?.isNew ?? false} onSave={saveDialog} onClose={() => setDialog(null)} />
    </div>
  );
}
