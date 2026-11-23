import { addDays, todayIn } from "../../engine/dates.js";
import { planStatus } from "../loans/engine.js";
import type { ModuleApiCtx, ModuleApiResult } from "../api.js";
import { cardList } from "./index.js";
import { bestCard, cardValues, cashback, feeWaiver, interestFreeUntil, lineKind, statements } from "./statements.js";
import { cardsData, recordFor, termsOf } from "./terms.js";
import { flattenCategories } from "../../engine/categories.js";
import { statementPdf } from "./files.js";

/** GET /api/m/cards/statement-pdf?account=<id>&close=<YYYY-MM-DD>: the bank's PDF for one closed statement, streamed. */
async function statementPdfResponse(c: ModuleApiCtx): Promise<ModuleApiResult> {
  const L = c.snap.ledger;
  const id = c.q.get("account") ?? "";
  const close = c.q.get("close") ?? "";
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(close)) return { body: { error: "account and close (YYYY-MM-DD)" }, status: 400 };
  const a = L.accounts.find((x) => x.id === id && x.type === "credit_card");
  if (!a) return { body: { error: `no card ${id}` }, status: 404 };
  // the path is built from the ledger's own card and close date, never taken from the request
  const st = statements(L, a.id, c.asOf).find((s) => !s.open && s.close === close);
  const path = st ? statementPdf(c.snap.files, a.id, st.close) : null;
  if (!path) return { body: { error: "no statement PDF" }, status: 404 };
  const blob = await c.src.blob(c.snap.sha, path);
  if (!blob?.body) return { body: { error: "no statement PDF" }, status: 404 };
  return {
    response: new Response(blob.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${a.id}-${close.slice(0, 7)}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }),
  };
}

/** /api/m/cards/… */
export function cardsApi(path: string, c: ModuleApiCtx): ModuleApiResult | Promise<ModuleApiResult> {
  if (path === "statement-pdf") return statementPdfResponse(c);
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
    return { body: { statement: { ...st, pdf: !st.open && !!statementPdf(c.snap.files, a.id, st.close) }, transactions: txs } };
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
      statements: statements(L, a.id, asOf).reverse().map((s) => ({ ...s, pdf: !s.open && !!statementPdf(c.snap.files, a.id, s.close) })),
      cashback: cashback(L, a.id, asOf).reverse().slice(0, 13),
      feeWaiver: feeWaiver(L, a.id, asOf),
      instalments: planStatus(L, asOf).filter((p) => p.kind === "instalment" && p.account === a.id),
      value: cardValues(L, asOf).find((v) => v.account === a.id) ?? null,
      payByToday: interestFreeUntil(terms, asOf),
      today: todayIn(),
    },
  };
}
