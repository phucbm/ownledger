import { ArrowLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { AskAI } from "@/components/AskAI";
import { DrillLink } from "@/components/DrillLink";
import { KV } from "@/components/KV";
import { Money } from "@/components/Money";
import { Panel } from "@/components/Panel";
import { CardStatusBadge, DaysLeft, MissingHint, StatementStatus, UsedBar } from "@/components/cards/bits";
import { StatementSheet } from "@/components/cards/StatementSheet";
import { ChartFrame, ColumnChart, chartColor } from "@/components/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { daysToClose, nextStatementDate } from "@/lib/cards";
import { addDaysIso, daysBetween, monthShort } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { useCardDetail } from "@/lib/queries";
import type { CardDetail as Detail, CardStatement, CashbackPeriod } from "@/lib/types";
import { cn } from "@/lib/utils";

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} className="h-2 w-full rounded-full bg-muted">
      <div className="h-2 rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(ratio ? 2 : 0, ratio * 100)}%` }} />
    </div>
  );
}

function Period({ d, asOf }: { d: Detail; asOf: string }) {
  const { t, lang } = useI18n();
  const cur = d.summary?.current;
  const sd = d.terms.statementDay;
  const id = d.account.id;
  return (
    <Panel title={t("cards.currentPeriod")}>
      {cur ? (
        <dl className="divide-y">
          <KV label={t("cards.purchasesSoFar")}>
            <DrillLink filter={{ account: id, from: cur.from, to: asOf }} className="font-medium"><Money amount={cur.purchases} /></DrillLink>
          </KV>
          {sd && (
            <KV label={t("cards.closesOn")}>
              {formatDate(nextStatementDate(asOf, sd), lang)} · <span className="text-muted-foreground">{t("cards.daysLeft", { n: daysToClose(asOf, sd) })}</span>
            </KV>
          )}
          {d.payByToday && (
            <KV label={t("cards.payByToday")}>
              <span className="font-medium">{formatDate(d.payByToday, lang)}</span> · <span className="text-muted-foreground">{t("cards.daysLeft", { n: daysBetween(asOf, d.payByToday) })}</span>
            </KV>
          )}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{sd ? t("cards.noActivity") : t("cards.noStatementDay")}</p>
      )}
    </Panel>
  );
}

function LastStatement({ s, id, asOf }: { s: CardStatement | null; id: string; asOf: string }) {
  const { t, lang } = useI18n();
  return (
    <Panel title={s ? t("cards.statementOf", { date: formatDate(s.close, lang) }) : t("cards.lastStatement")} action={s ? <StatementStatus status={s.status} /> : undefined}>
      {s ? (
        <dl className="divide-y">
          <KV label={t("cards.amountDue")}>
            <DrillLink filter={{ account: id, from: s.from, to: s.close }} className="text-lg font-semibold"><Money amount={s.amountDue} /></DrillLink>
          </KV>
          {s.due && (
            <KV label={t("cards.dueDate")}>
              {formatDate(s.due, lang)} {s.toPay > 0 && <DaysLeft days={daysBetween(asOf, s.due)} className="ml-1" />}
            </KV>
          )}
          <KV label={t("cards.paid")}>
            <DrillLink filter={{ account: id, from: addDaysIso(s.close, 1), to: asOf }}><Money amount={s.paid} /></DrillLink>
          </KV>
          <KV label={t("cards.toPay")} className="font-medium"><Money amount={s.toPay} /></KV>
          {s.deferred > 0 && <KV label={t("cards.deferred")}><Money amount={s.deferred} /></KV>}
          {s.bank !== null && (
            <KV label={t("cards.bankAmount")}>
              <Money amount={s.bank} />
              {s.bankDiff !== null && s.bankDiff !== 0 && <span className="block text-xs text-warning">{t("cards.bankDiff", { amount: `${s.bankDiff > 0 ? "+" : "−"}${formatNumber(Math.abs(s.bankDiff), lang)}` })}</span>}
            </KV>
          )}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("cards.noClosed")}</p>
      )}
    </Panel>
  );
}

function History({ list, onOpen }: { list: CardStatement[]; onOpen: (close: string) => void }) {
  const { t, lang } = useI18n();
  return (
    <Panel title={t("cards.history")}>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("cards.noHistory")}</p>
      ) : (
        <ul className="-mx-2 flex flex-col divide-y">
          {list.map((s) => (
            <li key={s.close}>
              <button type="button" onClick={() => onOpen(s.close)} className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{s.open ? t("cards.currentPeriod") : formatDate(s.close, lang)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDate(s.from, lang, { day: "2-digit", month: "2-digit" })} – {formatDate(s.close, lang, { day: "2-digit", month: "2-digit" })} · {t("cards.purchasesShort")} <Money amount={s.purchases} mode="short" />
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <Money amount={s.open ? s.closing : s.amountDue} mode="short" className="text-sm font-medium" />
                  {!s.open && <StatementStatus status={s.status} />}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Cashback({ d }: { d: Detail }) {
  const { t, lang } = useI18n();
  const cur: CashbackPeriod | null = d.summary?.cashback ?? null;
  const closed = useMemo(() => [...d.cashback].filter((p) => !p.open).reverse().slice(-12), [d.cashback]);
  const rows = closed.map((p) => ({ ym: p.close, label: monthShort(p.close.slice(0, 7)), expected: p.expected, received: p.received }));
  if (!d.terms.cashback && !d.cashback.some((p) => p.expected > 0 || p.received > 0)) {
    return (
      <Panel title={t("cards.cashback")}>
        <p className="text-sm text-muted-foreground">{t("cards.noCashback")}</p>
        <AskAI prompt={t("ask.cardTerms", { name: d.account.name, list: t("cards.missing.cashback_rates") })} />
      </Panel>
    );
  }
  return (
    <Panel title={t("cards.cashback")}>
      {cur && (
        <dl className="divide-y">
          <KV label={t("cards.spendThisPeriod")}><DrillLink filter={{ account: d.account.id, from: cur.from, to: cur.close }}><Money amount={cur.spend} /></DrillLink></KV>
          <KV label={t("cards.expected")}>{cur.incomplete ? <span className="text-warning">{t("cards.rateNotSet")}</span> : <Money amount={cur.expected} className="font-medium" />}</KV>
          {cur.cap !== null && cur.capLeft !== null && <KV label={t("cards.capLeftLabel")}><Money amount={cur.capLeft} /> <span className="text-muted-foreground">/ <Money amount={cur.cap} mode="short" /></span></KV>}
        </dl>
      )}
      {cur?.safeUntil && cur.daysLeft !== undefined && (
        <p className={cn("text-xs", cur.daysLeft >= 0 && cur.daysLeft <= 3 ? "text-warning" : "text-muted-foreground")}>
          {cur.daysLeft >= 0 ? t("cards.safeUntil", { date: formatDate(cur.safeUntil, lang), n: cur.daysLeft }) : t("cards.safePassed", { date: formatDate(cur.safeUntil, lang) })}
        </p>
      )}
      {cur && (cur.groups ?? []).some((g) => g.cap !== null) && (
        <ul className="flex flex-col gap-2">
          {(cur.groups ?? []).filter((g) => g.cap !== null).map((g) => (
            <li key={g.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium">{g.label}{g.rate !== null && <span className="text-muted-foreground"> · {g.rate}%</span>}{g.inStore && <span className="text-muted-foreground"> · {t("cards.inStore")}</span>}</span>
                <span className="tabular-nums text-muted-foreground"><Money amount={g.earned} mode="short" /> / <Money amount={g.cap!} mode="short" /></span>
              </div>
              <Bar value={g.earned} max={g.cap!} label={g.label} />
              {g.room !== null && g.room > 0 && <p className="text-xs text-muted-foreground">{t("cards.groupRoom", { amount: formatNumber(g.room, lang) })}</p>}
            </li>
          ))}
        </ul>
      )}
      {cur && !(cur.groups ?? []).some((g) => g.cap !== null) && cur.roomSpend != null && cur.roomSpend > 0 && (
        <p className="text-xs text-muted-foreground">{t(cur.roomEstimate ? "cards.roomEstimate" : "cards.room", { amount: formatNumber(cur.roomSpend, lang) })}</p>
      )}
      {d.summary?.points && (
        <dl className="divide-y">
          <KV label={t("cards.points")}><span className="tabular-nums">{formatNumber(d.summary.points.balance, lang)}</span>{d.summary.points.redeemMin !== null && <span className="text-muted-foreground"> / {formatNumber(d.summary.points.redeemMin, lang)}</span>}</KV>
          {d.summary.points.pending > 0 && <KV label={t("cards.pointsPending")}><span className="tabular-nums">{formatNumber(d.summary.points.pending, lang)}</span></KV>}
          {d.summary.points.lots[0]?.expires && <KV label={t("cards.pointsExpire")}>{formatNumber(d.summary.points.lots[0].left, lang)} · {formatDate(d.summary.points.lots[0].expires, lang)}</KV>}
        </dl>
      )}
      {cur && cur.minSpend !== null && (
        <div className="flex flex-col gap-1">
          <Bar value={cur.spend} max={cur.minSpend} label={t("cards.minSpend")} />
          <p className="text-xs text-muted-foreground">{cur.minMet ? t("cards.minMet", { amount: formatNumber(cur.minSpend, lang) }) : t("cards.minNeed", { amount: formatNumber(cur.needForMin, lang), min: formatNumber(cur.minSpend, lang) })}</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{t("cards.last12")}</p>
          <div className="flex h-40 flex-col">
            <ChartFrame
              legend={[
                { label: t("cards.earned"), color: chartColor.accent },
                { label: t("cards.expected"), color: chartColor.second },
              ]}
              table={{ head: [t("chart.month"), t("cards.earned"), t("cards.expected")], rows: rows.map((r) => [r.label, formatNumber(r.received, lang), formatNumber(r.expected, lang)]) }}
            >
              <ColumnChart
                data={rows}
                xKey="label"
                series={[
                  { key: "received", label: t("cards.earned"), color: chartColor.accent },
                  { key: "expected", label: t("cards.expected"), color: chartColor.second },
                ]}
              />
            </ChartFrame>
          </div>
        </div>
      )}
    </Panel>
  );
}

function FeeWaiver({ d, asOf }: { d: Detail; asOf: string }) {
  const { t, lang } = useI18n();
  const f = d.feeWaiver;
  if (!f && !d.terms.annualFee) return null;
  return (
    <Panel title={t("cards.feeWaiver")}>
      {f ? (
        <>
          <Bar value={f.spent} max={f.target} label={t("cards.feeWaiver")} />
          <dl className="divide-y">
            <KV label={t("cards.spent")}><DrillLink filter={{ account: d.account.id, from: f.yearFrom, to: asOf }}><Money amount={f.spent} /></DrillLink> <span className="text-muted-foreground">/ <Money amount={f.target} mode="short" /></span></KV>
            <KV label={t("cards.deadline")}>{formatDate(f.deadline, lang)} <span className="text-muted-foreground">· {t("cards.daysLeft", { n: f.daysLeft })}</span></KV>
            {!f.met && <KV label={t("cards.perMonth")}><Money amount={f.perMonth} /></KV>}
            {d.terms.annualFee ? <KV label={t("cards.annualFee")}><Money amount={d.terms.annualFee} /></KV> : null}
          </dl>
          <p className={cn("text-sm font-medium", f.met || f.onTrack ? "text-foreground" : "text-critical")}>{f.met ? t("cards.feeMet") : f.onTrack ? t("cards.onTrack") : t("cards.behind")}</p>
        </>
      ) : (
        <dl>
          <KV label={t("cards.annualFee")}><Money amount={d.terms.annualFee!} /></KV>
          <p className="py-1 text-sm text-muted-foreground">{t("cards.noWaiver")}</p>
        </dl>
      )}
    </Panel>
  );
}

function Instalments({ d }: { d: Detail }) {
  const { t } = useI18n();
  if (d.instalments.length === 0) return null;
  return (
    <Panel title={t("cards.instalments")}>
      <ul className="flex flex-col gap-3">
        {d.instalments.map((p) => (
          <li key={p.plan} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <DrillLink filter={{ plan: p.plan }} className="min-w-0 truncate font-medium">{p.name}</DrillLink>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{p.paidCount}/{p.count ?? "–"}</span>
            </div>
            <Bar value={p.paidCount} max={p.count ?? 0} label={p.name} />
            <p className="text-xs text-muted-foreground">
              {t("cards.perMonthPay")} <Money amount={p.perPayment} mode="short" />
              {p.leftAmount !== null && <> · {t("cards.left")} <Money amount={p.leftAmount} mode="short" /></>}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Lifecycle({ d }: { d: Detail }) {
  const { t, lang } = useI18n();
  const r = d.record;
  if (!r) {
    return (
      <Panel title={t("cards.lifecycle")}>
        <p className="text-sm text-muted-foreground">{t("cards.noRecord")}</p>
        <AskAI prompt={t("ask.cardRecord", { name: d.account.name })} />
      </Panel>
    );
  }
  const date = (v?: string) => (v ? formatDate(v, lang) : null);
  const rows: [string, string | null][] = [
    [t("cards.issued"), date(r.issued)],
    [t("cards.activated"), date(r.activated)],
    [t("cards.lockedOn"), date(r.locked)],
    [t("cards.cancelledOn"), date(r.cancelled)],
    [t("cards.network"), r.network ? r.network.toUpperCase() : null],
    [t("cards.form"), r.physical ? t(`cards.physical.${r.physical}`) : null],
  ];
  return (
    <Panel title={t("cards.lifecycle")} action={<CardStatusBadge status={r.status ?? "active"} />}>
      <dl className="divide-y">
        {rows.filter(([, v]) => v).map(([k, v]) => <KV key={k} label={k}>{v}</KV>)}
        {r.annual_fee ? <KV label={t("cards.annualFee")}><Money amount={r.annual_fee} /></KV> : null}
        {r.close_fee ? <KV label={t("cards.closeFee")}><Money amount={r.close_fee} /></KV> : null}
        {r.keep_for_limit && <KV label={t("cards.keepForLimit")}>{t("cards.yes")}</KV>}
      </dl>
      {r.cancel_plan && (
        <div className="rounded-md bg-muted/60 p-3 text-sm">
          <p className="font-medium">{t("cards.cancelPlan", { by: r.cancel_plan.by ?? "" })}</p>
          {r.cancel_plan.note && <p className="text-muted-foreground">{r.cancel_plan.note}</p>}
        </div>
      )}
      {r.note && <p className="text-sm text-muted-foreground">{r.note}</p>}
    </Panel>
  );
}

function NetValue({ d }: { d: Detail }) {
  const { t } = useI18n();
  const v = d.value;
  if (!v) return null;
  return (
    <Panel title={t("cards.netValue")}>
      <dl className="divide-y">
        <KV label={t("cards.value.benefits")}><Money amount={v.benefits} /></KV>
        <KV label={t("cards.cashback")}><Money amount={v.cashback} /></KV>
        <KV label={v.feesFrom === "record" ? `${t("cards.value.fees")} (${t("cards.value.estimated")})` : t("cards.value.fees")}><Money amount={-v.fees} /></KV>
        {v.closeFee > 0 && <KV label={t("cards.closeFee")}><Money amount={-v.closeFee} /></KV>}
        <KV label={t("cards.value.sinceIssued")} className="font-medium"><Money amount={v.net} tone="auto" /></KV>
        <KV label={t("cards.value.last12")} className="font-medium"><Money amount={v.last12.net} tone="auto" /></KV>
      </dl>
    </Panel>
  );
}

export default function CardDetail({ params }: { params: { account: string } }) {
  const { t } = useI18n();
  const id = decodeURIComponent(params.account);
  const { data: d, error, isLoading } = useCardDetail(id);
  const [open, setOpen] = useState<string | null>(null);
  const back = (
    <a href="#/cards" className="inline-flex min-h-11 items-center gap-1 self-start rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
      <ArrowLeft className="size-4" aria-hidden />
      {t("cards.back")}
    </a>
  );
  if (error) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <p className="text-sm text-muted-foreground">{error instanceof ApiError && error.status === 404 ? t("cards.notFound") : t("common.error", { message: error.message })}</p>
      </div>
    );
  }
  if (isLoading || !d) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {back}
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const s = d.summary;
  const status = d.record?.status ?? (d.account.closed ? "cancelled" : "active");
  const last4 = d.terms.last4;
  const facts = [d.terms.bank, last4 ? t("cards.last4", { n: last4 }) : null].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-4">
      {back}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{d.account.name}</h1>
          <CardStatusBadge status={status} />
        </div>
        {facts && <p className="text-sm text-muted-foreground">{facts}</p>}
        {s && <UsedBar owed={s.owed} limit={s.limit} atLeast={s.limitAtLeast} className="max-w-md" />}
        {s && <MissingHint card={s} className="max-w-md" />}
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {s ? (
            <>
              <Period d={d} asOf={d.asOf} />
              <LastStatement s={s.last} id={d.account.id} asOf={d.asOf} />
              <History list={d.statements} onOpen={setOpen} />
            </>
          ) : (
            <Panel title={t("cards.statements")}><p className="text-sm text-muted-foreground">{t("cards.noStatements")}</p></Panel>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Cashback d={d} />
          <FeeWaiver d={d} asOf={d.asOf} />
          <Instalments d={d} />
          <Lifecycle d={d} />
          <NetValue d={d} />
        </div>
      </div>
      <StatementSheet account={d.account.id} close={open} onClose={() => setOpen(null)} />
    </div>
  );
}
