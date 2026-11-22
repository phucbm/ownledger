import { ValueRows } from "@/components/cards/bits";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { useCardsModule, useMe } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

/** Net value per card (benefits + cashback − fees), the card that cost most over the last 12 months first. */
export default function CardsValue({ widget, menu }: WidgetProps) {
  const { t } = useI18n();
  const title = useWidgetTitle(widget, "widget.cards_value");
  const on = Boolean(useMe().data?.features?.cards);
  const { data, error, isLoading } = useCardsModule(on);
  const values = data?.values ?? [];
  return (
    <WidgetCard title={title} titleHref="#/cards" menu={menu} loading={on && isLoading} error={on ? error?.message : undefined} empty={!on || (data && values.length === 0) ? t("cards.value.empty") : undefined}>
      <p className="text-xs text-muted-foreground">{t("cards.value.hint")}</p>
      <ValueRows values={values} limit={8} compact />
    </WidgetCard>
  );
}
