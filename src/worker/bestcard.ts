// best_card: which of the owner's own cards pays the most cashback for one purchase, through OpenWallet (an outside
// source the owner turns on). The owner's data says nothing about OpenWallet: cards are looked up each time by the
// card's product name (details.product, or the account name) and bank. Nothing OpenWallet returns is stored.
import { budgets, cards, fold, type CardStatus, type ISODate, type Ledger } from "../engine/index.js";
import type { OpenWallet } from "./openwallet.js";

export interface BestCardInput {
  amount: number;
  merchant?: string;
  kind?: string;
  date?: ISODate;
  category?: string;
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

export async function bestCard(l: Ledger, asOf: ISODate, ow: OpenWallet, input: BestCardInput) {
  if (!input.merchant && !input.kind) throw new Error("Say what is bought: merchant (e.g. Shopee, Co.opmart) or kind (e.g. groceries).");
  const date = input.date ?? asOf;
  let mine = cards(l, asOf);
  if (input.accounts?.length) {
    const unknown = input.accounts.filter((a) => !mine.some((c) => c.account === a));
    if (unknown.length) throw new Error(`not an open credit card: ${unknown.join(", ")}`);
    mine = mine.filter((c) => input.accounts!.includes(c.account));
  }
  if (!mine.length) throw new Error("No open credit cards in the ledger.");

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

  const assumptions = [
    "spend_so_far and cap_used come from the ledger: only what is recorded this statement period counts.",
    "cap_used is the cashback booked to the card this period; banks often pay it after the statement closes, so the bank's figure can be higher.",
  ];
  let ranking: unknown[] = [];
  let catalog: unknown = null;
  let purchase: unknown = null;
  if (found.length) {
    const states = found.map((f) => ({ id: f.ow.id, spend_so_far: Math.max(0, f.card.period.spent - f.card.period.refunds), cap_used: Math.max(0, f.card.period.cashback) }));
    const r = await ow.call("rank_cards_for_spend", {
      purchase: { amount: input.amount, date, ...(what.merchant ? { merchant: what.merchant } : { intent: what.intent }) },
      cards: states,
      limit: 20,
    });
    purchase = r?.purchase ?? null;
    catalog = r?.meta?.catalog ?? null;
    assumptions.push(...((r?.assumptions ?? []) as string[]));
    ranking = ((r?.cards ?? []) as any[]).map((x) => {
      const f = found.find((y) => y.ow.id === x.id)!;
      const st = states.find((s) => s.id === x.id)!;
      return {
        rank: x.rank,
        account: f.card.account,
        name: f.card.name,
        cashback: x.cashback,
        effective_rate: x.effective_rate,
        status: x.status,
        reason: x.reason,
        rule: x.rule ? { rate: x.rule.rate ?? null, cap: x.rule.cap ?? null, cap_remaining: x.rule.cap_remaining ?? null, ...(x.rule.intents ? { kinds: x.rule.intents } : {}) } : null,
        global_cap_remaining: x.global_cap_remaining ?? null,
        min_spend: x.min_spend ?? null,
        spend_so_far: st.spend_so_far,
        cap_used: st.cap_used,
        available: f.card.available,
        enough_credit: f.card.available === null ? null : f.card.available >= input.amount,
        toPay: f.card.toPay,
        dueDate: f.card.dueDate,
        openwallet: { id: f.ow.id, name: f.ow.name, url: x.url ?? f.ow.url ?? null, lastChecked: x.lastChecked ?? f.ow.lastChecked ?? null },
      };
    });
  }
  return {
    purchase: purchase ?? { amount: input.amount, date, merchant: what.merchant ?? null, intent: what.intent ?? null },
    what: what.label,
    ranking,
    ...(notMatched.length ? { not_matched: notMatched } : {}),
    ...(input.category ? { budget: budgetFor(l, asOf, input.category) } : {}),
    assumptions,
    source: { name: "OpenWallet", url: ow.url, catalog },
    note: found.length
      ? "Cashback rules are OpenWallet's, quoted with their date (lastChecked, or the catalog date when null: then unverified). Unknown is not 0."
      : "None of the cards could be found in OpenWallet: see not_matched.",
  };
}
