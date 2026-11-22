import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { AskAI } from "@/components/AskAI";
import { Money } from "@/components/Money";
import { useI18n, type Lang } from "@/i18n";
import { cardHref } from "@/lib/cards";
import { dayMonth } from "@/lib/dates";
import { formatNumber, formatShort } from "@/lib/format";
import type { BestCard, CardSummary, CardValue } from "@/lib/types";
import { cn } from "@/lib/utils";

type Translate = ReturnType<typeof useI18n>["t"];

/** Used against limit. A missing limit shows "≥ <most ever owed>" in muted text, never as the limit. */
export function UsedBar({ owed, limit, atLeast, className }: { owed: number; limit: number | null; atLeast?: number | null; className?: string }) {
  const { t, lang } = useI18n();
  const ratio = limit ? Math.min(1, Math.max(0, owed / limit)) : 0;
  const tone = limit && owed / limit >= 1 ? "bg-critical" : limit && owed / limit >= 0.8 ? "bg-warning" : "bg-[var(--chart-1)]";
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {limit ? (
        <div role="progressbar" aria-label={t("cards.used")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} className="h-2 w-full rounded-full bg-muted">
          <div className={cn("h-2 rounded-full", tone)} style={{ width: `${Math.max(ratio ? 2 : 0, ratio * 100)}%` }} />
        </div>
      ) : (
        <div className="h-2 w-full rounded-full bg-muted" aria-hidden />
      )}
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted-foreground tabular-nums">
        <span>
          <Money amount={owed} mode="short" className="font-medium text-foreground" />
          {limit ? <> {t("cards.ofLimit")} <Money amount={limit} mode="short" /></> : null}
        </span>
        {!limit && (atLeast ?? 0) > 0 && <span>{t("cards.limitAtLeast", { amount: formatShort(atLeast!, lang) })}</span>}
        {!limit && !atLeast && <span>{t("cards.noLimit")}</span>}
      </p>
    </div>
  );
}

/** Days to a due date: amber at 7 or fewer, red at 3 or fewer and when overdue. Always words, colour only helps. */
export function DaysLeft({ days, className }: { days: number | null; className?: string }) {
  const { t } = useI18n();
  if (days === null) return null;
  const text = days < 0 ? t("cards.overdueDays", { n: -days }) : days === 0 ? t("cards.dueToday") : t("cards.daysLeft", { n: days });
  return <span className={cn("whitespace-nowrap text-xs font-medium tabular-nums", days <= 3 ? "text-critical" : days <= 7 ? "text-warning" : "text-muted-foreground", className)}>{text}</span>;
}

/** The state of the last statement: paid in full or not. */
export function StatementStatus({ status, className }: { status: string; className?: string }) {
  const { t } = useI18n();
  const bad = status === "late" || status === "partly" || status === "unpaid";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", bad ? "font-medium text-critical" : status === "due" ? "font-medium text-warning" : "text-muted-foreground", className)}>
      {status === "paid" && <Check className="size-3.5" aria-hidden />}
      {t(`cards.st.${status}`)}
    </span>
  );
}

export function CardStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "active") return null;
  return <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{t(`cards.status.${status}`)}</span>;
}

export function missingList(missing: string[], t: Translate): string {
  return missing.map((m) => t(`cards.missing.${m}`)).join(", ");
}

/** "Missing terms" hint with an Ask AI prompt that sets them through Claude (`set_card_details`). */
export function MissingHint({ card, className }: { card: Pick<CardSummary, "name" | "missing">; className?: string }) {
  const { t } = useI18n();
  if (!card.missing.length) return null;
  const list = missingList(card.missing, t);
  return (
    <div className={cn("relative z-10 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground", className)}>
      <span>{t("cards.missing", { list })}</span>
      <AskAI prompt={t("ask.cardTerms", { name: card.name, list })} />
    </div>
  );
}

/** The reasons a card ranks where it does, in the UI language (the API's `reason` is English). */
export function bestReason(b: BestCard, t: Translate, lang: Lang): string {
  const parts: string[] = [];
  parts.push(b.rate === null ? t("cards.best.noRate") : t("cards.best.rate", { rate: formatNumber(b.rate, lang, 2) }));
  if (b.capLeft !== null) parts.push(t("cards.best.capLeft", { amount: formatShort(b.capLeft, lang) }));
  if (b.minSpendShort > 0) parts.push(t("cards.best.minShort", { amount: formatShort(b.minSpendShort, lang) }));
  if (b.payBy) parts.push(b.freeDays !== null ? t("cards.best.payByDays", { date: dayMonth(b.payBy), n: b.freeDays }) : t("cards.best.payBy", { date: dayMonth(b.payBy) }));
  if (b.limitLeft !== null) parts.push(t("cards.best.limitLeft", { amount: formatShort(b.limitLeft, lang) }));
  return parts.join(" · ");
}

/** A ranked list from `best`. */
export function BestCardList({ rows, limit }: { rows: BestCard[]; limit?: number }) {
  const { t, lang } = useI18n();
  return (
    <ol className="flex flex-col divide-y">
      {rows.slice(0, limit ?? rows.length).map((b, i) => (
        <li key={b.account} className="flex min-h-11 items-center gap-2 py-1.5">
          <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <a href={cardHref(b.account)} className="truncate rounded-md text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{b.name}</a>
            <span className="text-xs text-muted-foreground">{bestReason(b, t, lang)}</span>
          </span>
          {b.earn !== null && <Money amount={b.earn} mode="short" plus tone="in" className="shrink-0 text-sm font-medium" />}
        </li>
      ))}
    </ol>
  );
}

/** Net value per card, worst last-12-months first (the card to decide about). Fees read from the card record are marked estimated. */
export function ValueRows({ values, limit, compact }: { values: CardValue[]; limit?: number; compact?: boolean }) {
  const { t, lang } = useI18n();
  const sorted = [...values].sort((a, b) => a.last12.net - b.last12.net || a.name.localeCompare(b.name));
  const list = sorted.slice(0, limit ?? sorted.length);
  const label = (v: CardValue): ReactNode => (v.account && v.kind === "credit" ? <a href={cardHref(v.account)} className="truncate rounded-md outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{v.name}</a> : <span className="truncate">{v.name}</span>);
  return (
    <ul className="flex flex-col divide-y">
      {list.map((v) => (
        <li key={v.card} className="flex min-h-11 flex-col justify-center gap-0.5 py-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium">{label(v)}<CardStatusBadge status={v.status} /></span>
            <span className="shrink-0 tabular-nums"><Money amount={v.last12.net} mode="short" tone="auto" className="font-medium" /></span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
            <span>
              {t("cards.value.sinceIssued")} <Money amount={v.net} mode="short" tone="auto" />
              {v.feesFrom === "record" && <> · {t("cards.value.estimated")}</>}
            </span>
            {!compact && (
              <span className="tabular-nums">{t("cards.value.parts", { benefits: formatShort(v.last12.benefits, lang), cashback: formatShort(v.last12.cashback, lang), fees: formatShort(v.last12.fees, lang) })}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
