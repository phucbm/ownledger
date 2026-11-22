import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { api } from "./api.js";
import { authorizeGet, authorizePost, dashboardCallback, dashboardLogin, dashboardLogout, oauthCallback } from "./auth.js";
import type { Env, Props } from "./env.js";
import { allowed } from "./env.js";
import { buildServer } from "./mcp.js";

/** /mcp: reached only with a valid access token; ctx.props is what sign-in stored. */
const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: Props }): Promise<Response> {
    const props = ctx.props;
    if (!props?.login || !allowed(env, props.login)) return new Response("forbidden", { status: 403 });
    const handler = createMcpHandler(() => buildServer(env, props));
    return handler.fetch(request);
  },
};

const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === "/authorize") return request.method === "POST" ? authorizePost(request, env) : authorizeGet(request, env);
    if (p === "/oauth/callback") return oauthCallback(request, env);
    if (p === "/auth/login") return dashboardLogin(request, env);
    if (p === "/auth/callback") return dashboardCallback(request, env);
    if (p === "/auth/logout" && request.method === "POST") return dashboardLogout();
    if (p.startsWith("/api/")) return api(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("ownledger", { status: 200 });
  },
};

function provider(env: Env): OAuthProvider<Env> {
  const origin = env.PUBLIC_URL.replace(/\/$/, "");
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: mcpHandler as never,
    defaultHandler: defaultHandler as never,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["ledger", "offline_access"],
    requiredScopes: ["ledger"],
    resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
    accessTokenTTL: 60 * 60, // 1 hour
    refreshTokenTTL: 60 * 60 * 24 * 30, // 30 days; revocable from the dashboard
  });
}

// One provider per isolate, built on the first request (its URLs come from the Worker's vars).
let cached: { url: string; p: OAuthProvider<Env> } | null = null;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.PUBLIC_URL) return Promise.resolve(new Response("ownledger: PUBLIC_URL is not set (run `ownledger deploy`)", { status: 500 }));
    if (!cached || cached.url !== env.PUBLIC_URL) cached = { url: env.PUBLIC_URL, p: provider(env) };
    return cached.p.fetch(request, env, ctx);
  },
};
