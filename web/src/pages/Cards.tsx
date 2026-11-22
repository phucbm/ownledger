import { useMemo, useState } from "react";
import { Money } from "@/components/Money";
import { CardStatusBadge, DaysLeft, MissingHint, StatementStatus, UsedBar, ValueRows } from "@/components/cards/bits";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n";
import { cardHref, statusGroup } from "@/lib/cards";
import { dayMonth } from "@/lib/dates";
import { drillHref } from "@/lib/drill";
import { formatShort } from "@/lib/format";
import { useCardsModule, useMe } from "@/lib/queries";
import type { CardRecord, CardSummary } from "@/lib/types";

type Group = "active" | "locked" | "cancelled";

function Tile({ label, amount, sub }: { label: string; amount: number; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Money amount={amount} mode="short" className="text-xl font-semibold tracking-tight" />
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function CardRow({ c }: { c: CardSummary }) {
  const { t, lang } = useI18n();
  const cb = c.cashback;
  const showCb = cb && (cb.expected > 0 || cb.spend > 0 || cb.cap !== null);
  return (
    <li className="relative flex flex-col gap-2 rounded-xl border bg-card p-3 focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <a href={cardHref(c.account)} className="min-h-6 truncate rounded-md text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:underline">
              {c.name}
            </a>
            <CardStatusBadge status={c.status} />
          </span>
          <span className="text-xs text-muted-foreground">{[c.bank, c.last4 ? t("cards.last4", { n: c.last4 }) : null].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          {c.toPay > 0 ? (
            <>
              <Money amount={c.toPay} mode="short" className="text-base font-semibold" />
              <span className="flex items-center gap-1.5">
                {c.due && <span className="text-xs text-muted-foreground">{dayMonth(c.due)}</span>}
                <DaysLeft days={c.daysToDue} />
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t("cards.nothingToPay")}</span>
          )}
        </div>
      </div>
      <UsedBar owed={c.owed} limit={c.limit} atLeast={c.limitAtLeast} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {c.last ? <StatementStatus status={c.last.status} /> : <span className="text-xs text-muted-foreground">{t("cards.noStatement")}</span>}
        {showCb && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("cards.cashbackShort")} {cb.incomplete ? t("cards.rateNotSet") : <Money amount={cb.expected} mode="short" className="font-medium text-foreground" />}
            {cb.capLeft !== null && <> · {t("cards.capLeft", { amount: formatShort(cb.capLeft, lang) })}</>}
          </span>
        )}
      </div>
      <MissingHint card={c} />
    </li>
  );
}

function DebitRow({ r }: { r: CardRecord }) {
  const { t } = useI18n();
  const name = r.name ?? ([r.bank, r.last4].filter(Boolean).join(" ") || r.id);
  const facts = [r.bank, r.network?.toUpperCase(), r.last4 ? t("cards.last4", { n: r.last4 }) : null, t(`cards.kind.${r.kind}`)].filter(Boolean).join(" · ");
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <CardStatusBadge status={r.status ?? "active"} />
        </span>
        <span className="truncate text-xs text-muted-foreground">{facts}</span>
      </span>
      <span className="shrink-0 text-right text-xs text-muted-foreground">
        {r.annual_fee ? <>{t("cards.annualFee")} <Money amount={r.annual_fee} mode="short" className="text-foreground" /></> : t("cards.noFee")}
      </span>
    </>
  );
  return (
    <li>
      {r.account ? (
        <a href={drillHref({ account: r.account })} className="flex min-h-11 items-center gap-3 rounded-md px-1 py-1.5 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">{inner}</a>
      ) : (
        <div className="flex min-h-11 items-center gap-3 px-1 py-1.5">{inner}</div>
      )}
    </li>
  );
}

export default function Cards() {
  const { t, lang } = useI18n();
  const me = useMe().data;
  const on = Boolean(me?.features?.cards);
  const [group, setGroup] = useState<Group>("active");
  const base = useCardsModule(on, false);
  const closed = useCardsModule(on && group === "cancelled", true);
  const data = group === "cancelled" ? (closed.data ?? base.data) : base.data;
  const error = base.error ?? (group === "cancelled" ? closed.error : null);

  const credit = useMemo(() => (data?.cards ?? []).filter((c) => statusGroup(c.status) === group), [data, group]);
  const debit = useMemo(() => (data?.records ?? []).filter((r) => r.kind !== "credit" && statusGroup(r.status ?? "active") === group), [data, group]);
  const openCards = (base.data?.cards ?? []).filter((c) => c.owed > 0).length;

  if (!on && me) return <div className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">{t("cards.title")}</h1><p className="text-sm text-muted-foreground">{t("cards.off")}</p></div>;

  const totals = base.data?.totals;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("cards.title")}</h1>
        {totals ? <p className="text-sm text-muted-foreground">{t("cards.headline", { owed: formatShort(totals.owed, lang), n: openCards })}</p> : <Skeleton className="h-5 w-64" />}
      </header>

      {error ? (
        <p className="text-sm text-muted-foreground">{t("common.error", { message: error.message })}</p>
      ) : !data ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <section aria-label={t("cards.totals")} className="grid grid-cols-3 gap-2">
            <Tile label={t("cards.owedAll")} amount={data.totals.owed} />
            <Tile label={t("cards.dueWeek")} amount={data.totals.dueWeek} />
            <Tile label={t("cards.dueMonth")} amount={data.totals.dueMonth} />
          </section>

          <ToggleGroup type="single" variant="outline" value={group} onValueChange={(v) => v && setGroup(v as Group)} aria-label={t("cards.filter")} className="self-start">
            {(["active", "locked", "cancelled"] as const).map((g) => (
              <ToggleGroupItem key={g} value={g} className="min-h-11 px-3 md:min-h-8">{t(`cards.group.${g}`)}</ToggleGroupItem>
            ))}
          </ToggleGroup>

          <section className="flex flex-col gap-3" aria-labelledby="cards-credit">
            <h2 id="cards-credit" className="text-base font-semibold">{t("cards.credit")}</h2>
            {credit.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("cards.emptyCredit")}</p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{credit.map((c) => <CardRow key={c.account} c={c} />)}</ul>
            )}
          </section>

          {debit.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="cards-debit">
              <h2 id="cards-debit" className="text-base font-semibold">{t("cards.debit")}</h2>
              <p className="text-xs text-muted-foreground">{t("cards.debitHint")}</p>
              <ul className="flex flex-col divide-y rounded-xl border bg-card px-2">{debit.map((r) => <DebitRow key={r.id} r={r} />)}</ul>
            </section>
          )}

          {data.values.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="cards-value">
              <h2 id="cards-value" className="text-base font-semibold">{t("widget.cards_value")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("cards.value.hint")}
                {" "}
                <span>{t("cards.value.total", { amount: formatShort(data.values.reduce((s, v) => s + v.last12.net, 0), lang) })}</span>
              </p>
              <div className="rounded-xl border bg-card px-3"><ValueRows values={data.values} /></div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
