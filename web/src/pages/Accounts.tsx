import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AskAI } from "@/components/AskAI";
import { Money } from "@/components/Money";
import { DaysLeft, UsedBar } from "@/components/cards/bits";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cardHref } from "@/lib/cards";
import { daysBetween, dayMonth } from "@/lib/dates";
import { drillHref } from "@/lib/drill";
import { formatDate, formatNumber, formatShort } from "@/lib/format";
import { useAccounts, useCardsModule, useDeposits, useMe, useMeta } from "@/lib/queries";
import type { AccountRow, CardSummary, DepositStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const INACTIVE_DAYS = 90;
const SEGMENT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

interface Group {
  id: string;
  label: string;
  value: number;
  items: AccountRow[];
  pool?: boolean;
}

const abs = (a: AccountRow) => Math.abs(a.value);

function Badge({ children, tone }: { children: ReactNode; tone?: "warn" }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", tone === "warn" ? "bg-amber-100 text-amber-900" : "bg-secondary text-secondary-foreground")}>{children}</span>;
}

/** One account: the whole row opens its transactions (with the running balance); the extras depend on its type. */
function AccountLine({ a, holdings, card, deposit, nested }: { a: AccountRow; holdings: boolean; card?: CardSummary; deposit?: DepositStatus; nested?: boolean }) {
  const { t, lang } = useI18n();
  return (
    <li className={cn("relative flex flex-col gap-1 rounded-md py-1.5 hover:bg-muted/40 focus-within:ring-3 focus-within:ring-ring/50", nested ? "pl-4" : "px-2")}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <a href={drillHref({ account: a.id })} className="truncate rounded-md text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline">{a.name}</a>
          {a.closed && <Badge>{t("accounts.closedOn", { date: formatDate(a.closed, lang) })}</Badge>}
          {holdings && !a.priced && <Badge tone="warn">{t("accounts.noPrice")}</Badge>}
        </span>
        <Money amount={a.value} mode="short" tone={a.value < 0 ? "out" : "none"} className="shrink-0 text-sm font-medium" />
      </div>
      {holdings && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {a.qty !== null && <>{t("accounts.qty", { n: formatNumber(a.qty, lang, 4) })}</>}
          {a.price && <> · {t("accounts.price", { price: formatShort(a.price.price, lang), date: dayMonth(a.price.date) })}</>}
          {" · "}{t("accounts.cost")} <Money amount={a.cost} mode="short" />
        </p>
      )}
      {card && (
        <div className="flex flex-col gap-1">
          <UsedBar owed={card.owed} limit={card.limit} atLeast={card.limitAtLeast} />
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {card.toPay > 0 ? (
              <>
                <span>{t("cards.toPay")} <Money amount={card.toPay} mode="short" className="font-medium text-foreground" /></span>
                {card.due && <span>{dayMonth(card.due)}</span>}
                <DaysLeft days={card.daysToDue} />
              </>
            ) : (
              <span>{t("cards.nothingToPay")}</span>
            )}
            <a href={cardHref(card.account)} className="relative z-10 ml-auto inline-flex min-h-11 items-center rounded-md px-1 underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("accounts.cardPage")}</a>
          </p>
        </div>
      )}
      {deposit && (
        <p className="text-xs text-muted-foreground">
          {deposit.maturity ? `${deposit.daysToMaturity! < 0 ? t("deposits.matured") : t("deposits.inDays", { n: deposit.daysToMaturity! })} · ${dayMonth(deposit.maturity)}` : t("deposits.noMaturity")}
          {deposit.rate !== null && ` · ${formatNumber(deposit.rate, lang, 2)}%`}
          {deposit.interestAtMaturity ? <> · {t("deposits.interest")} <Money amount={deposit.interestAtMaturity} mode="short" /></> : null}
        </p>
      )}
    </li>
  );
}

function Disclosure({ open, onToggle, label, count, children, nested }: { open: boolean; onToggle: () => void; label: string; count: number; children: ReactNode; nested?: boolean }) {
  return (
    <div className={cn("flex flex-col", nested && "pl-4")}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-11 items-center gap-1 rounded-md px-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50">
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        {label} ({count})
      </button>
      {open && children}
    </div>
  );
}

export default function Accounts() {
  const { t, lang } = useI18n();
  const me = useMe().data;
  const meta = useMeta().data;
  const { data: accounts, error, isLoading } = useAccounts();
  const cardsOn = Boolean(me?.features?.cards);
  const cardsData = useCardsModule(cardsOn).data;
  const deposits = useDeposits(Boolean(me?.features?.deposits)).data;
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const pool = me?.pool;
  const poolName = pool?.name ?? t("pool.name");
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolInactive, setPoolInactive] = useState(false);
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [closedOpen, setClosedOpen] = useState(false);

  const typeLabel = (ty: string) => meta?.types[ty]?.[lang] ?? ty;
  const isHoldings = (ty: string) => Boolean(meta?.types[ty]?.holdings);
  const cardOf = useMemo(() => new Map((cardsData?.cards ?? []).map((c) => [c.account, c])), [cardsData]);
  const depositOf = useMemo(() => new Map((deposits ?? []).map((d) => [d.account, d])), [deposits]);

  const model = useMemo(() => {
    const all = accounts ?? [];
    const liability = (a: AccountRow) => (Boolean(meta?.types[a.type]?.liability) || a.value < 0) && a.value < 0;
    let assets = 0;
    let liabilities = 0;
    const byType = new Map<string, number>();
    let unpriced = 0;
    for (const a of all) {
      if (a.value === 0 && !a.qty) continue;
      if (liability(a)) liabilities += a.value;
      else {
        assets += a.value;
        byType.set(a.type, (byType.get(a.type) ?? 0) + a.value);
      }
      if (!a.priced) unpriced++;
    }
    const inactive = (a: AccountRow) => a.value === 0 && !a.qty && (a.lastActivity === null || daysBetween(a.lastActivity, today) > INACTIVE_DAYS);
    const closed = all.filter((a) => a.closed);
    const open = all.filter((a) => !a.closed);
    const pooled = pool?.on ? open.filter((a) => a.pool) : [];
    const rest = open.filter((a) => !pooled.includes(a));
    const inactiveRest = rest.filter(inactive);
    const live = rest.filter((a) => !inactive(a));
    const groups = new Map<string, Group>();
    for (const a of live) {
      const g = groups.get(a.type) ?? { id: a.type, label: typeLabel(a.type), value: 0, items: [] };
      g.items.push(a);
      g.value += a.value;
      groups.set(a.type, g);
    }
    const list = [...groups.values()];
    for (const g of list) g.items.sort((x, y) => abs(y) - abs(x));
    const poolActive = pooled.filter((a) => !inactive(a)).sort((x, y) => abs(y) - abs(x));
    const poolIdle = pooled.filter(inactive);
    if (pooled.length) list.push({ id: "pool", label: poolName, value: pooled.reduce((s, a) => s + a.value, 0), items: poolActive, pool: true });
    list.sort((x, y) => y.value - x.value);
    const segments = [...byType].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    const shown = segments.slice(0, SEGMENT_COLORS.length);
    const rest2 = segments.slice(SEGMENT_COLORS.length).reduce((s, [, v]) => s + v, 0);
    return { assets, liabilities, net: assets + liabilities, groups: list, poolIdle, poolCount: pooled.length, inactiveRest: inactiveRest.sort((x, y) => x.name.localeCompare(y.name)), closed: closed.sort((x, y) => (y.closed ?? "").localeCompare(x.closed ?? "")), segments: shown, other: rest2, unpriced, any: all.length > 0 };
  }, [accounts, meta, pool?.on, poolName, today, lang]);

  if (error) return <p className="text-sm text-muted-foreground">{t("common.error", { message: error.message })}</p>;
  if (isLoading || !accounts || !meta) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!model.any) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("accounts.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("accounts.empty")}</p>
        <AskAI className="self-start" prompt={t("start.s2.prompt")} />
      </div>
    );
  }

  const line = (a: AccountRow, nested?: boolean) => <AccountLine key={a.id} a={a} nested={nested} holdings={isHoldings(a.type)} card={cardOf.get(a.id)} deposit={depositOf.get(a.id)} />;
  const segs = [...model.segments.map(([ty, v], i) => ({ key: ty, label: typeLabel(ty), value: v, color: SEGMENT_COLORS[i]! })), ...(model.other > 0 ? [{ key: "other", label: t("accounts.other"), value: model.other, color: "var(--chart-muted)" }] : [])];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("accounts.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("accounts.netWorth")}</p>
        <Money amount={model.net} className="text-3xl font-semibold tracking-tight" />
        <p className="text-sm text-muted-foreground">
          {t("accounts.assets")} <Money amount={model.assets} mode="short" className="font-medium text-foreground" />
          {" · "}
          {t("accounts.liabilities")} <Money amount={model.liabilities} mode="short" tone={model.liabilities < 0 ? "out" : "none"} className="font-medium" />
        </p>
        {model.unpriced > 0 && <p className="text-xs text-muted-foreground">{t("nw.unpriced", { n: model.unpriced })}</p>}
      </header>

      {segs.length > 0 && (
        <section aria-label={t("accounts.byType")} className="flex flex-col gap-3">
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("accounts.byType")}>
            {segs.map((s) => (
              <span key={s.key} className="h-3 first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / model.assets) * 100}%`, background: s.color }} />
            ))}
          </div>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {segs.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatNumber((s.value / model.assets) * 100, lang)}%</span>
                <Money amount={s.value} mode="short" className="w-16 shrink-0 text-right text-sm" />
              </li>
            ))}
          </ul>
          {model.liabilities < 0 && (
            <p className="flex items-center justify-between gap-2 border-t pt-2 text-sm">
              <span>{t("accounts.liabilities")}</span>
              <Money amount={model.liabilities} tone="out" className="font-medium" />
            </p>
          )}
        </section>
      )}

      {model.groups.map((g) => (
        <section key={g.id} aria-label={g.label} className="flex flex-col">
          <h2 className="flex items-baseline justify-between gap-2 border-b px-2 pb-1.5 text-sm font-semibold">
            <span>{g.label}{!g.pool && <span className="ml-1.5 font-normal text-muted-foreground">({g.items.length})</span>}</span>
            <Money amount={g.value} mode="short" tone={g.value < 0 ? "out" : "none"} />
          </h2>
          {g.pool ? (
            <div className="flex flex-col">
              <div className="relative flex min-h-11 items-center justify-between gap-2 rounded-md px-2 hover:bg-muted/40 focus-within:ring-3 focus-within:ring-ring/50">
                <a href={drillHref({ account: "pool" })} className="truncate rounded-md text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline">{poolName}</a>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-xs text-muted-foreground">{t("accounts.inPool", { n: model.poolCount })}</span>
                  <button type="button" aria-expanded={poolOpen} aria-label={t("accounts.expand", { name: poolName })} onClick={() => setPoolOpen((v) => !v)} className="relative z-10 flex size-11 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                    {poolOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                  </button>
                </span>
              </div>
              {poolOpen && (
                <>
                  <ul className="flex flex-col">{g.items.map((a) => line(a, true))}</ul>
                  {model.poolIdle.length > 0 && (
                    <Disclosure nested open={poolInactive} onToggle={() => setPoolInactive((v) => !v)} label={t("accounts.inactive")} count={model.poolIdle.length}>
                      <ul className="flex flex-col">{model.poolIdle.map((a) => line(a, true))}</ul>
                    </Disclosure>
                  )}
                </>
              )}
            </div>
          ) : (
            <ul className="flex flex-col">{g.items.map((a) => line(a))}</ul>
          )}
        </section>
      ))}

      {model.inactiveRest.length > 0 && (
        <Disclosure open={inactiveOpen} onToggle={() => setInactiveOpen((v) => !v)} label={t("accounts.inactive")} count={model.inactiveRest.length}>
          <ul className="flex flex-col">{model.inactiveRest.map((a) => line(a))}</ul>
        </Disclosure>
      )}
      {model.closed.length > 0 && (
        <Disclosure open={closedOpen} onToggle={() => setClosedOpen((v) => !v)} label={t("accounts.closed")} count={model.closed.length}>
          <ul className="flex flex-col">{model.closed.map((a) => line(a))}</ul>
        </Disclosure>
      )}
    </div>
  );
}
