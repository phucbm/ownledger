import { accountValues } from "../engine/balances.js";
import { flattenCategories } from "../engine/categories.js";
import { addMonths, todayIn } from "../engine/dates.js";
import { netWorth, netWorthSeries } from "../engine/networth.js";
import { TYPES } from "../engine/registry.js";
import { queryTransactions, report, type GroupBy } from "../engine/reports.js";
import { budgets, cards, deposits, planStatus, plansDue, today } from "../engine/schedules.js";
import { sessionLogin } from "./auth.js";
import type { Env } from "./env.js";
import { snapshot, sourceFor } from "./store.js";
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
