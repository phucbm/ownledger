import { createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const hueClass = { spend: "text-hue-spend", money: "text-hue-money", cards: "text-hue-cards", time: "text-hue-time", alert: "text-hue-alert" } as const;

/** The icon and colour family of the widget being drawn (Home sets it from the registry), so each widget need not pass it. */
export const WidgetIconContext = createContext<{ icon: LucideIcon; hue: keyof typeof hueClass } | null>(null);

/**
 * The frame every widget uses: title, an optional menu slot (edit mode puts its buttons there), a skeleton while
 * loading, an empty state that says why, and an "AI" mark for widgets the AI added.
 * It fills its grid cell (`h-full`); the body scrolls when the content is taller.
 */
export function WidgetCard({
  title,
  titleHref,
  menu,
  loading,
  empty,
  error,
  byAi,
  children,
  className,
}: {
  title: ReactNode;
  titleHref?: string;
  menu?: ReactNode;
  loading?: boolean;
  /** Why there is nothing to show (translated); when set it replaces the body. */
  empty?: ReactNode;
  error?: string;
  byAi?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const meta = useContext(WidgetIconContext);
  const Icon = meta?.icon;
  let body: ReactNode = children;
  if (loading) body = <WidgetSkeleton />;
  else if (error) body = <p className="text-sm text-muted-foreground">{t("common.error", { message: error })}</p>;
  else if (empty) body = <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <Card className={cn("h-full min-w-0 shadow-[0_1px_2px_oklch(0_0_0/0.04)] ring-foreground/[0.07]", className)}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
          {Icon && <Icon className={cn("size-4 shrink-0", hueClass[meta.hue])} aria-hidden />}
          {titleHref ? (
            <a href={titleHref} className="truncate rounded-md outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              {title}
            </a>
          ) : (
            <span className="truncate">{title}</span>
          )}
          {byAi && <AiMark />}
        </CardTitle>
        {menu && <CardAction>{menu}</CardAction>}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {body}
      </CardContent>
    </Card>
  );
}

/** The small "AI" mark on a widget the AI added. */
export function AiMark() {
  const { t } = useI18n();
  return (
    <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground" title={t("widget.byAi")}>
      {t("widget.aiMark")}
    </span>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
