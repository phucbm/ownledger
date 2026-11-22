import { addDays, todayIn } from "../../engine/dates.js";
import { planStatus } from "../loans/engine.js";
import type { ModuleApiCtx, ModuleApiResult } from "../api.js";
import { cardList } from "./index.js";
import { bestCard, cardValues, cashback, feeWaiver, interestFreeUntil, lineKind, statements } from "./statements.js";
import { cardsData, recordFor, termsOf } from "./terms.js";
import { flattenCategories } from "../../engine/categories.js";

/** /api/m/cards/… */
export function cardsApi(path: string, c: ModuleApiCtx): ModuleApiResult {
  const L = c.snap.ledger;
  const asOf = c.asOf;
  if (path === "") {
    const list = cardList(L, asOf, { includeClosed: c.q.get("closed") === "1" });
    const week = addDays(asOf, 7);
    const monthEnd = `${asOf.slice(0, 7)}-31`;
    return {
      body: {
        asOf,
        cards: list,
        totals: {
          owed: list.reduce((s, x) => s + Math.max(0, x.owed), 0),
          dueWeek: list.filter((x) => x.toPay > 0 && x.due && x.due <= week).reduce((s, x) => s + x.toPay, 0),
          dueMonth: list.filter((x) => x.toPay > 0 && x.due && x.due <= monthEnd).reduce((s, x) => s + x.toPay, 0),
          limit: list.reduce((s, x) => s + (x.limit ?? 0), 0),
        },
        records: cardsData(L).records,
        values: cardValues(L, asOf),
      },
    };
  }
  if (path === "best") {
    const category = c.q.get("category");
    if (!category) return { body: { error: "category" }, status: 400 };
    return { body: bestCard(L, { category, amount: c.q.get("amount") ? Number(c.q.get("amount")) : undefined, date: c.q.get("on") ?? asOf }) };
  }
  if (path === "values") return { body: cardValues(L, asOf) };
  const [id, sub] = decodeURIComponent(path).split("/");
  const a = L.accounts.find((x) => x.id === id);
  if (!a) return { body: { error: `no account ${id}` }, status: 404 };
  const rec = recordFor(L, a.id);
  if (sub === "statement") {
    const close = c.q.get("close");
    const st = statements(L, a.id, asOf).find((s) => s.close === close);
    if (!st) return { body: { error: "no such statement" }, status: 404 };
    const { map } = flattenCategories(L.categories);
    const txs = L.transactions
      .filter((t) => !t.void && t.date >= st.from && t.date <= st.close && t.lines.some((ln) => ln.account === a.id))
      .map((t) => ({ ...t, kind: lineKind(t, a.id, map)?.kind ?? null }))
      .reverse();
    return { body: { statement: st, transactions: txs } };
  }
  const summary = cardList(L, asOf, { includeClosed: true }).find((x) => x.account === a.id) ?? null;
  const terms = termsOf(a, rec);
  return {
    body: {
      asOf,
      account: a,
      record: rec ?? null,
      terms,
      summary,
      statements: statements(L, a.id, asOf).reverse(),
      cashback: cashback(L, a.id, asOf).reverse().slice(0, 13),
      feeWaiver: feeWaiver(L, a.id, asOf),
      instalments: planStatus(L, asOf).filter((p) => p.kind === "instalment" && p.account === a.id),
      value: cardValues(L, asOf).find((v) => v.account === a.id) ?? null,
      payByToday: interestFreeUntil(terms, asOf),
      today: todayIn(),
    },
  };
}
