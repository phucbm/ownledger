import { useMemo } from "react";
import { Combobox, type ComboGroup } from "@/components/transactions/Combobox";
import { useI18n } from "@/i18n";
import { useMeta } from "@/lib/queries";

/** A category list in tree order (expense and income, no system categories) for the combobox. */
export function categoryGroups(meta: ReturnType<typeof useMeta>["data"], kind?: "expense" | "income"): ComboGroup[] {
  const cats = (meta?.categories ?? []).filter((c) => !c.path.startsWith("_") && (!kind || c.kind === kind));
  const order = (p: string) => p.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"));
  // tree order: parents before children, siblings in the meta order
  const idx = new Map(cats.map((c, i) => [c.path, i]));
  const sorted = [...cats].sort((a, b) => {
    const pa = order(a.path).map((p) => idx.get(p) ?? 1e9);
    const pb = order(b.path).map((p) => idx.get(p) ?? 1e9);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? -1) !== (pb[i] ?? -1)) return (pa[i] ?? -1) - (pb[i] ?? -1);
    return 0;
  });
  return [{ options: sorted.map((c) => ({ value: c.path, label: c.name, depth: c.path.split("/").length - 1, keywords: [c.path] })) }];
}

/** Picks one expense category (for "Which card?"). */
export function CategoryPicker({ value, onSelect, className }: { value?: string; onSelect: (v: string) => void; className?: string }) {
  const { t } = useI18n();
  const meta = useMeta().data;
  const groups = useMemo(() => categoryGroups(meta, "expense"), [meta]);
  return <Combobox label={t("filter.category")} groups={groups} value={value} onSelect={onSelect} className={className ?? "w-full"} />;
}
