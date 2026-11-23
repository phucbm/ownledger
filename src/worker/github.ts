/**
 * The Worker's only network peer: GitHub's API, through the user's own GitHub App.
 * Installation tokens are short-lived and limited to the one data repo.
 */
import { STATEMENT_PDF_RE } from "../modules/cards/files.js";

const API = "https://api.github.com";
const UA = "ownledger-worker";

export class MainMovedError extends Error {
  constructor() {
    super("main moved since the preview (someone else committed). Preview again.");
  }
}

/* ------------------------------------------------------------------ keys and JWT */

const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));

function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | out.length, ...out];
}

/** GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"); WebCrypto wants PKCS#8. Wrap it. */
export function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return der;
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLen(der.length), ...der];
  const inner = [0x02, 0x01, 0x00, ...algo, ...octet];
  return new Uint8Array([0x30, ...derLen(inner.length), ...inner]);
}

let keyCache: { pem: string; key: CryptoKey } | null = null;

export async function appJwt(appId: string, pem: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  if (!keyCache || keyCache.pem !== pem) {
    const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    keyCache = { pem, key };
  }
  const head = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64urlStr(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyCache.key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

/* ------------------------------------------------------------------ client */

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  repo: string; // owner/name
  branch: string;
}

let tokenCache: { repo: string; token: string; exp: number } | null = null;

async function gh(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": UA, "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) },
  });
  return res;
}

async function ok<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`GitHub ${what}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export async function installationToken(c: GitHubAppConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.repo === c.repo && tokenCache.exp - now > 5 * 60_000) return tokenCache.token;
  const jwt = await appJwt(c.appId, c.privateKey);
  const inst = await ok<{ id: number }>(await gh(`/repos/${c.repo}/installation`, jwt), "find the app's installation on the data repo");
  const name = c.repo.split("/")[1]!;
  const t = await ok<{ token: string; expires_at: string }>(
    await gh(`/app/installations/${inst.id}/access_tokens`, jwt, { method: "POST", body: JSON.stringify({ repositories: [name] }) }),
    "create an installation token",
  );
  tokenCache = { repo: c.repo, token: t.token, exp: Date.parse(t.expires_at) };
  return t.token;
}

export async function headSha(c: GitHubAppConfig): Promise<string> {
  const token = await installationToken(c);
  const res = await gh(`/repos/${c.repo}/commits/${encodeURIComponent(c.branch)}`, token, { headers: { Accept: "application/vnd.github.sha" } });
  if (!res.ok) throw new Error(`GitHub head of ${c.branch}: ${res.status}`);
  return (await res.text()).trim();
}

/** Files the Worker reads as text: everything under data/ and imports/*.mapping.yaml. */
export const isDataFile = (p: string): boolean => p.startsWith("data/") || /^imports\/[^/]+\.mapping\.yaml$/.test(p);

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
}

/** Which tree entries to read as text, and which to list by path only (statement PDFs, never downloaded). */
export function pickFiles(tree: TreeEntry[]): { text: TreeEntry[]; pathOnly: string[] } {
  const text: TreeEntry[] = [];
  const pathOnly: string[] = [];
  for (const e of tree) {
    if (e.type !== "blob") continue;
    if (isDataFile(e.path)) text.push(e);
    else if (STATEMENT_PDF_RE.test(e.path)) pathOnly.push(e.path);
  }
  return { text, pathOnly };
}

const GRAPHQL_BATCH = 100;

/**
 * Every file under data/ and imports/*.mapping.yaml at a commit; statement PDFs by path only ("").
 * One tree listing plus one GraphQL call per 100 files: no tarball, so binary files in the repo
 * (statement PDFs, raw exports) cost the Worker nothing (a tarball of them ran past the Free plan's CPU limit).
 */
export async function filesAt(c: GitHubAppConfig, sha: string): Promise<Record<string, string>> {
  const token = await installationToken(c);
  const t = await ok<{ tree: TreeEntry[]; truncated: boolean }>(await gh(`/repos/${c.repo}/git/trees/${sha}?recursive=1`, token), "list the data repo's files");
  if (t.truncated) throw new Error("GitHub file list: the data repo has too many files for one listing (over 100,000)");
  const { text, pathOnly } = pickFiles(t.tree);
  const out: Record<string, string> = {};
  for (const p of pathOnly) out[p] = "";
  const [owner, name] = c.repo.split("/");
  for (let i = 0; i < text.length; i += GRAPHQL_BATCH) {
    const batch = text.slice(i, i + GRAPHQL_BATCH);
    const fields = batch.map((e, j) => `f${j}: object(oid: ${JSON.stringify(e.sha)}) { ... on Blob { text isTruncated } }`).join("\n");
    const res = await gh(`/graphql`, token, {
      method: "POST",
      body: JSON.stringify({ query: `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`, variables: { owner, name } }),
    });
    const j = await ok<{ data?: { repository: Record<string, { text: string | null; isTruncated: boolean } | null> }; errors?: { message: string }[] }>(res, "read the data files");
    if (j.errors?.length || !j.data) throw new Error(`GitHub read the data files: ${j.errors?.map((e) => e.message).join("; ") ?? "no data"}`);
    for (const [k, e] of batch.entries()) {
      const b = j.data.repository[`f${k}`];
      // Too big for GraphQL's text field: fetch that one file raw.
      out[e.path] = b && b.text !== null && !b.isTruncated ? b.text : await blobText(c.repo, e, token);
    }
  }
  return out;
}

async function blobText(repo: string, e: TreeEntry, token: string): Promise<string> {
  const res = await gh(`/repos/${repo}/git/blobs/${e.sha}`, token, { headers: { Accept: "application/vnd.github.raw+json" } });
  if (!res.ok) throw new Error(`GitHub file ${e.path}: ${res.status}`);
  return res.text();
}

/** One file's bytes at a commit, streamed (null when it isn't there). */
export async function blobAt(c: GitHubAppConfig, sha: string, path: string): Promise<Response | null> {
  const token = await installationToken(c);
  const res = await gh(`/repos/${c.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(sha)}`, token, { headers: { Accept: "application/vnd.github.raw" } });
  if (res.status === 404) return null;
  if (!res.ok || !res.body) throw new Error(`GitHub file: ${res.status}`);
  return res;
}

export interface CommitFile {
  path: string;
  content?: string; // utf-8 text
  base64?: string; // binary (e.g. a raw export)
  delete?: boolean;
}

/** One atomic commit on top of `baseSha`; refused (MainMovedError) if the branch moved. */
export async function commit(c: GitHubAppConfig, baseSha: string, files: CommitFile[], message: string): Promise<string> {
  const token = await installationToken(c);
  const base = await ok<{ tree: { sha: string } }>(await gh(`/repos/${c.repo}/git/commits/${baseSha}`, token), "read the base commit");
  const tree: Record<string, unknown>[] = [];
  for (const f of files) {
    if (f.delete) tree.push({ path: f.path, mode: "100644", type: "blob", sha: null });
    else if (f.base64 !== undefined) {
      const blob = await ok<{ sha: string }>(
        await gh(`/repos/${c.repo}/git/blobs`, token, { method: "POST", body: JSON.stringify({ content: f.base64, encoding: "base64" }) }),
        "upload a file",
      );
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    } else tree.push({ path: f.path, mode: "100644", type: "blob", content: f.content ?? "" });
  }
  const t = await ok<{ sha: string }>(
    await gh(`/repos/${c.repo}/git/trees`, token, { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) }),
    "write the tree",
  );
  const cm = await ok<{ sha: string }>(
    await gh(`/repos/${c.repo}/git/commits`, token, { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [baseSha] }) }),
    "write the commit",
  );
  const ref = await gh(`/repos/${c.repo}/git/refs/heads/${encodeURIComponent(c.branch)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: cm.sha, force: false }),
  });
  if (ref.status === 422 || ref.status === 409) throw new MainMovedError();
  if (!ref.ok) throw new Error(`GitHub update ${c.branch}: ${ref.status} ${(await ref.text()).slice(0, 200)}`);
  return cm.sha;
}

/* ------------------------------------------------------------------ user sign-in (GitHub App user auth) */

export function githubAuthorizeUrl(clientId: string, redirectUri: string, state: string, codeChallenge: string): string {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("allow_signup", "false");
  return u.toString();
}

/** Exchanges the code, reads the login, then revokes the user token: it is never kept. */
export async function githubLogin(clientId: string, clientSecret: string, code: string, verifier: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: redirectUri }),
  });
  const t = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!t.access_token) throw new Error(`GitHub sign-in failed: ${t.error_description ?? t.error ?? res.status}`);
  try {
    const u = await ok<{ login: string }>(await gh("/user", t.access_token), "read the signed-in user");
    return u.login;
  } finally {
    await fetch(`${API}/applications/${clientId}/token`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, Accept: "application/vnd.github+json", "User-Agent": UA },
      body: JSON.stringify({ access_token: t.access_token }),
    }).catch(() => undefined);
  }
}

export async function s256(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b);
}
