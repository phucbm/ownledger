import { AuthorizationError, authorizationErrorRedirect } from "@cloudflare/workers-oauth-provider";
import { allowed, type Env } from "./env.js";
import { githubAuthorizeUrl, githubLogin, randomToken, s256 } from "./github.js";

/* ------------------------------------------------------------------ html */

const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://github.com";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function page(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:10vh auto;padding:0 1rem;color:#1a1a1a;background:#fafafa}h1{font-size:1.3rem}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:1.5rem}button{font:inherit;padding:.6rem 1.1rem;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer}
button.primary{background:#1a1a1a;color:#fff;border-color:#1a1a1a}.muted{color:#666;font-size:.9rem}code{background:#f0f0f0;padding:0 .3rem;border-radius:4px}</style></head>
<body><div class="card">${body}</div></body></html>`,
    { status, headers },
  );
}

/* ------------------------------------------------------------------ signed cookies */

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function seal(secret: string, value: object): Promise<string> {
  const body = btoa(unescape(encodeURIComponent(JSON.stringify(value)))).replace(/=+$/, "");
  return `${body}.${await hmac(secret, body)}`;
}

async function unseal<T>(secret: string, token: string | undefined): Promise<T | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = await hmac(secret, body);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  try {
    const v = JSON.parse(decodeURIComponent(escape(atob(body)))) as T & { exp?: number };
    if (v.exp && v.exp < Date.now() / 1000) return null;
    return v;
  } catch {
    return null;
  }
}

function cookie(req: Request, name: string): string | undefined {
  const c = req.headers.get("Cookie") ?? "";
  for (const part of c.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return undefined;
}

const SESSION = "__Host-ol_session";
const LOGIN_STATE = "__Host-ol_login";
const SESSION_DAYS = 14;

function setCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/** The dashboard's signed-in login, or null. */
export async function sessionLogin(req: Request, env: Env): Promise<string | null> {
  if (env.DEV_LOGIN) return env.DEV_LOGIN;
  const s = await unseal<{ login: string }>(env.COOKIE_SECRET, cookie(req, SESSION));
  return s && allowed(env, s.login) ? s.login : null;
}

/* ------------------------------------------------------------------ MCP client authorization (/authorize) */

/** The registered app's name, kept in the token props so writes can say which app made them. */
async function clientName(oauth: Env["OAUTH_PROVIDER"], clientId: string): Promise<{ client?: string }> {
  const c = await oauth.lookupClient(clientId).catch(() => null);
  const name = (c?.clientName || clientId || "").slice(0, 60);
  return name ? { client: name } : {};
}

export async function authorizeGet(req: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  let request;
  try {
    request = await oauth.parseAuthRequest(req);
  } catch (e) {
    if (e instanceof AuthorizationError && e.redirectUri && e.redirectTo) return Response.redirect(e.redirectTo, 302);
    return page("Can't connect", `<h1>Can't connect</h1><p>${esc((e as Error).message)}</p>`, 400);
  }
  const d = await oauth.describeConsent(request);
  const consent = await oauth.beginConsent(request);
  return page(
    "Connect to your ledger",
    `<h1>Connect <b>${esc(d.clientName || d.clientId)}</b> to your ledger?</h1>
<p>It will be able to <b>read</b> your finances and <b>propose changes</b>; every change still needs your go in the chat before it is committed.</p>
<p class="muted">Sends you back to <code>${esc(d.redirectHost)}</code>. You'll sign in with GitHub${env.DEV_LOGIN ? " (dev: skipped)" : ""}; only ${esc(env.ALLOWED_LOGINS)} can.</p>
<form method="post" action="/authorize"><input type="hidden" name="handle" value="${esc(consent.handle)}">
<button class="primary" name="decision" value="approve">Allow</button> <button name="decision" value="deny">Deny</button></form>`,
    200,
    consent.headers,
  );
}

export async function authorizePost(req: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const form = await req.formData();
  const handle = String(form.get("handle") ?? "");
  try {
    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(req, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const approved = await oauth.approveConsent(req, handle);
    if (env.DEV_LOGIN) {
      const { redirectTo } = await oauth.completeAuthorization({ request: approved.request, userId: env.DEV_LOGIN, metadata: { login: env.DEV_LOGIN }, scope: approved.request.scope, props: { login: env.DEV_LOGIN, ...(await clientName(oauth, approved.request.clientId)) } });
      approved.headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
    const verifier = randomToken(32);
    const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers });
    headers.set("Location", githubAuthorizeUrl(env.GITHUB_CLIENT_ID, new URL("/oauth/callback", req.url).toString(), state, await s256(verifier)));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    if (e instanceof AuthorizationError) return page("Expired", `<h1>This page expired</h1><p>${esc(e.message)}</p><p>Start again from your AI app.</p>`, 400);
    throw e;
  }
}

export async function oauthCallback(req: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  let resumed;
  try {
    resumed = await oauth.finishUpstream<{ verifier: string }>(req);
  } catch (e) {
    if (e instanceof AuthorizationError) return page("Expired", `<h1>Sign-in expired</h1><p>${esc(e.message)}</p><p>Start again from your AI app.</p>`, 400);
    throw e;
  }
  const url = new URL(req.url);
  const deny = (why: string) => {
    resumed.headers.set("Location", authorizationErrorRedirect(resumed.request, "access_denied", why));
    return new Response(null, { status: 302, headers: resumed.headers });
  };
  if (url.searchParams.get("error")) return deny("GitHub sign-in was declined");
  const login = await githubLogin(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, url.searchParams.get("code") ?? "", resumed.data.verifier, new URL("/oauth/callback", req.url).toString());
  if (!allowed(env, login)) return deny(`${login} is not allowed on this ledger`);
  const { redirectTo } = await oauth.completeAuthorization({ request: resumed.request, userId: login, metadata: { login }, scope: resumed.request.scope, props: { login, ...(await clientName(oauth, resumed.request.clientId)) } });
  resumed.headers.set("Location", redirectTo);
  return new Response(null, { status: 302, headers: resumed.headers });
}

/* ------------------------------------------------------------------ dashboard sign-in */

export async function dashboardLogin(req: Request, env: Env): Promise<Response> {
  if (env.DEV_LOGIN) return Response.redirect(new URL("/", req.url).toString(), 302);
  const state = randomToken(16);
  const verifier = randomToken(32);
  const sealed = await seal(env.COOKIE_SECRET, { state, verifier, exp: Math.floor(Date.now() / 1000) + 600 });
  const headers = new Headers({ Location: githubAuthorizeUrl(env.GITHUB_CLIENT_ID, new URL("/auth/callback", req.url).toString(), state, await s256(verifier)) });
  headers.append("Set-Cookie", setCookie(LOGIN_STATE, sealed, 600));
  return new Response(null, { status: 302, headers });
}

export async function dashboardCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const st = await unseal<{ state: string; verifier: string }>(env.COOKIE_SECRET, cookie(req, LOGIN_STATE));
  if (!st || st.state !== url.searchParams.get("state")) return page("Sign-in expired", `<h1>Sign-in expired</h1><p><a href="/auth/login">Try again</a></p>`, 400);
  const login = await githubLogin(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, url.searchParams.get("code") ?? "", st.verifier, new URL("/auth/callback", req.url).toString());
  if (!allowed(env, login)) return page("Not allowed", `<h1>Not allowed</h1><p><code>${esc(login)}</code> can't open this ledger.</p>`, 403);
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", setCookie(SESSION, await seal(env.COOKIE_SECRET, { login, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 }), SESSION_DAYS * 86400));
  headers.append("Set-Cookie", setCookie(LOGIN_STATE, "", 0));
  return new Response(null, { status: 302, headers });
}

export function dashboardLogout(): Response {
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", setCookie(SESSION, "", 0));
  return new Response(null, { status: 302, headers });
}
