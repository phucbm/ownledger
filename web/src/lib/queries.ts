import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, type Me, type Meta } from "./api";
import type { AccountRow, BestCard, CardDetail, CardStatus, CardsModule, DepositStatus, Grant, HomeData, MonthReport, PlansResponse, Series, SeriesQuery, StatementDetail, TxResult, Usual } from "./types";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("me") });
export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("meta"), staleTime: 5 * 60_000 });

/** One request shared by every home widget. */
export const useHome = () => useQuery({ queryKey: ["home"], queryFn: () => api<HomeData>("home") });

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  return p.toString();
};

/**
 * A chart's series. The account filter "pool" means every account in "My money"; /api/series does not expand it
 * (the other endpoints do), so it is expanded here from `me.pool`.
 */
export const useSeries = (q: SeriesQuery, enabled = true) => {
  const pool = useMe().data?.pool?.accounts;
  const sent: SeriesQuery = q.account === "pool" && pool?.length ? { ...q, account: pool } : q;
  return useQuery({ queryKey: ["series", sent], queryFn: () => api<Series>(`series?${qs({ ...sent })}`), enabled });
};
export const useUsual = (period: string, by = "top") =>
  useQuery({ queryKey: ["usual", period, by], queryFn: () => api<Usual>(`report?${qs({ by, period, usual: 6 })}`) });
export const useMonthReport = (from: string, to: string) =>
  useQuery({ queryKey: ["report-month", from, to], queryFn: () => api<MonthReport>(`report?${qs({ by: "month", from, to })}`) });
export const usePlansDue = (days = 30) => useQuery({ queryKey: ["plans", days], queryFn: () => api<PlansResponse>(`plans?days=${days}`) });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api<AccountRow[]>("accounts") });
export const useGrants = () => useQuery({ queryKey: ["grants"], queryFn: () => api<Grant[]>("grants") });
export const useImportMappings = () => useQuery({ queryKey: ["import-mappings"], queryFn: () => api<string[]>("import/mappings") });

/** This period against your usual, for an exact date range. */
export const useUsualRange = (from: string, to: string, by: string, kind: "expense" | "income") =>
  useQuery({ queryKey: ["usual-range", from, to, by, kind], queryFn: () => api<Usual>(`report?${qs({ by, from, to, kind, usual: 6 })}`) });

// ---- Cards module: answers 404 when the ledger has no cards, so callers pass `enabled` (features.cards).
export const useCardsModule = (enabled = true, closed = false) =>
  useQuery({ queryKey: ["cards-module", closed], queryFn: () => api<CardsModule>(`m/cards${closed ? "?closed=1" : ""}`), enabled });
export const useCardDetail = (account: string) => useQuery({ queryKey: ["card", account], queryFn: () => api<CardDetail>(`m/cards/${encodeURIComponent(account)}`) });
export const useStatementDetail = (account: string, close: string | null) =>
  useQuery({ queryKey: ["card-statement", account, close], queryFn: () => api<StatementDetail>(`m/cards/${encodeURIComponent(account)}/statement?close=${close}`), enabled: close !== null });
/** Ranked cards for a category; loads only when `enabled` (e.g. a row was expanded). */
export const useBestCard = (category: string | undefined, enabled = true, amount?: number) =>
  useQuery({ queryKey: ["best-card", category, amount ?? null], queryFn: () => api<BestCard[]>(`m/cards/best?${qs({ category, amount })}`), enabled: enabled && Boolean(category), staleTime: 60_000 });
export const useCards = (enabled = true) => useQuery({ queryKey: ["cards"], queryFn: () => api<CardStatus[]>("cards"), enabled });
export const useDeposits = (enabled = true) => useQuery({ queryKey: ["deposits"], queryFn: () => api<DepositStatus[]>("deposits"), enabled });

export const PAGE = 50;

/** Transactions for a filter (the URL's query string), loaded page by page with `offset`. */
export const useTransactions = (filter: Record<string, string | undefined>, limit = PAGE) =>
  useInfiniteQuery({
    queryKey: ["transactions", filter, limit],
    queryFn: ({ pageParam }) => api<TxResult>(`transactions?${qs({ ...filter, offset: pageParam, limit })}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const n = all.reduce((s, p) => s + p.items.length, 0);
      return n < last.total ? n : undefined;
    },
    placeholderData: keepPreviousData,
  });
