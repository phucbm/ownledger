import { useMemo } from "react";
import type { ComboGroup } from "@/components/transactions/Combobox";
import { useI18n } from "@/i18n";
import { useMe, useMeta } from "@/lib/queries";

/**
 * Options for any "which account" picker: the pool line first when the pool is on ("pool" is the value the API
 * understands as every account in it), then open accounts grouped by type, then closed ones.
 */
export function useAccountGroups(): ComboGroup[] {
  const { t, lang } = useI18n();
  const meta = useMeta().data;
  const pool = useMe().data?.pool;
  const poolName = pool?.name ?? t("pool.name");
  return useMemo(() => {
    const groups: ComboGroup[] = [];
    if (pool?.on) groups.push({ options: [{ value: "pool", label: poolName }] });
    const open = (meta?.accounts ?? []).filter((a) => !a.closed);
    const closed = (meta?.accounts ?? []).filter((a) => a.closed);
    const byType = new Map<string, typeof open>();
    for (const a of open) byType.set(a.type, [...(byType.get(a.type) ?? []), a]);
    const typeLabel = (ty: string) => meta?.types[ty]?.[lang] ?? ty;
    for (const [ty, list] of [...byType].sort((a, b) => typeLabel(a[0]).localeCompare(typeLabel(b[0]), lang))) groups.push({ heading: typeLabel(ty), options: list.map((a) => ({ value: a.id, label: a.name, keywords: [a.id] })) });
    if (closed.length) groups.push({ heading: t("filter.closed"), options: closed.map((a) => ({ value: a.id, label: a.name, keywords: [a.id] })) });
    return groups;
  }, [meta, pool?.on, poolName, lang, t]);
}
