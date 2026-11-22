import { BestCardList } from "@/components/cards/bits";
import { useI18n } from "@/i18n";
import { useBestCard } from "@/lib/queries";

/** The top cards to use for a category. Mount it only when asked for (a row expanded): it fetches on mount. */
export function BestHint({ category }: { category: string }) {
  const { t } = useI18n();
  const { data, error, isLoading } = useBestCard(category, true);
  if (isLoading) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  if (error) return <p className="text-xs text-muted-foreground">{t("common.error", { message: error.message })}</p>;
  if (!data?.length) return <p className="text-xs text-muted-foreground">{t("best.none")}</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{t("best.title")}</p>
      <BestCardList rows={data} limit={2} />
    </div>
  );
}
