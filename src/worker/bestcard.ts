// best_card: which of the owner's cards to use for one purchase. Cards with the owner's own cashback terms
// (details.cashback / data/cards.yaml) are ranked here, nothing sent anywhere. Cards without terms ask OpenWallet,
// when the owner turned it on (an outside source): those cards are looked up each time by their product name
// (details.product, or the account name) and bank, and nothing OpenWallet returns is stored.
import { budgets, cards, fold, type CardStatus, type ISODate, type Ledger } from "../engine/index.js";
import { bestCard as localBestCard, type BestCard as LocalRow } from "../modules/cards/statements.js";
import { recordFor, termsOf } from "../modules/cards/terms.js";
import type { OpenWallet } from "./openwallet.js";

export interface BestCardInput {
  amount?: number;
  /** the owner's category path, e.g. food/groceries: picks the rate from the owner's own terms, and the budget left */
  category?: string;
  /** for OpenWallet: where (Shopee, Co.opmart…) or what kind (groceries, dining…) */
  merchant?: string;
  kind?: string;
  date?: ISODate;
  accounts?: string[];
}

interface Found {
  card: CardStatus;
  ow: { id: string; name: string; url?: string; lastChecked?: string | null };
}

interface NotMatched {
  account: string;
  name: string;
  product: string | null;
  why: string;
  candidates?: { id: string; name: string }[];
}

/** letters and digits only, no accents: "Demo Bank" and "demo-bank" are the same */
const key = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");
const isDebit = (t: unknown) => (Array.isArray(t) ? t.includes("debit") && !t.includes("credit") : t === "debit");

type OwCard = { id: string; name: string; bank: string; type?: unknown; url?: string; lastChecked?: string | null };
/** search results kept in this Worker's memory for an hour (never written anywhere): fewer calls to OpenWallet */
const SEARCH_TTL_MS = 60 * 60 * 1000;
const searchCache = new Map<string, { cards: OwCard[]; until: number }>();
export const clearSearchCache = () => searchCache.clear();

async function findCard(ow: OpenWallet, c: CardStatus): Promise<Found | NotMatched> {
  const product = c.product ?? c.name;
  const miss = (why: string, candidates?: { id: string; name: string }[]): NotMatched => ({
    account: c.account,
    name: c.name,
    product: c.product,
    why,
    ...(candidates?.length ? { candidates } : {}),
  });
  const search = async (q: string) => {
    const k = `${ow.url}|${q}`;
    const hit = searchCache.get(k);
    if (hit && hit.until > Date.now()) return hit.cards;
    const cards = ((await ow.call("search_cards", { q, limit: 10 }))?.cards ?? []) as OwCard[];
    searchCache.set(k, { cards, until: Date.now() + SEARCH_TTL_MS });
    return cards;
  };
  const sameBank = (xs: Awaited<ReturnType<typeof search>>) => {
    if (!c.bank) return xs;
    const b = key(c.bank);
    return xs.filter((x) => key(x.bank) === b || key(x.name).startsWith(b));
  };
  let list = sameBank((await search(product)).filter((x) => !isDebit(x.type)));
  // not found (at that bank): try again with the bank's name in the query
  if (!list.length && c.bank && !fold(product).includes(fold(c.bank))) list = sameBank((await search(`${c.bank} ${product}`)).filter((x) => !isDebit(x.type)));
  const exact = list.filter((x) => fold(x.name) === fold(product));
  const pick = exact.length === 1 ? exact[0] : list.length === 1 ? list[0] : undefined;
  if (pick) return { card: c, ow: { id: pick.id, name: pick.name, url: pick.url, lastChecked: pick.lastChecked ?? null } };
  if (!list.length) return miss(`not found in OpenWallet by "${product}"${c.bank ? ` at ${c.bank}` : ""}${c.product ? "" : " (that is the account name: set details.product to the bank's name for the card)"}`);
  return miss(`several OpenWallet cards match "${product}": set details.product to the exact name`, list.slice(0, 5).map((x) => ({ id: x.id, name: x.name })));
}

async function resolveWhat(ow: OpenWallet, input: BestCardInput): Promise<{ merchant?: string; intent?: string; label: string }> {
  if (input.merchant) {
    const r = await ow.call("find_merchants", { q: input.merchant, limit: 3 });
    const m = r?.merchants?.[0] as { slug: string; name: string } | undefined;
    if (!m) throw new Error(`OpenWallet doesn't know the merchant "${input.merchant}". Give kind instead (e.g. groceries, dining, fuel).`);
    return { merchant: m.slug, label: m.name };
  }
  const kinds = ((await ow.call("list_spending_categories", {}))?.categories ?? []) as { slug: string; label: string }[];
  const k = fold(input.kind!.trim());
  const hit = kinds.find((x) => fold(x.slug) === k || fold(x.label) === k) ?? kinds.find((x) => fold(x.label).includes(k) || fold(x.slug).includes(k));
  if (!hit) throw new Error(`OpenWallet has no spending kind "${input.kind}". Its kinds: ${kinds.map((x) => x.slug).join(", ")}`);
  return { intent: hit.slug, label: hit.label };
}

function budgetFor(l: Ledger, asOf: ISODate, category: string) {
  const all = budgets(l, asOf);
  // the most specific budget that covers the category
  const b = all.filter((x) => category === x.category || category.startsWith(x.category + "/")).sort((a, b) => b.category.length - a.category.length)[0];
  return b ? { category: b.category, every: b.every, amount: b.amount, spent: b.spent, left: b.left } : { category, none: true };
}

/** One card in the answer, whichever source its cashback comes from. */
export interface BestCardRow extends LocalRow {
  /** where the cashback figure comes from: the owner's own terms, OpenWallet, or none known */
  source: "yours" | "openwallet" | "none";
  status?: string;
  spend_so_far?: number;
  cap_used?: number;
  openwallet?: { id: string; name: string; url: string | null; lastChecked: string | null };
}

async function openWalletRows(l: Ledger, asOf: ISODate, ow: OpenWallet, mine: CardStatus[], input: BestCardInput & { amount: number }, date: ISODate) {
  const [what, ...looked] = await Promise.all([resolveWhat(ow, input), ...mine.map((c) => findCard(ow, c))]);
  const found: Found[] = [];
  const notMatched: NotMatched[] = [];
  for (const r of looked) {
    if ("ow" in r) {
      const twin = found.find((f) => f.ow.id === r.ow.id);
      if (twin) notMatched.push({ account: r.card.account, name: r.card.name, product: r.card.product, why: `same OpenWallet card as ${twin.card.account}: ranked once` });
      else found.push(r);
    } else notMatched.push(r);
  }
  const rows = new Map<string, Partial<BestCardRow>>();
  const assumptions: string[] = [];
  let catalog: unknown = null;
  if (found.length) {
    const states = found.map((f) => ({ id: f.ow.id, spend_so_far: Math.max(0, f.card.period.spent - f.card.period.refunds), cap_used: Math.max(0, f.card.period.cashback) }));
    const r = await ow.call("rank_cards_for_spend", {
      purchase: { amount: input.amount, date, ...(what.merchant ? { merchant: what.merchant } : { intent: what.intent }) },
      cards: states,
      limit: 20,
    });
    catalog = r?.meta?.catalog ?? null;
    assumptions.push(
      "OpenWallet cards: spend_so_far and cap_used come from the ledger (what is recorded this statement period); banks often pay cashback after the statement closes, so the bank's cap used can be higher.",
      ...((r?.assumptions ?? []) as string[]).map((a) => `OpenWallet: ${a}`),
    );
    for (const x of (r?.cards ?? []) as any[]) {
      const f = found.find((y) => y.ow.id === x.id)!;
      const st = states.find((y) => y.id === x.id)!;
      rows.set(f.card.account, {
        source: "openwallet",
        earn: x.cashback ?? null,
        rate: typeof x.effective_rate === "number" ? Math.round(x.effective_rate * 10000) / 100 : null,
        capLeft: x.rule?.cap_remaining ?? x.global_cap_remaining ?? null,
        status: x.status,
        spend_so_far: st.spend_so_far,
        cap_used: st.cap_used,
        openwallet: { id: f.ow.id, name: f.ow.name, url: x.url ?? f.ow.url ?? null, lastChecked: x.lastChecked ?? f.ow.lastChecked ?? null },
        reason: `${f.card.name}: OpenWallet (${f.ow.name}) · ${x.reason ?? x.status}`,
      });
    }
  }
  return { rows, notMatched, assumptions, catalog, what: what.label };
}

export async function bestCard(l: Ledger, asOf: ISODate, ow: OpenWallet | null, input: BestCardInput) {
  const date = input.date ?? asOf;
  const amount = input.amount ?? 0;
  let local: LocalRow[] = localBestCard(l, { category: input.category ?? "", amount, date });
  if (input.accounts?.length) {
    const known = new Set(local.map((r) => r.account));
    const unknown = input.accounts.filter((a) => !known.has(a));
    if (unknown.length) throw new Error(`not a card that can be used: ${unknown.join(", ")}`);
    local = local.filter((r) => input.accounts!.includes(r.account));
  }
  if (!local.length) throw new Error("No open card to use (closed, cancelled or locked cards are left out, and cards without enough limit left).");

  const hasTerms = (id: string) => {
    const a = l.accounts.find((x) => x.id === id)!;
    return termsOf(a, recordFor(l, id)).cashback !== null;
  };
  const assumptions: string[] = [];
  if (!input.category) assumptions.push("No category given: cards with your own terms use their base rate.");
  const without = local.filter((r) => !hasTerms(r.account));
  const status = cards(l, date);
  const asking = without.map((r) => status.find((c) => c.account === r.account)).filter((c): c is CardStatus => Boolean(c));
  let fromOw: Awaited<ReturnType<typeof openWalletRows>> | null = null;
  if (ow && asking.length) {
    if (!input.amount) assumptions.push("OpenWallet not asked: give the amount.");
    else if (!input.merchant && !input.kind) assumptions.push("OpenWallet not asked: give a merchant (e.g. Shopee) or a kind (e.g. groceries) for the cards without your own terms.");
    else fromOw = await openWalletRows(l, asOf, ow, asking, { ...input, amount: input.amount }, date);
  }
  if (fromOw) assumptions.push(...fromOw.assumptions);

  const rows: BestCardRow[] = local.map((r) => {
    if (hasTerms(r.account)) return { ...r, source: "yours" as const };
    const o = fromOw?.rows.get(r.account);
    if (o) return { ...r, ...o, source: "openwallet" as const };
    return {
      ...r,
      source: "none" as const,
      earn: null,
      rate: null,
      reason: `${r.name}: no cashback terms set${ow ? " and not found in OpenWallet" : ""}${r.payBy ? ` · pay by ${r.payBy} (${r.freeDays} days)` : ""}`,
    };
  });
  // most cashback first (a minimum still to reach counts half), then interest-free days, then limit left
  const effective = (b: BestCardRow) => (!b.earn ? -1 : b.minSpendShort > 0 ? b.earn / 2 : b.earn);
  rows.sort((x, y) => effective(y) - effective(x) || (y.freeDays ?? -1) - (x.freeDays ?? -1) || (y.limitLeft ?? 0) - (x.limitLeft ?? 0));

  return {
    purchase: { amount: input.amount ?? null, date, category: input.category ?? null, merchant: input.merchant ?? null, kind: input.kind ?? null },
    cards: rows.slice(0, 10),
    ...(fromOw?.notMatched.length ? { not_matched: fromOw.notMatched } : {}),
    ...(input.category ? { budget: budgetFor(l, asOf, input.category) } : {}),
    assumptions,
    ...(fromOw ? { openwallet: { url: ow!.url, catalog: fromOw.catalog, what: fromOw.what } } : {}),
    note: "source says where each cashback figure comes from: yours (your own terms), openwallet (its catalog, quoted with lastChecked or the catalog date), none (unknown, which is not 0).",
  };
}
