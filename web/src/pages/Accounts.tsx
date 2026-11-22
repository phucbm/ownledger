import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AskAI } from "@/components/AskAI";
import { Money } from "@/components/Money";
import { DaysLeft, UsedBar } from "@/components/cards/bits";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  color?: string;
}

const abs = (a: AccountRow) => Math.abs(a.value);

function Badge({ children, tone }: { children: ReactNode; tone?: "warn" }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", tone === "warn" ? "bg-warning/10 text-warning" : "bg-secondary text-secondary-foreground")}>{children}</span>;
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
        <Money amount={a.value} mode="short" className="shrink-0 text-sm font-medium" />
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
  const [poolInactive, setPoolInactive] = useState(false);

  const typeLabel = (ty: string) => meta?.types[ty]?.[lang] ?? ty;
  const isHoldings = (ty: string) => Boolean(meta?.types[ty]?.holdings);
  const cardOf = useMemo(() => new Map((cardsData?.cards ?? []).map((c) => [c.account, c])), [cardsData]);
  const depositOf = useMemo(() => new Map((deposits ?? []).map((d) => [d.account, d])), [deposits]);

  const model = useMemo(() => {
    const all = accounts ?? [];
    const isLiabilityType = (a: AccountRow) => Boolean(meta?.types[a.type]?.liability);
    const liability = (a: AccountRow) => (isLiabilityType(a) || a.value < 0) && a.value < 0;
    let assets = 0;
    let liabilities = 0;
    let unpriced = 0;
    for (const a of all) {
      if (a.value === 0 && !a.qty) continue;
      if (liability(a)) liabilities += a.value;
      else assets += a.value;
      if (!a.priced) unpriced++;
    }
    const inactive = (a: AccountRow) => a.value === 0 && !a.qty && (a.lastActivity === null || daysBetween(a.lastActivity, today) > INACTIVE_DAYS);
    const closed = all.filter((a) => a.closed);
    const open = all.filter((a) => !a.closed);
    const pooled = pool?.on ? open.filter((a) => a.pool) : [];
    const rest = open.filter((a) => !pooled.includes(a));
    const inactiveRest = rest.filter(inactive);
    const live = rest.filter((a) => !inactive(a));
    // Debt tab: what you owe (credit cards, loans) and any account below zero. Soonest card due first, then biggest.
    const debt = live.filter((a) => isLiabilityType(a) || a.value < 0);
    const due = (a: AccountRow) => cardOf.get(a.id)?.daysToDue ?? Number.POSITIVE_INFINITY;
    debt.sort((x, y) => due(x) - due(y) || x.value - y.value);
    const groups = new Map<string, Group>();
    for (const a of live.filter((x) => !debt.includes(x))) {
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
    // The bar and the group dots share colours: the five biggest groups get a hue each, the rest are grey ("Other").
    list.forEach((g, i) => (g.color = g.value > 0 && i < SEGMENT_COLORS.length ? SEGMENT_COLORS[i] : "var(--chart-muted)"));
    const assetCount = list.reduce((n, g) => n + (g.pool ? pooled.length : g.items.length), 0);
    return { assets, liabilities, net: assets + liabilities, groups: list, debt, poolIdle, poolCount: pooled.length, assetCount, inactiveRest: inactiveRest.sort((x, y) => x.name.localeCompare(y.name)), closed: closed.sort((x, y) => (y.closed ?? "").localeCompare(x.closed ?? "")), unpriced, any: all.length > 0 };
  }, [accounts, meta, pool?.on, poolName, today, lang, cardOf]);

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
  const positive = model.groups.filter((g) => g.value > 0);
  const barTotal = positive.reduce((s, g) => s + g.value, 0);
  const share = (v: number) => (barTotal > 0 && v > 0 ? `${formatNumber((v / barTotal) * 100, lang)}%` : "");
  const idleCount = model.inactiveRest.length + model.closed.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("accounts.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("accounts.netWorth")}</p>
        <Money amount={model.net} className="text-3xl font-semibold tracking-tight md:text-4xl" />
        <p className="text-sm text-muted-foreground">
          {t("accounts.assets")} <Money amount={model.assets} mode="short" className="font-medium text-foreground" />
          {" · "}
          {t("accounts.liabilities")} <Money amount={model.liabilities} mode="short" className="font-medium text-foreground" />
        </p>
        {model.unpriced > 0 && <p className="text-xs text-muted-foreground">{t("nw.unpriced", { n: model.unpriced })}</p>}
      </header>

      {positive.length > 0 && (
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${t("accounts.byType")}: ${positive.map((g) => `${g.label} ${share(g.value)}`).join(", ")}`}>
          {positive.map((g) => (
            <span key={g.id} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(g.value / barTotal) * 100}%`, background: g.color }} title={`${g.label} ${share(g.value)}`} />
          ))}
        </div>
      )}

      <Tabs defaultValue="assets" className="gap-4">
        <TabsList className="h-10! w-full sm:w-fit">
          <TabsTrigger value="assets" className="px-3">{t("accounts.assets")}<Count n={model.assetCount} /></TabsTrigger>
          {model.debt.length > 0 && <TabsTrigger value="debt" className="px-3">{t("accounts.liabilities")}<Count n={model.debt.length} /></TabsTrigger>}
          {idleCount > 0 && <TabsTrigger value="idle" className="px-3">{t("accounts.tabIdle")}<Count n={idleCount} /></TabsTrigger>}
        </TabsList>

        <TabsContent value="assets">
          <div className="grid items-start gap-3 md:grid-cols-2">
            {model.groups.map((g) => (
              <Collapsible key={g.id} className="group/acc overflow-hidden rounded-xl bg-card ring-1 ring-foreground/[0.07] shadow-[0_1px_2px_oklch(0_0_0/0.04)]">
                <CollapsibleTrigger className="flex min-h-14 w-full items-center gap-3 px-4 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {g.label}
                    <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{g.pool ? model.poolCount : g.items.length}</span>
                  </span>
                  <Money amount={g.value} mode="short" className="shrink-0 text-sm font-semibold" />
                  <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{share(g.value)}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/acc:rotate-180 motion-reduce:transition-none" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t px-2 py-1">
                  {g.pool && (
                    <a href={drillHref({ account: "pool" })} className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                      {t("accounts.poolTx", { name: poolName })}
                      <ChevronRight className="size-4" aria-hidden />
                    </a>
                  )}
                  <ul className="flex flex-col">{g.items.map((a) => line(a))}</ul>
                  {g.pool && model.poolIdle.length > 0 && (
                    <Disclosure open={poolInactive} onToggle={() => setPoolInactive((v) => !v)} label={t("accounts.inactive")} count={model.poolIdle.length}>
                      <ul className="flex flex-col">{model.poolIdle.map((a) => line(a, true))}</ul>
                    </Disclosure>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </TabsContent>

        {model.debt.length > 0 && (
          <TabsContent value="debt">
            <ul className="grid items-start gap-3 md:grid-cols-2">
              {model.debt.map((a) => (
                <li key={a.id} className="list-none rounded-xl bg-card px-2 py-1 ring-1 ring-foreground/[0.07] shadow-[0_1px_2px_oklch(0_0_0/0.04)]">
                  <ul>{line(a)}</ul>
                </li>
              ))}
            </ul>
          </TabsContent>
        )}

        {idleCount > 0 && (
          <TabsContent value="idle" className="flex flex-col gap-5">
            {model.inactiveRest.length > 0 && (
              <section className="flex flex-col gap-1">
                <h2 className="px-2 text-sm font-medium text-muted-foreground">{t("accounts.inactive")} <span className="tabular-nums">{model.inactiveRest.length}</span></h2>
                <ul className="grid gap-x-6 rounded-xl bg-card px-2 py-1 ring-1 ring-foreground/[0.07] md:grid-cols-2">{model.inactiveRest.map((a) => line(a))}</ul>
              </section>
            )}
            {model.closed.length > 0 && (
              <section className="flex flex-col gap-1">
                <h2 className="px-2 text-sm font-medium text-muted-foreground">{t("accounts.closed")} <span className="tabular-nums">{model.closed.length}</span></h2>
                <ul className="grid gap-x-6 rounded-xl bg-card px-2 py-1 ring-1 ring-foreground/[0.07] md:grid-cols-2">{model.closed.map((a) => line(a))}</ul>
              </section>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground tabular-nums group-data-active:bg-secondary">{n}</span>;
}
