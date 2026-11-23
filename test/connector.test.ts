import { createHash } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import type { FileMap } from "../src/engine/load.js";
import { api } from "../src/worker/api.js";
import type { Env } from "../src/worker/env.js";
import { buildServer } from "../src/worker/mcp.js";
import type { DataSource } from "../src/worker/store.js";

const base: FileMap = {
  "data/meta.yaml": "format: 1\nbase: VND\n",
  "data/accounts.yaml": "- {id: cash, name: Cash, type: cash}\n- {id: momo, name: MoMo, type: ewallet}\n- {id: card, name: Card, type: credit_card, details: {statement_day: 5, due_day: 25}}\n",
  "data/categories.yaml": "income: [{id: salary, name: Salary}]\nexpense: [{id: food, name: Food, children: [{id: cafe, name: Cafe}]}, {id: other, name: Other}]\n",
  "data/ledger/2026/10.jsonl": [
    { id: "a1", date: "2026-10-03", note: "coffee", lines: [{ account: "cash", amount: -50000 }, { category: "food/cafe", amount: 50000 }] },
    { id: "a2", date: "2026-10-20", note: "lunch", lines: [{ account: "card", amount: -120000 }, { category: "food", amount: 120000 }] },
  ].map((t) => JSON.stringify(t)).join("\n") + "\n",
  "data/dashboards/someone-else.yaml": "version: 1\nwidgets:\n  - { id: x, type: pace, x: 0, y: 0, w: 6, h: 4 }\n",
};

function world(files: FileMap = { ...base }, blobs: Record<string, Uint8Array> = {}, envOver: Partial<Env> = {}) {
  const state = { files: { ...files }, commits: [] as { message: string; paths: string[] }[] };
  const sha = () => createHash("sha1").update(JSON.stringify(Object.entries(state.files).sort())).digest("hex");
  const src: DataSource = {
    label: "memory",
    head: async () => sha(),
    files: async () => ({ ...state.files }),
    blob: async (_sha, path) => (blobs[path] ? new Response(blobs[path]) : null),
    commit: async (baseSha, changed, message) => {
      if (baseSha !== sha()) throw new Error("moved");
      for (const f of changed) state.files[f.path] = f.content ?? "";
      state.commits.push({ message, paths: changed.map((f) => f.path) });
      return sha();
    },
  };
  const kv = new Map<string, string>();
  const env = {
    OAUTH_KV: {
      get: async (k: string, t?: string) => (kv.has(k) ? (t === "json" ? JSON.parse(kv.get(k)!) : kv.get(k)) : null),
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    },
    DEV_DATA_URL: "memory", // no KV file cache
    DEV_LOGIN: "phuc",
    ALLOWED_LOGINS: "phuc",
    TIMEZONE: "Asia/Ho_Chi_Minh",
    ...envOver,
  } as unknown as Env;
  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const handler = createMcpHandler(() => buildServer(env, { login: "phuc" }, src));
    const res = await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) }));
    const text = await res.text();
    const msg = text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
    if (msg.error) throw new Error(JSON.stringify(msg.error));
    const out = msg.result.content[0].text as string;
    if (msg.result.isError) throw new Error(out);
    return out.startsWith("{") || out.startsWith("[") ? JSON.parse(out) : out;
  };
  const http = async (path: string, init: RequestInit = {}) => {
    const res = await api(new Request(`http://localhost/api/${path}`, { ...init, headers: { Origin: "http://localhost", "Content-Type": "application/json", ...(init.headers ?? {}) } }), env, src);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const raw = (path: string) => api(new Request(`http://localhost/api/${path}`), env, src);
  return { state, call, http, raw };
}

describe("connector: AI-built widgets", () => {
  it("add_widget previews without writing; apply writes exactly one dashboard file; another login's file is untouched", async () => {
    const w = world();
    const before = { ...w.state.files };
    const p = await w.call("add_widget", { type: "chart", title: "Cà phê mỗi tuần", query: { metric: "spending", category: "food/cafe", period: "last-3-months", by: "week" }, chart: "bar" });
    expect(p.preview_id).toBeTruthy();
    expect(p.widget).toMatchObject({ id: "ca-phe-moi-tuan", type: "chart", by_ai: true });
    expect(p.shows.total).toBeGreaterThanOrEqual(0);
    expect(w.state.files).toEqual(before);
    expect(w.state.commits).toEqual([]);

    const a = await w.call("apply", { preview_id: p.preview_id });
    expect(a.done).toBe(true);
    expect(w.state.commits).toEqual([{ message: "Dashboard: add widget Cà phê mỗi tuần (phuc)", paths: ["data/dashboards/phuc.yaml"] }]);
    expect(w.state.files["data/dashboards/someone-else.yaml"]).toBe(before["data/dashboards/someone-else.yaml"]);
    const d = parseYaml(w.state.files["data/dashboards/phuc.yaml"]!) as { widgets: { id: string; type: string }[] };
    // the defaults are kept and the new widget goes at the end
    expect(d.widgets.map((x) => x.type)).toEqual(["pace", "attention", "left", "net_worth", "chart"]);

    const listed = await w.call("dashboard");
    expect(listed.saved).toBe(true);
    const r = await w.call("remove_widget", { id: "ca-phe-moi-tuan" });
    await w.call("apply", { preview_id: r.preview_id });
    expect((parseYaml(w.state.files["data/dashboards/phuc.yaml"]!) as { widgets: unknown[] }).widgets).toHaveLength(4);
  });

  it("a widget with a bad query is refused at preview", async () => {
    const w = world();
    await expect(w.call("add_widget", { type: "chart", query: { metric: "balance", period: "fortnight" } })).rejects.toThrow(/period/);
    await expect(w.call("add_widget", { type: "nope" })).rejects.toThrow(/unknown widget type/);
  });
});

describe("connector: batch writes", () => {
  it("batch previews many ops as one change; apply makes one commit; trail has the batch's reason", async () => {
    const w = world();
    const p = await w.call("batch", {
      reason: "statement check October",
      ops: [
        { op: "add", date: "2026-10-05", kind: "expense", amount: 9091, account: "card", category: "other", note: "Annual fee" },
        { op: "add", date: "2026-10-05", kind: "expense", amount: 909, account: "card", category: "other", note: "Annual fee VAT", reason: "VAT" },
        { op: "edit", id: "a2", amount: 125000 },
        { op: "void", id: "a1" },
        { op: "add", date: "2026-10-06", kind: "expense", amount: 1000, category: "food", note: "pool default" },
      ],
    });
    expect(p.will[0]).toBe("batch: 3 adds, 1 edit, 1 void");
    expect(p.transactions).toHaveLength(5);
    expect(p.balance_change).toEqual({ card: -15000, cash: 50000 - 1000 });
    expect(w.state.commits).toEqual([]);
    const a = await w.call("apply", { preview_id: p.preview_id });
    expect(a.done).toBe(true);
    expect(w.state.commits).toHaveLength(1);
    expect(w.state.commits[0]!.message).toMatch(/^Batch: 3 adds, 1 edit, 1 void\n\nReason: statement check October/);
    const rows = w.state.files["data/ledger/2026/10.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.find((r) => r.note === "Annual fee VAT").trail[0].reason).toBe("statement check October; VAT");
    expect(rows.find((r) => r.id === "a1").void).toBe(true);
  });
  it("one bad op refuses the whole batch and names it", async () => {
    const w = world();
    await expect(w.call("batch", { reason: "fix things", ops: [{ op: "add", date: "2026-10-05", kind: "expense", amount: 1, account: "card", category: "other" }, { op: "edit", id: "zzz", amount: 3 }] })).rejects.toThrow(/op 2 \(edit zzz\)/);
    await expect(w.call("batch", { reason: "fix things", ops: [{ op: "void" }] })).rejects.toThrow(/needs an id/);
  });
  it("POST /api/batch previews, /api/batch/apply commits once", async () => {
    const w = world();
    const r = await w.http("batch", { method: "POST", body: JSON.stringify({ reason: "dash", ops: [{ op: "void", id: "a1" }, { op: "void", id: "a2" }] }) });
    expect(r.status).toBe(200);
    expect(r.body.counts).toEqual({ add: 0, edit: 0, void: 2 });
    const a = await w.http("batch/apply", { method: "POST", body: JSON.stringify({ preview_id: r.body.preview_id }) });
    expect(a.status).toBe(200);
    expect(w.state.commits).toHaveLength(1);
    expect((await w.http("batch", { method: "POST", body: JSON.stringify({ ops: [] }) })).status).toBe(400);
  });
});

describe("connector: pool and cards", () => {
  it("with the pool on, spending with no account goes to the default account; rules return the pool", async () => {
    const w = world();
    const rules = await w.call("rules");
    expect(rules.pool).toMatchObject({ on: true, default_account: "cash", accounts: ["cash", "momo"] });
    const p = await w.call("add_transaction", { date: "2026-11-02", kind: "expense", amount: 50000, category: "food/cafe", note: "coffee", reason: "ghi cafe" });
    expect(p.transactions[0].lines).toEqual([["cash", -50000], ["food/cafe", 50000]]);
  });

  it("set_card_details previews a details change; best_card answers", async () => {
    const w = world();
    const p = await w.call("set_card_details", { account: "card", limit: 20000000, cashback: { base: 1, rules: [{ categories: ["food"], rate: 5 }] } });
    expect(p.will).toEqual(["update account(s) card"]);
    await w.call("apply", { preview_id: p.preview_id });
    const acc = (parseYaml(w.state.files["data/accounts.yaml"]!) as { id: string; details: Record<string, unknown> }[]).find((a) => a.id === "card")!;
    expect(acc.details).toMatchObject({ statement_day: 5, due_day: 25, limit: 20000000, cashback: { base: 1 } });
    const best = await w.call("best_card", { category: "food/cafe", amount: 100000, date: "2026-11-02" });
    expect(best.cards[0]).toMatchObject({ account: "card", rate: 5, earn: 5000, source: "yours" });
  });
});

describe("API", () => {
  it("drill-down totals equal the report row they came from", async () => {
    const w = world();
    const rep = await w.http("report?period=2026-10&by=top");
    const food = (rep.body.rows as { key: string; expense: number }[]).find((r) => r.key === "food")!;
    const tx = await w.http("transactions?category=food&from=2026-10-01&to=2026-10-31");
    expect((tx.body.totals as { expense: number }).expense).toBe(food.expense);
  });

  it("PUT /api/dashboard saves the layout in one commit and refuses a bad one", async () => {
    const w = world();
    const me = await w.http("me");
    const widgets = (me.body.dashboard as { widgets: unknown[] }).widgets;
    const ok = await w.http("dashboard", { method: "PUT", body: JSON.stringify({ widgets }) });
    expect(ok.body.saved).toBe(true);
    expect(w.state.commits.map((c) => c.paths)).toEqual([["data/dashboards/phuc.yaml"]]);
    const bad = await w.http("dashboard", { method: "PUT", body: JSON.stringify({ widgets: [{ id: "x", type: "pace", x: 10, y: 0, w: 6, h: 4 }] }) });
    expect(bad.status).toBe(400);
    expect(String(bad.body.error)).toMatch(/x \+ w/);
    const prefs = await w.http("dashboard", { method: "PUT", body: JSON.stringify({ prefs: { pool: { exclude: ["momo"], default_account: "cash" } } }) });
    expect(prefs.body.saved).toBe(true);
    const after = await w.http("me");
    expect(after.body.pool).toMatchObject({ accounts: ["cash"] });
    expect((after.body.dashboard as { widgets: unknown[] }).widgets).toEqual(widgets);
  });

  it("cards module endpoints answer, and 404 without cards", async () => {
    const w = world();
    const list = await w.http("m/cards");
    expect((list.body.cards as { account: string }[]).map((c) => c.account)).toEqual(["card"]);
    const one = await w.http("m/cards/card");
    expect((one.body.statements as unknown[]).length).toBeGreaterThan(0);
    const none = world({ ...base, "data/accounts.yaml": "- {id: cash, name: Cash, type: cash}\n- {id: momo, name: MoMo, type: ewallet}\n- {id: card, name: Card, type: other}\n" });
    expect((await none.http("m/cards")).status).toBe(404);
  });
});

describe("statement PDFs (plan 004)", () => {
  // made-up bytes; the Worker never parses them, it only streams them
  const pdf = new TextEncoder().encode("%PDF-1.4 made-up statement");
  const filed = { ...base, "imports/statements/card/2026-11.pdf": "" };
  const blobs = { "imports/statements/card/2026-11.pdf": pdf };

  it("streams a filed statement's PDF to the signed-in dashboard", async () => {
    const w = world(filed, blobs);
    const res = await w.raw("m/cards/statement-pdf?account=card&close=2026-11-05&date=2026-11-23");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="card-2026-11.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
  });

  it("marks statements that have a PDF", async () => {
    const w = world(filed, blobs);
    const one = await w.http("m/cards/card?date=2026-11-23");
    const sts = one.body.statements as { close: string; pdf: boolean }[];
    expect(sts.find((s) => s.close === "2026-11-05")?.pdf).toBe(true);
    expect(sts.filter((s) => s.pdf)).toHaveLength(1);
    const st = await w.http("m/cards/card/statement?close=2026-11-05&date=2026-11-23");
    expect((st.body.statement as { pdf: boolean }).pdf).toBe(true);
  });

  it("refuses what isn't a filed PDF of a closed statement of a card", async () => {
    const w = world(filed, blobs);
    const st = async (q: string) => (await w.raw(`m/cards/statement-pdf?${q}&date=2026-11-23`)).status;
    expect(await st("account=card&close=2026-10-05")).toBe(404); // a statement, no PDF filed
    expect(await st("account=card&close=2026-11-23")).toBe(404); // the open period
    expect(await st("account=card&close=2026-11-06")).toBe(404); // not a close date
    expect(await st("account=cash&close=2026-11-05")).toBe(404); // not a card
    expect(await st("account=../card&close=2026-11-05")).toBe(404);
    expect(await st("account=card&close=../../x")).toBe(400);
    expect(await st("account=card")).toBe(400);
    // listed in the tree but the bytes are gone
    expect((await world(filed, {}).raw("m/cards/statement-pdf?account=card&close=2026-11-05&date=2026-11-23")).status).toBe(404);
  });

  it("needs the same sign-in as every /api route", async () => {
    const w = world(filed, blobs, { DEV_LOGIN: "", COOKIE_SECRET: "test-secret-test-secret-test-secret" } as Partial<Env>);
    expect((await w.raw("m/cards/statement-pdf?account=card&close=2026-11-05&date=2026-11-23")).status).toBe(401);
  });
});

describe("dashboard API: data repo load fails", () => {
  it("answers JSON with the reason (not a bare 500 the dashboard can't explain)", async () => {
    const env = { DEV_DATA_URL: "memory", DEV_LOGIN: "phuc", ALLOWED_LOGINS: "phuc", TIMEZONE: "Asia/Ho_Chi_Minh" } as unknown as Env;
    const src: DataSource = {
      label: "github.com/o/r@main",
      head: async () => "abc",
      files: async () => {
        throw new Error("GitHub list the data repo's files: 404");
      },
      blob: async () => null,
      commit: async () => "x",
    };
    const res = await api(new Request("http://localhost/api/me"), env, src);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "could not load the data repo (github.com/o/r@main): GitHub list the data repo's files: 404" });
  });
});
