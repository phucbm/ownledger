import { Pin } from "lucide-react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { SeriesQuery } from "@/lib/types";

/**
 * "Pin to Home": a chart tells this button its `SeriesQuery` and title; whoever provides the handler (step 7) turns it
 * into a `chart` widget on the person's dashboard. With no provider the button is not drawn.
 */
export type PinHandler = (query: SeriesQuery, title: string) => void;
export const PinContext = createContext<PinHandler | null>(null);

export function PinToHome({ query, title }: { query: SeriesQuery; title: string }) {
  const { t } = useI18n();
  const pin = useContext(PinContext);
  if (!pin) return null;
  return (
    <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" onClick={() => pin(query, title)}>
      <Pin />
      {t("pin.button")}
    </Button>
  );
}
