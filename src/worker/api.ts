import { accountValues } from "../engine/balances.js";
import { flattenCategories } from "../engine/categories.js";
import { addMonths, todayIn } from "../engine/dates.js";
import { netWorth, netWorthSeries } from "../engine/networth.js";
import { TYPES } from "../engine/registry.js";
import { queryTransactions, report, type GroupBy } from "../engine/reports.js";
import { budgets, cards, deposits, planStatus, plansDue, today } from "../engine/schedules.js";
import { checkFiles } from "../engine/check.js";
import { applyChange } from "../engine/write.js";
import { parseMapping } from "../import/mapping.js";
import { runImport } from "../import/run.js";
import { readWorkbook } from "../import/workbook.js";
import { sessionLogin } from "./auth.js";
import type { Env } from "./env.js";
import { applyPending, savePending, snapshot, sourceFor } from "./store.js";
import { VERSION } from "./version.js";

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

/** JSON for the dashboard. Same sign-in allowlist as the connector; read-only except import (Phase 6). */
export async function api(req: Request, env: Env): Promise<Response> {
  const login = await sessionLogin(req, env);
  if (!login) return json({ error: "sign in", login: "/auth/login" }, 401);
  // same-origin only for anything that changes state
  if (req.method !== "GET" && req.headers.get("Origin") !== new URL(req.url).origin) return json({ error: "bad origin" }, 403);
  const url = new URL(req.url);
  const q = url.searchParams;
  const path = url.pathname.slice(5);
  const src = sourceFor(env);
  const s = await snapshot(env, src);
  const L = s.ledger;
  const asOf = q.get("date") ?? todayIn(env.TIMEZONE || "Asia/Ho_Chi_Minh");
  try {
    switch (path) {
      case "me":
        return json({ login, version: VERSION, data: src.label, commit: s.sha, base: L.meta.base, locale: L.meta.locale ?? "en", name: L.meta.name, today: asOf, check: { errors: s.errors, warnings: s.warnings } });
      case "meta": {
        const { map } = flattenCategories(L.categories);
        return json({
          base: L.meta.base,
          locale: L.meta.locale,
          types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.label])),
          categories: [...map.values()],
          accounts: L.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, closed: a.closed ?? null, group: a.group ?? null })),
          assets: L.assets,
        });
      }
      case "overview": {
        const m = report(L, asOf.slice(0, 7));
        return json({ today: today(L, asOf), month: { income: m.income, expense: m.expense, net: m.net, previous: m.previous, top: m.rows.filter((r) => r.expense).slice(0, 8) }, netWorth: netWorth(L, asOf), series: netWorthSeries(L, addMonths(asOf.slice(0, 7) + "-01", -11), asOf) });
      }
      case "accounts":
        return json(accountValues(L, asOf).map((v) => ({ ...v.account, value: v.value, cost: v.cost, qty: v.qty, asset: v.asset, priced: v.priced, price: v.price })));
      case "transactions": {
        const n = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
        const r = queryTransactions(L, {
          from: q.get("from") ?? undefined,
          to: q.get("to") ?? undefined,
          account: q.get("account") ?? undefined,
          category: q.get("category") ?? undefined,
          text: q.get("text") ?? undefined,
          min: n("min"),
          max: n("max"),
          includeVoid: q.get("void") === "1",
          offset: n("offset"),
          limit: n("limit") ?? 100,
        });
        return json(r);
      }
      case "report": {
        const period = q.get("from") && q.get("to") ? { from: q.get("from")!, to: q.get("to")! } : (q.get("period") ?? asOf.slice(0, 7));
        return json(report(L, period, { by: (q.get("by") ?? "top") as GroupBy, kind: (q.get("kind") as "income" | "expense" | null) ?? undefined, category: q.get("category") ?? undefined }));
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
          changed: r.changed, gone: r.gone, replace: r.replace.length, errors: r.errors,
          sample: r.transactions.slice(0, 20),
        };
        if (!r.ok || (!r.transactions.length && !r.accounts.length && !r.replace.length)) return json({ report });
        const changed = applyChange(s.files, { addAccounts: r.accounts, addTransactions: r.transactions, replaceTransactions: r.replace });
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
