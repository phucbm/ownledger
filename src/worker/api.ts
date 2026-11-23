import { accountValues } from "../engine/balances.js";
import { flattenCategories } from "../engine/categories.js";
import { addMonths, monthEnd, todayIn } from "../engine/dates.js";
import { netWorth, netWorthSeries } from "../engine/networth.js";
import { TYPES } from "../engine/registry.js";
import { queryTransactions, report, type GroupBy } from "../engine/reports.js";
import { budgets, cards, deposits, planStatus, plansDue, today } from "../engine/schedules.js";
import { checkFiles } from "../engine/check.js";
import { attention } from "../engine/attention.js";
import { checkDashboard, dashboardPath, defaultWidgets, parseDashboard, poolOf, writeDashboard, type Dashboard } from "../engine/dashboard.js";
import { features } from "../engine/features.js";
import { pace, series, unusual, usual, type SeriesQuery, type UsualBy } from "../engine/insights.js";
import type { Ledger } from "../engine/types.js";
import type { FileMap } from "../engine/load.js";
import { moduleApi } from "../modules/api.js";
import { applyChange } from "../engine/write.js";
import { batch, BATCH_MAX, type BatchOp } from "../engine/actions.js";
import { parseMapping } from "../import/mapping.js";
import { runImport } from "../import/run.js";
import { readWorkbook } from "../import/workbook.js";
import { sessionLogin } from "./auth.js";
import type { Env } from "./env.js";
import { MainMovedError } from "./github.js";
import { applyPending, savePending, snapshot, sourceFor, type DataSource } from "./store.js";
import { VERSION } from "./version.js";

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });


/** The signed-in person's dashboard file, or null when they have none yet. */
export function dashboardOf(files: FileMap, login: string): Dashboard | null {
  try {
    return parseDashboard(files[dashboardPath(login)]);
  } catch {
    return null;
  }
}

/** Commit one dashboard file; if main moved meanwhile, once more on the new head (the file is replaced whole). */
export async function saveDashboard(env: Env, src: DataSource, login: string, d: Dashboard, message: string): Promise<{ sha: string; issues: string[] }> {
  for (let attempt = 0; ; attempt++) {
    const s = await snapshot(env, src);
    const path = dashboardPath(login);
    const issues = checkDashboard(path, d, s.ledger);
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length) throw new Error(`dashboard refused: ${errors.map((e) => `${e.where ? `[${e.where}] ` : ""}${e.message}`).join("; ")}`);
    try {
      const sha = await src.commit(s.sha, [{ path, content: writeDashboard(d) }], message);
      return { sha, issues: issues.map((i) => `${i.where ? `[${i.where}] ` : ""}${i.message}`) };
    } catch (e) {
      if (e instanceof MainMovedError && attempt === 0) continue;
      throw e;
    }
  }
}

function lastActivity(L: Ledger): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of L.transactions) {
    if (t.void) continue;
    for (const ln of t.lines) if (ln.account) out.set(ln.account, t.date);
  }
  return out;
}

/** Balance of one account after each of its transactions (for the running balance column). */
function runningBalance(L: Ledger, account: string): Map<string, number> {
  const out = new Map<string, number>();
  let b = 0;
  for (const t of L.transactions) {
    if (t.void) continue;
    let touched = false;
    for (const ln of t.lines) if (ln.account === account) {
      b += ln.amount;
      touched = true;
    }
    if (touched) out.set(t.id, b);
  }
  return out;
}

function seriesQuery(q: URLSearchParams): SeriesQuery {
  const s = (k: string) => q.get(k) ?? undefined;
  const acc = q.get("account");
  return {
    metric: (s("metric") ?? "spending") as SeriesQuery["metric"],
    category: s("category"),
    account: acc ? (acc.includes(",") ? acc.split(",") : acc) : undefined,
    who: s("who"),
    event: s("event"),
    tag: s("tag"),
    text: s("text"),
    period: s("period"),
    from: s("from"),
    to: s("to"),
    by: s("by") as SeriesQuery["by"],
    compare: s("compare") as SeriesQuery["compare"],
    limit: q.get("limit") ? Number(q.get("limit")) : undefined,
  };
}

/** JSON for the dashboard. Same sign-in allowlist as the connector; read-only except import (Phase 6). */
export async function api(req: Request, env: Env, source?: DataSource): Promise<Response> {
  const login = await sessionLogin(req, env);
  if (!login) return json({ error: "sign in", login: "/auth/login" }, 401);
  // same-origin only for anything that changes state
  if (req.method !== "GET" && req.headers.get("Origin") !== new URL(req.url).origin) return json({ error: "bad origin" }, 403);
  const url = new URL(req.url);
  const q = url.searchParams;
  const path = url.pathname.slice(5);
  const src = source ?? sourceFor(env);
  let s: Awaited<ReturnType<typeof snapshot>>;
  try {
    s = await snapshot(env, src);
  } catch (e) {
    // Loading the data repo failed (GitHub down, app not installed…): say why, as JSON, instead of a bare 500.
    return json({ error: `could not load the data repo (${src.label}): ${(e as Error).message}` }, 502);
  }
  const L = s.ledger;
  const asOf = q.get("date") ?? todayIn(env.TIMEZONE || "Asia/Ho_Chi_Minh");
  try {
    const dash = dashboardOf(s.files, login);
    const pool = poolOf(L, dash?.prefs?.pool, asOf);
    /** "pool" in an account filter means every account in the pool. */
    const accountParam = (v: string | null): string | string[] | undefined => (!v ? undefined : v === "pool" ? pool.accounts : v.includes(",") ? v.split(",") : v);
    if (path.startsWith("m/")) {
      const r = await moduleApi(path.slice(2), { req, env, src, snap: s, login, asOf, q });
      if (r && "response" in r) return r.response;
      return r ? json(r.body, r.status ?? 200) : json({ error: "not found" }, 404);
    }
    switch (path) {
      case "me": {
        const f = features(L, asOf, s.files, pool.accounts);
        return json({ login, version: VERSION, data: src.label, commit: s.sha, base: L.meta.base, locale: L.meta.locale ?? "en", name: L.meta.name, today: asOf, check: { errors: s.errors, warnings: s.warnings }, features: f, pool, dashboard: { saved: Boolean(dash), widgets: dash?.widgets ?? defaultWidgets(f), prefs: dash?.prefs ?? {} } });
      }
      case "home": {
        const nw = netWorthSeries(L, addMonths(asOf.slice(0, 7) + "-01", -12), asOf);
        const now = nw[nw.length - 1]!;
        const lastMonthEnd = nw[nw.length - 2] ?? null;
        const yearAgo = nw[0] ?? null;
        const balances = new Map(accountValues(L, asOf).map((v) => [v.account.id, v.value]));
        const p = pace(L, asOf);
        return json({
          asOf,
          pace: p,
          left: { income: p.income, spent: p.spent, now: p.income - p.spent, monthEnd: p.incomeEstimate - p.estimate },
          attention: attention(L, asOf, { files: s.files, check: { errors: s.errors, warnings: s.warnings } }),
          unusual: unusual(L, asOf),
          netWorth: { net: now.net, assets: now.assets, liabilities: now.liabilities, byType: now.byType, unpriced: now.unpriced, changeMonth: lastMonthEnd ? now.net - lastMonthEnd.net : null, change12: yearAgo && nw.length > 12 ? now.net - yearAgo.net : null, series: nw.slice(1).map((x) => ({ date: x.date, net: x.net })) },
          pool: { ...pool, balance: pool.accounts.reduce((t, id) => t + (balances.get(id) ?? 0), 0) },
        });
      }
      case "series": {
        const sq = seriesQuery(q);
        if (sq.account === "pool") sq.account = pool.accounts;
        return json(series(L, sq, asOf));
      }
      case "dashboard": {
        if (req.method === "PUT") {
          const body = (await req.json()) as Dashboard;
          const d: Dashboard = { version: 1, widgets: body.widgets ?? dash?.widgets, prefs: body.prefs ?? dash?.prefs };
          if (!d.prefs || !Object.keys(d.prefs).length) delete d.prefs;
          const r = await saveDashboard(env, src, login, d, `Dashboard: ${body.prefs && !body.widgets ? "settings" : "layout"} (${login})`);
          return json({ saved: true, commit: r.sha, warnings: r.issues });
        }
        if (req.method === "DELETE") {
          if (!dash) return json({ saved: false });
          const sha = await src.commit(s.sha, [{ path: dashboardPath(login), content: writeDashboard({ version: 1, ...(dash.prefs ? { prefs: dash.prefs } : {}) }) }], `Dashboard: reset layout (${login})`);
          return json({ saved: true, commit: sha });
        }
        const f = features(L, asOf, s.files);
        return json({ saved: Boolean(dash), widgets: dash?.widgets ?? defaultWidgets(f), prefs: dash?.prefs ?? {}, path: dashboardPath(login) });
      }
      case "meta": {
        const { map } = flattenCategories(L.categories);
        return json({
          base: L.meta.base,
          locale: L.meta.locale,
          types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, { ...v.label, liquid: Boolean(v.liquid), liability: Boolean(v.liability), holdings: Boolean(v.holdings) }])),
          categories: [...map.values()],
          accounts: L.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, closed: a.closed ?? null, group: a.group ?? null })),
          assets: L.assets,
        });
      }
      case "overview": {
        const m = report(L, asOf.slice(0, 7));
        return json({ today: today(L, asOf), month: { income: m.income, expense: m.expense, net: m.net, previous: m.previous, top: m.rows.filter((r) => r.expense).slice(0, 8) }, netWorth: netWorth(L, asOf), series: netWorthSeries(L, addMonths(asOf.slice(0, 7) + "-01", -11), asOf) });
      }
      case "accounts": {
        const last = lastActivity(L);
        const inPool = new Set(pool.accounts);
        return json(accountValues(L, asOf).map((v) => ({ ...v.account, value: v.value, cost: v.cost, qty: v.qty, asset: v.asset, priced: v.priced, price: v.price, lastActivity: last.get(v.account.id) ?? null, pool: inPool.has(v.account.id) })));
      }
      case "transactions": {
        const n = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
        const account = accountParam(q.get("account"));
        const single = typeof account === "string" ? account : null;
        const r = queryTransactions(L, {
          from: q.get("from") ?? undefined,
          to: q.get("to") ?? undefined,
          account,
          who: q.get("who") ?? undefined,
          event: q.get("event") ?? undefined,
          tag: q.get("tag") ?? undefined,
          tx: q.get("tx") ?? undefined,
          plan: q.get("plan") ?? undefined,
          // moves inside the pool are hidden unless asked for, or when looking at one account
          hideWithin: pool.on && !single && q.get("within") !== "1" ? pool.accounts : undefined,
          category: q.get("category") ?? undefined,
          text: q.get("text") ?? undefined,
          min: n("min"),
          max: n("max"),
          includeVoid: q.get("void") === "1",
          offset: n("offset"),
          limit: n("limit") ?? 100,
        });
        if (single) {
          const rb = runningBalance(L, single);
          return json({ ...r, items: r.items.map((t) => ({ ...t, balance: rb.get(t.id) ?? null })) });
        }
        return json(r);
      }
      case "report": {
        const period = q.get("from") && q.get("to") ? { from: q.get("from")!, to: q.get("to")! } : (q.get("period") ?? asOf.slice(0, 7));
        if (q.get("usual")) {
          const p = typeof period === "string" ? (period.length === 7 ? { from: `${period}-01`, to: monthEnd(`${period}-01`) } : { from: `${period}-01-01`, to: `${period}-12-31` }) : period;
          return json(usual(L, p, (q.get("by") ?? "top") as UsualBy, { months: Number(q.get("usual")) || 6, kind: (q.get("kind") as "income" | "expense" | null) ?? "expense" }));
        }
        return json(report(L, period, { by: (q.get("by") ?? "top") as GroupBy, kind: (q.get("kind") as "income" | "expense" | null) ?? undefined, category: q.get("category") ?? undefined, account: typeof accountParam(q.get("account")) === "string" ? (q.get("account") as string) : undefined }));
      }
      case "networth":
        return json(netWorthSeries(L, q.get("from") ?? addMonths(asOf.slice(0, 7) + "-01", -23), asOf));
      case "plans":
        return json({ status: planStatus(L, asOf), due: plansDue(L, asOf, Number(q.get("days") ?? 60)), plans: L.plans });
      case "cards":
        return json(cards(L, asOf));
      case "deposits":
        return json(deposits(L, asOf));
      case "budgets":
        return json(budgets(L, asOf));
      case "import/mappings":
        return json(Object.keys(s.files).filter((p) => /^imports\/[^/]+\.mapping\.yaml$/.test(p)));
      case "import/preview": {
        if (req.method !== "POST") return json({ error: "POST" }, 405);
        const body = (await req.json()) as { file_name: string; base64: string; mapping?: string };
        const maps = Object.keys(s.files).filter((p) => /^imports\/[^/]+\.mapping\.yaml$/.test(p));
        const mp = body.mapping ?? (maps.length === 1 ? maps[0] : undefined);
        if (!mp || !s.files[mp]) return json({ error: maps.length ? "choose a mapping" : "no mapping in imports/: do the first import of a new app with the CLI and your AI (see AGENTS.md)", mappings: maps }, 400);
        const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
        const r = runImport(readWorkbook(body.file_name, bytes), parseMapping(s.files[mp]!), L);
        const report = {
          ok: r.ok, source: r.source, rows: r.rows, new: r.transactions.length, skipped: r.skipped, accounts: r.accounts.map((a) => `${a.id} (${a.type})`),
          reconcile: r.reconcile, rounding: r.rounding, zeroed: r.zeroed, unpaired: r.unpaired.map((u) => ({ sheet: u.sheet, row: u.row, date: u.date, amount: u.amount, note: u.note })),
          unresolvedCategories: r.unresolvedCategories, unresolvedRows: r.unresolvedRows.slice(0, 50).map((u) => ({ sheet: u.sheet, row: u.row, date: u.date, amount: u.amount, note: u.note })),
          changed: r.changed, gone: r.gone, replace: r.replace.length, errors: r.errors, cardTerms: r.accountUpdates.map((u) => u.id), nameWarnings: r.nameWarnings,
          sample: r.transactions.slice(0, 20),
        };
        if (!r.ok || (!r.transactions.length && !r.accounts.length && !r.replace.length && !r.accountUpdates.length)) return json({ report });
        const changed = applyChange(s.files, { addAccounts: r.accounts, updateAccounts: r.accountUpdates, addTransactions: r.transactions, replaceTransactions: r.replace });
        const c = checkFiles({ ...s.files, ...changed });
        if (!c.ok) return json({ report: { ...report, ok: false, errors: c.errors.slice(0, 20).map((e) => e.message) } });
        const stamp = asOf.replace(/-/g, "");
        const safe = body.file_name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
        const message = `Import ${r.source}: ${r.transactions.length} transaction(s)${r.accounts.length ? `, ${r.accounts.length} account(s)` : ""} (dashboard)`;
        const id = await savePending(env, { baseSha: s.sha, files: changed, binary: [{ path: `imports/raw/${stamp}-${safe}`, base64: body.base64 }], message, summary: [message], created: new Date().toISOString() });
        return json({ report, preview_id: id, message });
      }
      case "import/apply": {
        if (req.method !== "POST") return json({ error: "POST" }, 405);
        const { preview_id } = (await req.json()) as { preview_id: string };
        return json(await applyPending(env, src, preview_id));
      }
      case "batch": {
        // Preview many transaction adds/edits/voids as one change; POST batch/apply commits it (one commit).
        if (req.method !== "POST") return json({ error: "POST" }, 405);
        const body = (await req.json()) as { ops?: BatchOp[]; reason?: string };
        if (!Array.isArray(body.ops) || !body.ops.length || body.ops.length > BATCH_MAX) return json({ error: `ops: 1 to ${BATCH_MAX}` }, 400);
        if (!body.reason?.trim()) return json({ error: "reason is required" }, 400);
        const p = batch(s.files, body.ops, { via: "dashboard", client: login, reason: body.reason });
        const id = await savePending(env, { baseSha: s.sha, files: p.files, message: p.message, summary: p.summary, created: new Date().toISOString() });
        return json({ preview_id: id, will: p.summary, message: p.message, counts: p.counts, balance_change: p.balanceChange, transactions: [...(p.change.addTransactions ?? []), ...(p.change.replaceTransactions ?? [])], warnings: p.warnings.map((w) => w.message) });
      }
      case "batch/apply": {
        if (req.method !== "POST") return json({ error: "POST" }, 405);
        const { preview_id } = (await req.json()) as { preview_id: string };
        return json(await applyPending(env, src, preview_id));
      }
      case "grants": {
        if (req.method === "DELETE") {
          const id = q.get("id");
          if (!id) return json({ error: "id" }, 400);
          await env.OAUTH_PROVIDER.revokeGrant(id, login);
          return json({ revoked: id });
        }
        const g = await env.OAUTH_PROVIDER.listUserGrants(login);
        const clients = await Promise.all(g.items.map((x) => env.OAUTH_PROVIDER.lookupClient(x.clientId).catch(() => null)));
        return json(g.items.map((x, i) => ({ id: x.id, client: clients[i]?.clientName ?? x.clientId, scope: x.scope, created: x.createdAt })));
      }
      default:
        return json({ error: "not found" }, 404);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}
