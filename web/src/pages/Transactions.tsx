import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Money } from "@/components/Money";
import { TxDock, TxPanel } from "@/components/TxPanel";
import { TxRow } from "@/components/TxRow";
import { categoryGroups } from "@/components/cards/CategoryPicker";
import { useAccountGroups } from "@/components/transactions/useAccountGroups";
import { Combobox, type ComboGroup } from "@/components/transactions/Combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n";
import { addDaysIso, shiftMonth } from "@/lib/dates";
import { monthRange } from "@/lib/drill";
import { formatDate } from "@/lib/format";
import { navigate } from "@/lib/hash";
import { useMe, useMeta, useTransactions } from "@/lib/queries";
import { namesFrom, viewTx } from "@/lib/tx";
import type { Tx } from "@/lib/types";
import { cn } from "@/lib/utils";

const KEYS = ["from", "to", "account", "category", "text", "who", "event", "tag", "tx", "plan", "within", "all"] as const;
type Key = (typeof KEYS)[number];
type Filter = Partial<Record<Key, string>>;
const FILTER_KEYS = ["account", "category", "text", "who", "event", "tag", "tx", "plan"] as const;

type PeriodId = "this-month" | "last-month" | "3-months" | "this-year" | "all" | "custom";

function periodRange(id: Exclude<PeriodId, "all" | "custom">, today: string): { from: string; to: string } {
  const ym = today.slice(0, 7);
  switch (id) {
    case "this-month":
      return monthRange(ym);
    case "last-month":
      return monthRange(shiftMonth(ym, -1));
    case "3-months":
      return { from: `${shiftMonth(ym, -2)}-01`, to: monthRange(ym).to };
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  }
}

function parseFilter(search: string): Filter {
  const p = new URLSearchParams(search);
  const f: Filter = {};
  for (const k of KEYS) {
    const v = p.get(k);
    if (v) f[k] = v;
  }
  return f;
}

const toQuery = (f: Filter) => {
  const p = new URLSearchParams();
  for (const k of KEYS) if (f[k]) p.set(k, f[k]!);
  return p.toString();
};

export default function Transactions() {
  const { t, lang } = useI18n();
  const search = useSearch();
  const me = useMe().data;
  const meta = useMeta().data;
  const names = useMemo(() => namesFrom(meta), [meta]);
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const pool = me?.pool;
  const poolName = pool?.name ?? t("pool.name");

  const url = useMemo(() => parseFilter(search), [search]);
  // A bare #/transactions means this month; a filter from a drill-down without dates means all time.
  const bare = !search;
  const effective: Filter = useMemo(() => {
    if (url.all) return { ...url, from: undefined, to: undefined };
    if (bare) return { ...periodRange("this-month", today) };
    return url;
  }, [url, bare, today]);

  const setFilter = useCallback(
    (patch: Filter, replace = false) => {
      const next: Filter = { ...(bare ? effective : url), ...patch };
      for (const k of KEYS) if (next[k] === undefined || next[k] === "") delete next[k];
      if (patch.from !== undefined || patch.to !== undefined) delete next.all;
      navigate(`/transactions${toQuery(next) ? `?${toQuery(next)}` : ""}`, { replace });
    },
    [bare, effective, url],
  );

  // search as you type, 300 ms
  const [text, setText] = useState(url.text ?? "");
  useEffect(() => setText(url.text ?? ""), [url.text]);
  useEffect(() => {
    if (text === (url.text ?? "")) return;
    const id = setTimeout(() => setFilter({ text: text.trim() || undefined }, true), 300);
    return () => clearTimeout(id);
  }, [text, url.text, setFilter]);

  const apiFilter = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    for (const k of KEYS) if (k !== "all") f[k] = effective[k];
    return f;
  }, [effective]);
  const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, error, refetch } = useTransactions(apiFilter);
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const totals = data?.pages[0]?.totals;
  const single = effective.account && effective.account !== "pool" && !effective.account.includes(",") ? effective.account : undefined;

  const [openId, setOpenId] = useState<string | null>(null);
  // a link to one transaction (?tx=) opens its panel straight away
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (url.tx && items.length === 1 && autoOpened.current !== url.tx) {
      autoOpened.current = url.tx;
      setOpenId(items[0]!.id);
    }
  }, [url.tx, items]);
  const open: Tx | null = items.find((i) => i.id === openId) ?? null;
  const wide = useMediaQuery("(min-width: 1280px)");

  // ---- period chips
  const periodId: PeriodId = useMemo(() => {
    if (!effective.from && !effective.to) return "all";
    for (const id of ["this-month", "last-month", "3-months", "this-year"] as const) {
      const r = periodRange(id, today);
      if (r.from === effective.from && r.to === effective.to) return id;
    }
    return "custom";
  }, [effective.from, effective.to, today]);
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || periodId === "custom";
  const choose = (id: PeriodId) => {
    if (id === "all") return setFilter({ from: undefined, to: undefined, all: "1" });
    if (id === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setFilter(periodRange(id, today));
  };
  const chips: { id: PeriodId; label: string }[] = [
    { id: "this-month", label: t("period.thisMonth") },
    { id: "last-month", label: t("period.lastMonth") },
    { id: "3-months", label: t("period.3months") },
    { id: "this-year", label: t("period.thisYear") },
    { id: "all", label: t("period.all") },
    { id: "custom", label: t("period.custom") },
  ];

  // ---- account and category options
  const accountGroups = useAccountGroups();
  const catGroups: ComboGroup[] = useMemo(() => categoryGroups(meta), [meta]);

  // ---- active filter chips
  const active: { key: Key; label: string }[] = [];
  if (effective.account) active.push({ key: "account", label: effective.account === "pool" ? poolName : effective.account.split(",").map((a) => names.account(a)).join(", ") });
  if (effective.category) active.push({ key: "category", label: names.categoryPath(effective.category) });
  if (effective.text) active.push({ key: "text", label: `“${effective.text}”` });
  if (effective.who) active.push({ key: "who", label: t("chip.who", { v: effective.who }) });
  if (effective.event) active.push({ key: "event", label: t("chip.event", { v: effective.event }) });
  if (effective.tag) active.push({ key: "tag", label: `#${effective.tag}` });
  if (effective.plan) active.push({ key: "plan", label: t("chip.plan", { v: effective.plan }) });
  if (effective.tx) active.push({ key: "tx", label: t("chip.tx") });
  const canWithin = Boolean(pool?.on) && (!effective.account || effective.account === "pool");

  // ---- day groups
  const groups = useMemo(() => {
    const out: { date: string; items: Tx[]; net: number }[] = [];
    for (const tx of items) {
      let g = out[out.length - 1];
      if (!g || g.date !== tx.date) {
        g = { date: tx.date, items: [], net: 0 };
        out.push(g);
      }
      g.items.push(tx);
      const v = viewTx(tx, names, single);
      if (!tx.void && (single || v.kind !== "transfer")) g.net += v.amount;
    }
    return out;
  }, [items, names, single]);

  const dayLabel = (d: string) => {
    // dd/mm in both languages (vi-VN alone formats a day and month as "21-11")
    const dm = lang === "vi" ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : formatDate(d, lang, { day: "2-digit", month: "2-digit" });
    if (d === today) return `${t("tx.today")}, ${dm}`;
    if (d === addDaysIso(today, -1)) return `${t("tx.yesterday")}, ${dm}`;
    const s = formatDate(d, lang, { weekday: "long", day: "2-digit", month: "2-digit", ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
    return s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);
  };

  const hasFilters = active.length > 0 || periodId !== "this-month";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("transactions.title")}</h1>
        {totals ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span>{t("tx.in")} <Money amount={totals.income} tone="in" mode="short" className="font-medium" /></span>
            {" · "}
            <span>{t("tx.out")} <Money amount={totals.expense} mode="short" className="font-medium text-foreground" /></span>
            {" · "}
            <span>{t("tx.net")} <Money amount={totals.net} tone="auto" mode="short" className="font-medium" /></span>
            {" · "}
            <span>{t("tx.count", { n: totals.count })}</span>
          </p>
        ) : (
          <Skeleton className="h-5 w-72" />
        )}
      </header>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("filter.searchPlaceholder")} aria-label={t("filter.searchLabel")} className="h-11 pl-9 md:h-9" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label={t("period.label")}>
          {chips.map((c) => (
            <Button key={c.id} type="button" size="sm" variant={periodId === c.id ? "default" : "outline"} aria-pressed={periodId === c.id} className="min-h-11 shrink-0 rounded-full px-3 md:min-h-8" onClick={() => choose(c.id)}>
              {c.label}
            </Button>
          ))}
        </div>
        {showCustom && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("period.from")}</span>
              <Input type="date" value={effective.from ?? ""} max={effective.to || undefined} onChange={(e) => setFilter({ from: e.target.value || undefined })} className="h-11 w-auto md:h-9" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("period.to")}</span>
              <Input type="date" value={effective.to ?? ""} min={effective.from || undefined} onChange={(e) => setFilter({ to: e.target.value || undefined })} className="h-11 w-auto md:h-9" />
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Combobox label={t("filter.account")} groups={accountGroups} value={effective.account} onSelect={(v) => setFilter({ account: v })} className="w-full sm:w-52" />
          <Combobox label={t("filter.category")} groups={catGroups} value={effective.category} onSelect={(v) => setFilter({ category: v })} className="w-full sm:w-52" />
        </div>
        {(active.length > 0 || canWithin) && (
          <div className="flex flex-wrap items-center gap-2">
            {active.map((a) => (
              <span key={a.key} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-secondary pl-3 text-sm text-secondary-foreground md:min-h-8">
                <span className="max-w-56 truncate">{a.label}</span>
                <button type="button" aria-label={t("filter.remove", { name: a.label })} className="flex size-11 items-center justify-center rounded-full outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8" onClick={() => setFilter({ [a.key]: undefined, ...(a.key === "tx" ? { from: undefined, to: undefined } : {}) })}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {canWithin && (
              <Button type="button" size="sm" variant={effective.within === "1" ? "default" : "outline"} aria-pressed={effective.within === "1"} className="min-h-11 rounded-full md:min-h-8" onClick={() => setFilter({ within: effective.within === "1" ? undefined : "1" })}>
                {t("filter.within", { name: poolName })}
              </Button>
            )}
          </div>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p>{t("common.error", { message: error.message })}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void refetch()}>{t("common.retry")}</Button>
        </div>
      ) : isLoading || !meta ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <p>{hasFilters ? t("tx.emptyFiltered") : t("tx.empty")}</p>
          {hasFilters && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => navigate("/transactions?all=1")}>{t("filter.clear")}</Button>
          )}
        </div>
      ) : (
        <div className={cn(wide && open && "grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6")}>
        <div className={cn("flex flex-col", isFetching && !isFetchingNextPage && "opacity-70")}>
          {single && <p className="px-2 pb-1 text-right text-xs text-muted-foreground">{t("tx.balanceCol")}</p>}
          {groups.map((g) => (
            <section key={g.date} aria-label={dayLabel(g.date)}>
              <h2 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b bg-background/95 px-2 py-2 text-sm font-medium backdrop-blur">
                <span>{dayLabel(g.date)}</span>
                <Money amount={g.net} mode="short" tone={g.net > 0 ? "in" : "none"} plus className="text-sm" />
              </h2>
              <ul>
                {g.items.map((tx) => (
                  <li key={tx.id}>
                    <TxRow tx={tx} names={names} account={single} showBalance={Boolean(single)} balance={tx.balance} selected={tx.id === openId} onOpen={() => setOpenId(tx.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {hasNextPage && (
            <Button type="button" variant="outline" className="mt-4 min-h-11 self-center" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              {isFetchingNextPage ? t("common.loading") : t("tx.loadMore")}
            </Button>
          )}
        </div>
        {wide && open && <TxDock tx={open} names={names} account={single} onClose={() => setOpenId(null)} />}
        </div>
      )}

      {!wide && <TxPanel tx={open} names={names} account={single} onClose={() => setOpenId(null)} />}
    </div>
  );
}
