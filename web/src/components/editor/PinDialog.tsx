import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { widgetRegistry } from "@/components/widgets/registry";
import { useI18n } from "@/i18n";
import { appendedWidget, chartFor, cleanQuery, saveWidgets, TITLE_MAX } from "@/lib/dashboard";
import { useMe } from "@/lib/queries";
import type { SeriesQuery } from "@/lib/types";
import { Field } from "./Field";

/** "Pin to Home": a small dialog with an editable title; Pin saves the current widgets plus this chart at once. */
export default function PinDialog({ query, title, onClose }: { query: SeriesQuery; title: string; onClose: () => void }) {
  const { t } = useI18n();
  const me = useMe().data;
  const [name, setName] = useState(title.slice(0, TITLE_MAX));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pin = async () => {
    setBusy(true);
    setError(null);
    try {
      const widgets = me?.dashboard?.widgets ?? [];
      const w = appendedWidget(widgets, { type: "chart", ...(name.trim() ? { title: name.trim() } : {}), query: cleanQuery(query), chart: chartFor(query) }, widgetRegistry.chart!.size);
      await saveWidgets([...widgets, w]);
      setDone(true);
    } catch (e) {
      setError(t("pin.error", { message: (e as Error).message }));
    }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? t("pin.done") : t("pin.title")}</DialogTitle>
          <DialogDescription>{done ? t("pin.doneHint") : t("pin.description")}</DialogDescription>
        </DialogHeader>
        {done ? (
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-8" onClick={onClose}>
              {t("pin.close")}
            </Button>
            <Button asChild className="min-h-11 md:min-h-8">
              <a href="#/" onClick={onClose}>
                <Check />
                {t("pin.openHome")}
              </a>
            </Button>
          </DialogFooter>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void pin();
            }}
          >
            <Field label={t("pin.titleLabel")}>{(id) => <Input id={id} className="min-h-11 md:min-h-8" maxLength={TITLE_MAX} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-8" disabled={busy} onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" className="min-h-11 md:min-h-8" disabled={busy}>
                {busy ? t("pin.saving") : t("pin.save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
