import { TxRow } from "@/components/TxRow";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { namesFrom } from "@/lib/tx";
import { useMeta, useTransactions } from "@/lib/queries";
import { useMemo } from "react";
import { useWidgetTitle, type WidgetProps } from "./shared";

export default function Recent({ widget, menu }: WidgetProps) {
  const { t } = useI18n();
  const title = useWidgetTitle(widget, "widget.recent");
  const n = Math.min(30, Math.max(3, widget.count ?? 8));
  const { data, error, isLoading } = useTransactions({}, n);
  const meta = useMeta().data;
  const names = useMemo(() => namesFrom(meta), [meta]);
  const items = data?.pages[0]?.items.slice(0, n) ?? [];
  return (
    <WidgetCard title={title} titleHref="#/transactions" menu={menu} loading={isLoading || !meta} error={error?.message} empty={data && items.length === 0 ? t("recent.empty") : undefined}>
      <ul className="-mx-2 flex flex-col">
        {items.map((tx) => (
          <li key={tx.id}>
            <a href={`#/transactions?tx=${encodeURIComponent(tx.id)}&from=${tx.date}&to=${tx.date}`} className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <TxRow tx={tx} names={names} />
            </a>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
