import { useMemo, useState } from "react";
import { BestCardList } from "@/components/cards/bits";
import { CategoryPicker } from "@/components/cards/CategoryPicker";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { useBestCard, useMe } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

/** Pick a category, see the open cards ranked for it with the reason for each. */
export default function WhichCard({ widget, menu }: WidgetProps) {
  const { t } = useI18n();
  const title = useWidgetTitle(widget, "widget.which_card");
  const on = Boolean(useMe().data?.features?.cards);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { data, error, isLoading } = useBestCard(category, on);
  const rows = useMemo(() => data ?? [], [data]);
  return (
    <WidgetCard title={title} menu={menu} empty={!on ? t("cards.emptyCredit") : undefined}>
      <CategoryPicker value={category} onSelect={setCategory} />
      {!category ? (
        <p className="text-sm text-muted-foreground">{t("best.pick")}</p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">{t("common.error", { message: error.message })}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("best.none")}</p>
      ) : (
        <BestCardList rows={rows} />
      )}
    </WidgetCard>
  );
}
