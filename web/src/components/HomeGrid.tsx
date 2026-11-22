import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useMemo, type ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { widgetRegistry } from "@/components/widgets/registry";
import { cn } from "@/lib/utils";
import { flow } from "@/lib/dashboard";
import type { Widget } from "@/lib/types";

export const GRID_COLS = 12;
export const ROW_HEIGHT = 80;
export const GRID_GAP = 16;
/** Below this width the grid is one column in widget order (and edit mode there is reorder, add, remove only). */
export const STACK_BELOW = 640;
/** From this width (and when not editing) 6-wide widgets are shown 4 wide, three to a row. Display only: never saved. */
export const THREE_UP_FROM = 1536;
/** The class of the element that starts a drag in edit mode (the grip in each widget's header). */
export const DRAG_HANDLE = "widget-drag-handle";

const byPosition = (a: Widget, b: Widget) => a.y - b.y || a.x - b.x;

/**
 * The widget grid: 12 columns, 80px rows, x/y/w/h from the layout. With `editing` the widgets drag by their handle
 * and resize from the corner (snapped to the grid, never below the widget's minimum); changes come back through
 * `onLayoutChange`. On phones the grid is one column in widget order and has no drag or resize.
 * `renderWidget(widget)` returns the card; edit mode passes its buttons through the card's `menu` slot there.
 */
export function HomeGrid({ widgets, renderWidget, editing = false, onLayoutChange }: { widgets: Widget[]; renderWidget: (w: Widget) => ReactNode; editing?: boolean; onLayoutChange?: (layout: Layout) => void }) {
  const stacked = useMediaQuery(`(max-width: ${STACK_BELOW - 1}px)`);
  const wide = useMediaQuery(`(min-width: ${THREE_UP_FROM}px)`);
  const { width, containerRef, mounted } = useContainerWidth();
  const threeUp = wide && !editing;
  const shown = useMemo(() => (threeUp ? flow([...widgets].sort(byPosition).map((w) => (w.w === 6 ? { ...w, w: 4 } : w))) : widgets), [threeUp, widgets]);

  if (stacked) {
    return (
      <div className="flex flex-col gap-4">
        {[...widgets].sort(byPosition).map((w) => (
          <div key={w.id} className={cn("flex flex-col *:flex-1", editing && "rounded-xl outline-2 outline-offset-2 outline-dashed outline-border")} style={{ minHeight: w.h * ROW_HEIGHT + (w.h - 1) * GRID_GAP }}>
            {renderWidget(w)}
          </div>
        ))}
      </div>
    );
  }

  const layout = shown.map((w) => {
    const min = widgetRegistry[w.type]?.min;
    return { i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, ...(min ? { minW: Math.min(min.w, w.w), minH: Math.min(min.h, w.h) } : {}) };
  });
  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: [GRID_GAP, GRID_GAP], containerPadding: [0, 0] }}
          dragConfig={{ enabled: editing, handle: `.${DRAG_HANDLE}` }}
          resizeConfig={{ enabled: editing }}
          compactor={verticalCompactor}
          onLayoutChange={editing ? onLayoutChange : undefined}
        >
          {shown.map((w) => (
            <div key={w.id} className={cn("flex flex-col *:flex-1", editing && "rounded-xl outline-2 outline-offset-2 outline-dashed outline-border")}>
              {renderWidget(w)}
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
