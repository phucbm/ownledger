// End-to-end check of a running Worker in `ownledger dev` (fake sign-in): DCR → consent → code → token (PKCE) → MCP.
// Usage: node scripts/smoke-mcp.mjs http://localhost:8787 [--write]
import { createHash, randomBytes } from "node:crypto";
const base = process.argv[2] ?? "http://localhost:8787";
const write = process.argv.includes("--write");
const b64u = (b) => Buffer.from(b).toString("base64url");
const jar = new Map();
const keep = (res) => { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
const redirect = "http://localhost:9/callback";
const reg = await (await fetch(meta.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "smoke", redirect_uris: [redirect], token_endpoint_auth_method: "none" }) })).json();
const verifier = b64u(randomBytes(32));
const challenge = b64u(createHash("sha256").update(verifier).digest());
const au = new URL(meta.authorization_endpoint);
Object.entries({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope: "ledger offline_access", resource: `${base}/mcp` }).forEach(([k, v]) => au.searchParams.set(k, v));
let res = await fetch(au, { redirect: "manual" });
keep(res);
const html = await res.text();
const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
if (!handle) throw new Error("no consent page: " + html.slice(0, 300));
res = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies(), Origin: base }, body: new URLSearchParams({ handle, decision: "approve" }) });
const loc = res.headers.get("location");
const code = loc && new URL(loc).searchParams.get("code");
if (!code) throw new Error(`no code: ${res.status} ${loc} ${await res.text()}`);
const tok = await (await fetch(meta.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier, resource: `${base}/mcp` }) })).json();
if (!tok.access_token) throw new Error("no token: " + JSON.stringify(tok));
console.log("✓ OAuth: registered, consented, token", tok.access_token.slice(0, 8) + "…", "refresh:", Boolean(tok.refresh_token));

let id = 0;
async function rpc(method, params) {
  const r = await fetch(`${base}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const t = await r.text();
  const m = t.startsWith("{") ? JSON.parse(t) : JSON.parse(t.split("\n").find((l) => l.startsWith("data:")).slice(5));
  if (m.error) throw new Error(`${method}: ${JSON.stringify(m.error)}`);
  return m.result;
}
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
console.log("✓ initialize:", init.serverInfo.name, init.serverInfo.version);
const tools = (await rpc("tools/list", {})).tools.map((t) => t.name);
console.log("✓ tools:", tools.join(", "));
const call = async (name, args = {}) => {
  const t0 = Date.now();
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) throw new Error(`${name}: ${text}`);
  return { v: text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : text, ms: Date.now() - t0 };
};
const about = await call("about");
console.log(`✓ about (${about.ms} ms):`, JSON.stringify(about.v));
for (const [n, a] of [["today", {}], ["report", { period: about.v.today.slice(0, 4) }], ["accounts", {}], ["net_worth", { months: 12 }], ["cards", {}], ["plans_due", {}], ["deposits", {}], ["transactions", { text: "an", limit: 3 }]]) {
  const r = await call(n, a);
  console.log(`✓ ${n} (${r.ms} ms): ${JSON.stringify(r.v).slice(0, 160)}`);
}
if (write) {
  const acc = (await call("rules")).v.accounts[0].split(":")[0];
  const p = await call("add_transaction", { date: about.v.today, kind: "expense", amount: 12345, account: acc, category: "food/cafe", note: "smoke test" });
  console.log("✓ preview:", JSON.stringify(p.v).slice(0, 200));
  const a = await call("apply", { preview_id: p.v.preview_id });
  console.log("✓ apply:", JSON.stringify(a.v));
  const again = await rpc("tools/call", { name: "apply", arguments: { preview_id: p.v.preview_id } });
  console.log("✓ apply twice refused:", again.isError === true, again.content[0].text.slice(0, 80));
  const found = await call("transactions", { text: "smoke test" });
  console.log("✓ found after commit:", found.v.total);
  const v = await call("void_transaction", { id: found.v.items[0].id });
  console.log("✓ void applied:", JSON.stringify((await call("apply", { preview_id: v.v.preview_id })).v));
}
