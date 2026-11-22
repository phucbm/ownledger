import { DrillLink } from "@/components/DrillLink";
import { Money } from "@/components/Money";
import { WidgetCard } from "@/components/WidgetCard";
import { useI18n } from "@/i18n";
import { useHome } from "@/lib/queries";
import { useWidgetTitle, type WidgetProps } from "./shared";

export default function Left({ widget, menu }: WidgetProps) {
  const { t } = useI18n();
  const title = useWidgetTitle(widget, "widget.left");
  const { data, error, isLoading } = useHome();
  const l = data?.left;
  return (
    <WidgetCard title={title} menu={menu} loading={isLoading} error={error?.message}>
      {l && data && (
        <>
          <Money amount={l.now} tone="auto" className="text-2xl font-semibold tracking-tight" />
          <p className="text-sm text-muted-foreground">
            {t("left.monthEnd")} <Money amount={l.monthEnd} tone="auto" mode="short" className="font-medium" />
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("tx.in")}</dt>
              <dd><DrillLink filter={{ from: `${data.asOf.slice(0, 7)}-01`, to: data.asOf }}><Money amount={l.income} mode="short" /></DrillLink></dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("tx.out")}</dt>
              <dd><Money amount={l.spent} mode="short" /></dd>
            </div>
          </dl>
        </>
      )}
    </WidgetCard>
  );
}
