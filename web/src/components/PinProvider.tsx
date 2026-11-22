import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { PinContext } from "@/components/PinToHome";
import type { SeriesQuery } from "@/lib/types";

// The dialog loads when someone pins; the first load only carries this small provider.
const PinDialog = lazy(() => import("@/components/editor/PinDialog"));

/** Supplies the "Pin to Home" handler: opens a small dialog that saves the chart as a widget. */
export function PinProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ query: SeriesQuery; title: string } | null>(null);
  const pin = useCallback((query: SeriesQuery, title: string) => setPending({ query, title }), []);
  return (
    <PinContext.Provider value={pin}>
      {children}
      {pending && (
        <Suspense fallback={null}>
          <PinDialog query={pending.query} title={pending.title} onClose={() => setPending(null)} />
        </Suspense>
      )}
    </PinContext.Provider>
  );
}
