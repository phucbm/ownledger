import { api, queryClient, type Me } from "./api";
import type { SeriesQuery, Widget } from "./types";

/** Mirrors `checkDashboard` in src/engine/dashboard.ts: the grid, the chart kinds and the chart query rules. */
export const GRID_COLS = 12;
export const CHART_KINDS = ["stat", "line", "bar", "hbar", "table"] as const;
export const METRICS = ["spending", "income", "net", "balance", "count"] as const;
export const BYS = ["day", "week", "month", "category", "top", "account", "who", "event", "tag"] as const;
export const TIME_BYS = ["day", "week", "month"] as const;
export const PERIOD_PRESETS = ["this-month", "last-month", "last-3-months", "last-6-months", "this-year", "last-year", "last-12-months", "all"] as const;
export const TITLE_MAX = 80;

export const isTimeBy = (by: string | undefined) => by === "day" || by === "week" || by === "month";
export const validPeriod = (p: string) => (PERIOD_PRESETS as readonly string[]).includes(p) || /^\d{4}(-\d{2})?$/.test(p);

/** i18n keys of what is wrong with a chart widget, checked like the server does. Empty = fine. */
export function chartErrors(q: SeriesQuery, title: string): string[] {
  const out: string[] = [];
  if (!(METRICS as readonly string[]).includes(q.metric)) out.push("cf.err.metric");
  if (q.metric === "balance" && q.by && !isTimeBy(q.by)) out.push("cf.err.balanceBy");
  if (q.period !== undefined && !validPeriod(q.period)) out.push("cf.err.period");
  if (title.length > TITLE_MAX) out.push("cf.err.title");
  return out;
}

/** A query without empty fields (the saved file stays short). */
export function cleanQuery(q: SeriesQuery): SeriesQuery {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  return out as unknown as SeriesQuery;
}

/** The chart kind that suits a query when nobody chose one (Pin to Home). */
export const chartFor = (q: SeriesQuery): (typeof CHART_KINDS)[number] => (isTimeBy(q.by ?? (q.metric === "balance" ? "month" : "top")) ? (q.metric === "balance" ? "line" : "bar") : "hbar");

export const byPosition = (a: Widget, b: Widget) => a.y - b.y || a.x - b.x;

/** An id that is unused: `chart`, `chart-2`, `chart-3`... (letters, digits, `.`, `_`, `-`). */
export function newId(base: string, widgets: Widget[]): string {
  const used = new Set(widgets.map((w) => w.id));
  const slug = base.replace(/[^A-Za-z0-9._-]/g, "-");
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

/** A widget at the end of the grid (below everything, left edge) with the given size. */
export function appendedWidget(widgets: Widget[], base: Omit<Widget, "id" | "x" | "y" | "w" | "h">, size: { w: number; h: number }): Widget {
  const bottom = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  return { ...base, id: newId(base.type, widgets), x: 0, y: bottom, w: size.w, h: size.h };
}

/** Lay widgets out left to right, row after row, in the order given. */
export function flow(ordered: Widget[]): Widget[] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return ordered.map((w) => {
    if (x + w.w > GRID_COLS) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    const placed = { ...w, x, y };
    x += w.w;
    rowH = Math.max(rowH, w.h);
    return placed;
  });
}

/** Move a widget one place earlier (-1) or later (1) in reading order. Two same-size widgets swap places; otherwise the grid is re-flowed. */
export function moveWidget(widgets: Widget[], id: string, dir: -1 | 1): Widget[] {
  const sorted = [...widgets].sort(byPosition);
  const i = sorted.findIndex((w) => w.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return widgets;
  const a = sorted[i]!;
  const b = sorted[j]!;
  if (a.w === b.w && a.h === b.h) {
    return widgets.map((w) => (w.id === a.id ? { ...w, x: b.x, y: b.y } : w.id === b.id ? { ...w, x: a.x, y: a.y } : w));
  }
  [sorted[i], sorted[j]] = [b, a];
  const placed = new Map(flow(sorted).map((w) => [w.id, w]));
  return widgets.map((w) => placed.get(w.id) ?? w);
}

function setMe(patch: (d: NonNullable<Me["dashboard"]>) => NonNullable<Me["dashboard"]>) {
  queryClient.setQueryData<Me>(["me"], (m) => (m ? { ...m, dashboard: patch(m.dashboard ?? { saved: false, widgets: [], prefs: {} }) } : m));
}

/** PUT /api/dashboard with the whole layout: one commit. Throws ApiError with the server's message (a 400 says what is wrong). */
export async function saveWidgets(widgets: Widget[]): Promise<{ commit: string; warnings: string[] }> {
  const r = await api<{ saved: boolean; commit: string; warnings?: string[] }>("dashboard", { method: "PUT", body: JSON.stringify({ widgets }) });
  setMe((d) => ({ ...d, saved: true, widgets }));
  void queryClient.invalidateQueries({ queryKey: ["me"] });
  return { commit: r.commit, warnings: r.warnings ?? [] };
}

/** DELETE /api/dashboard: back to the default layout (the server answers with it on the next /api/me). */
export async function resetDashboard(): Promise<void> {
  await api<unknown>("dashboard", { method: "DELETE" });
  await queryClient.invalidateQueries({ queryKey: ["me"] });
}
