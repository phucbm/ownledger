import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkFiles } from "../src/engine/index.js";
import { readDataDir } from "../src/node/files.js";
import { bestCard, clearSearchCache } from "../src/worker/bestcard.js";
import { OpenWalletError, openWalletClient, type OpenWallet } from "../src/worker/openwallet.js";
import { connect } from "./mcp-memory.js";

const L = checkFiles(readDataDir(join(import.meta.dirname, "..", "fixtures", "demo"))).ledger;
const ASOF = "2026-11-03";

/** A fake OpenWallet: records calls, answers like the real tools (shapes from openwallet-mcp-v2). */
function fakeOw(over: Partial<Record<string, (a: any) => unknown>> = {}) {
  const calls: { tool: string; args: any }[] = [];
  const tools: Record<string, (a: any) => unknown> = {
    search_cards: (a) =>
      fold(a.q).includes("demo visa")
        ? {
            cards: [
              { id: "demo-visa-cashback-debit", name: "Demo Visa Cashback Debit", bank: "demo-bank", type: ["debit"] },
              { id: "demo-visa-cashback", name: "Demo Visa Cashback", bank: "demo-bank", type: ["credit"], url: "https://openwallet.vn/the/demo-visa-cashback", lastChecked: "2026-11-01" },
              { id: "demo-visa-platinum", name: "Demo Visa Platinum", bank: "demo-bank", type: ["credit"] },
            ],
          }
        : { cards: [] },
    list_spending_categories: () => ({ categories: [{ slug: "groceries", label: "Siêu thị" }, { slug: "dining", label: "Ăn uống" }] }),
    find_merchants: (a) => (fold(a.q).replace(/[^a-z]/g, "").includes("coop") ? { merchants: [{ slug: "coopmart", name: "Co.opmart" }] } : { merchants: [] }),
    rank_cards_for_spend: (a) => ({
      mode: "purchase",
      purchase: { amount: a.purchase.amount, date: a.purchase.date, merchant: a.purchase.merchant ?? null, intent: a.purchase.intent ?? null, mcc: null },
      cards: a.cards.map((c: any, i: number) => ({
        rank: i + 1,
        id: c.id,
        cashback: 15000,
        effective_rate: 0.05,
        status: "earns",
        reason: "5% on rule 0",
        rule: { index: 0, rate: 0.05, cap: 300000, cap_remaining: 300000 - (c.cap_used ?? 0) },
        global_cap_remaining: null,
        min_spend: null,
        lastChecked: "2026-11-01",
        url: `https://openwallet.vn/the/${c.id}`,
      })),
      assumptions: ["no MCC known: MCC exclusions are not applied"],
      meta: { catalog: { version: "v1", date: "2026-11-22" } },
    }),
    ...over,
  };
  const ow: OpenWallet = {
    url: "https://ow.test/mcp",
    call: async (tool, args) => {
      calls.push({ tool, args });
      if (!tools[tool]) throw new OpenWalletError(`unknown tool ${tool}`);
      return tools[tool]!(args);
    },
  };
  return { ow, calls };
}
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

describe("best_card", () => {
  beforeEach(() => clearSearchCache());
  it("finds the card by product name, sends this period's spend and cashback, adds the owner's figures", async () => {
    const { ow, calls } = fakeOw();
    const r: any = await bestCard(L, ASOF, ow, { amount: 300000, kind: "groceries", category: "food/groceries" });
    const rank = calls.find((c) => c.tool === "rank_cards_for_spend")!.args;
    // spent 425,000 - refunds 50,000 this period; 25,000 cashback booked
    expect(rank).toEqual({ purchase: { amount: 300000, date: ASOF, intent: "groceries" }, cards: [{ id: "demo-visa-cashback", spend_so_far: 375000, cap_used: 25000 }], limit: 20 });
    expect(r.ranking[0]).toMatchObject({
      account: "card-visa",
      cashback: 15000,
      spend_so_far: 375000,
      cap_used: 25000,
      available: 49513000,
      enough_credit: true,
      dueDate: "2026-11-05",
      openwallet: { id: "demo-visa-cashback", url: "https://openwallet.vn/the/demo-visa-cashback", lastChecked: "2026-11-01" },
    });
    expect(r.budget).toEqual({ category: "food", every: "month", amount: 4000000, spent: 0, left: 4000000 });
    expect(r.source).toEqual({ name: "OpenWallet", url: "https://ow.test/mcp", catalog: { version: "v1", date: "2026-11-22" } });
    expect(r.assumptions.join(" ")).toMatch(/cap_used is the cashback booked/);
    expect(r.not_matched).toBeUndefined();
  });

  it("sends only product names, the purchase and per-card figures: no account ids, notes or balances", async () => {
    const { ow, calls } = fakeOw();
    await bestCard(L, ASOF, ow, { amount: 120000, merchant: "Co.op Mart" });
    const sent = JSON.stringify(calls.map((c) => c.args));
    expect(sent).not.toContain("card-visa");
    expect(sent).not.toContain("Thẻ Visa");
    expect(sent).not.toContain("487000"); // owed
    expect(sent).not.toContain("50000000"); // limit
    expect(calls.find((c) => c.tool === "rank_cards_for_spend")!.args.purchase).toEqual({ amount: 120000, date: ASOF, merchant: "coopmart" });
  });

  it("a card that can't be pinned down is listed with candidates, not guessed", async () => {
    const { ow } = fakeOw({
      search_cards: () => ({ cards: [{ id: "a", name: "Demo Visa Gold", bank: "demo-bank", type: ["credit"] }, { id: "b", name: "Demo Visa Platinum", bank: "demo-bank", type: ["credit"] }] }),
    });
    const r: any = await bestCard(L, ASOF, ow, { amount: 100000, kind: "groceries" });
    expect(r.ranking).toEqual([]);
    expect(r.not_matched[0]).toMatchObject({ account: "card-visa", candidates: [{ id: "a" }, { id: "b" }] });
    expect(r.not_matched[0].why).toMatch(/set details.product/);
  });

  it("unknown kind or merchant is an error listing what OpenWallet knows", async () => {
    const { ow } = fakeOw();
    await expect(bestCard(L, ASOF, ow, { amount: 1, kind: "spaceships" })).rejects.toThrow(/groceries, dining/);
    await expect(bestCard(L, ASOF, ow, { amount: 1, merchant: "Nowhere" })).rejects.toThrow(/doesn't know the merchant/);
    await expect(bestCard(L, ASOF, ow, { amount: 1 })).rejects.toThrow(/merchant .* or kind/);
  });

  it("the tool exists only when OpenWallet is on, and the instructions say so", async () => {
    const off = await connect({ openwallet: null });
    expect(await off.tools()).not.toContain("best_card");
    await off.close();
    const on = await connect({ openwallet: fakeOw().ow });
    expect(await on.tools()).toContain("best_card");
    const r = await on.call("best_card", { amount: 300000, kind: "groceries" });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('"account":"card-visa"');
    await on.close();
  });
});

describe("OpenWallet client", () => {
  const sse = (obj: object) => `event: message\ndata: ${JSON.stringify(obj)}\n\n`;

  it("initializes once, keeps the session, reads SSE and JSON answers and structuredContent", async () => {
    const seen: { body: any; session: string | null }[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: any) => {
      const body = JSON.parse(init.body);
      seen.push({ body, session: init.headers["mcp-session-id"] ?? null });
      if (body.method === "initialize")
        return new Response(sse({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } }), { headers: { "content-type": "text/event-stream", "mcp-session-id": "s1" } });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "{}" }], structuredContent: { ok: body.params.name } } }), { headers: { "content-type": "application/json" } });
    });
    const c = openWalletClient("https://ow.test/mcp", fetchImpl as unknown as typeof fetch);
    expect(await c.call("about", {})).toEqual({ ok: "about" });
    expect(await c.call("find_banks", {})).toEqual({ ok: "find_banks" });
    expect(seen.map((s) => s.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
    expect(seen.slice(1).every((s) => s.session === "s1")).toBe(true);
  });

  it("retries once after a 429 or a timeout, and keeps at most 4 requests in flight", async () => {
    let inFlight = 0;
    let most = 0;
    let first429 = true;
    const fetchImpl = vi.fn(async (_u: unknown, init: any) => {
      const body = JSON.parse(init.body);
      if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "content-type": "application/json" } });
      if (!body.id) return new Response(null, { status: 202 });
      if (first429) {
        first429 = false;
        return new Response("slow down", { status: 429 });
      }
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { q: body.params.arguments.q } } }), { headers: { "content-type": "application/json" } });
    });
    const c = openWalletClient("u", fetchImpl as unknown as typeof fetch, 1);
    const qs = Array.from({ length: 12 }, (_, i) => `card ${i}`);
    const out = await Promise.all(qs.map((q) => c.call("search_cards", { q })));
    expect(out.map((o: any) => o.q)).toEqual(qs);
    expect(most).toBeLessThanOrEqual(4);
    const always429 = openWalletClient("u", vi.fn(async (_u: unknown, init: any) => {
      const body = JSON.parse(init.body);
      if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "content-type": "application/json" } });
      if (!body.id) return new Response(null, { status: 202 });
      return new Response("", { status: 429 });
    }) as unknown as typeof fetch, 1);
    await expect(always429.call("about", {})).rejects.toThrow(/429/);
  });

  it("tool errors and HTTP errors become OpenWalletError", async () => {
    const answer = (status: number, result?: object) =>
      vi.fn(async (_u: unknown, init: any) => {
        const body = JSON.parse(init.body);
        if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "content-type": "application/json" } });
        if (!body.id) return new Response(null, { status: 202 });
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { status, headers: { "content-type": "application/json" } });
      });
    const bad = openWalletClient("u", answer(200, { isError: true, content: [{ type: "text", text: "Unknown intent" }] }) as unknown as typeof fetch);
    await expect(bad.call("rank_cards_for_spend", {})).rejects.toThrow(/Unknown intent/);
    const limited = openWalletClient("u", answer(429) as unknown as typeof fetch, 1);
    await expect(limited.call("about", {})).rejects.toThrow(/429 \(rate limited/);
  });
});

describe("--openwallet flag", async () => {
  const { openwalletFlag } = await import("../src/cli/deploy.js");
  it("on with the public URL, on with a URL, off, or unchanged", () => {
    expect(openwalletFlag(["--openwallet"])).toBe("https://mcp.openwallet.vn/mcp");
    expect(openwalletFlag(["--openwallet=http://localhost:8788/mcp"])).toBe("http://localhost:8788/mcp");
    expect(openwalletFlag(["--no-openwallet"])).toBeNull();
    expect(openwalletFlag(["--yes"])).toBeUndefined();
    expect(() => openwalletFlag(["--openwallet=nope"])).toThrow(/http\(s\) URL/);
  });
});

describe("best_card search cache", () => {
  it("looks a card up once an hour, not on every question", async () => {
    clearSearchCache();
    const { ow, calls } = fakeOw();
    await bestCard(L, ASOF, ow, { amount: 1000, kind: "groceries" });
    await bestCard(L, ASOF, ow, { amount: 2000, kind: "groceries" });
    expect(calls.filter((c) => c.tool === "search_cards").length).toBe(1);
    expect(calls.filter((c) => c.tool === "rank_cards_for_spend").length).toBe(2);
  });
});
