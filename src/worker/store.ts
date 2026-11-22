import { checkFiles } from "../engine/check.js";
import type { FileMap } from "../engine/load.js";
import type { Ledger } from "../engine/types.js";
import { commit, filesAt, headSha, type CommitFile, type GitHubAppConfig } from "./github.js";
import type { Env } from "./env.js";

/** Where the data lives: the user's GitHub repo, or (in `ownledger dev`) the local folder. */
export interface DataSource {
  head(): Promise<string>;
  files(sha: string): Promise<FileMap>;
  commit(baseSha: string, files: CommitFile[], message: string): Promise<string>;
  label: string;
}

export function githubSource(env: Env): DataSource {
  const c: GitHubAppConfig = { appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY, repo: env.DATA_REPO, branch: env.DATA_BRANCH || "main" };
  return {
    label: `github.com/${c.repo}@${c.branch}`,
    head: () => headSha(c),
    files: (sha) => filesAt(c, sha),
    commit: (base, files, message) => commit(c, base, files, message),
  };
}

/** `ownledger dev`: the CLI serves the local data folder at DEV_DATA_URL. */
export function devSource(env: Env): DataSource {
  const base = env.DEV_DATA_URL!.replace(/\/$/, "");
  return {
    label: `local ${base}`,
    head: async () => (await (await fetch(`${base}/head`)).text()).trim(),
    files: async () => (await (await fetch(`${base}/files`)).json()) as FileMap,
    commit: async (baseSha, files, message) => {
      const r = await fetch(`${base}/commit`, { method: "POST", body: JSON.stringify({ baseSha, files, message }) });
      if (r.status === 409) {
        const { MainMovedError } = await import("./github.js");
        throw new MainMovedError();
      }
      if (!r.ok) throw new Error(`dev commit failed: ${r.status} ${await r.text()}`);
      return (await r.text()).trim();
    },
  };
}

export function sourceFor(env: Env): DataSource {
  return env.DEV_DATA_URL ? devSource(env) : githubSource(env);
}

export interface Snapshot {
  sha: string;
  files: FileMap;
  ledger: Ledger;
  errors: number;
  warnings: number;
}

// Parsed ledgers live in the isolate's memory (keyed by commit); raw files also in KV, so a cold isolate
// needs no GitHub tarball for a commit it has seen. Both are safe to drop: GitHub is the only store.
const memory = new Map<string, Snapshot>();
const KV_PREFIX = "ownledger:files:";

export async function snapshot(env: Env, src: DataSource, sha?: string): Promise<Snapshot> {
  const head = sha ?? (await src.head());
  const hit = memory.get(head);
  if (hit) return hit;
  let files: FileMap | null = null;
  if (!env.DEV_DATA_URL) files = (await env.OAUTH_KV.get<FileMap>(KV_PREFIX + head, "json")) ?? null;
  if (!files) {
    files = await src.files(head);
    if (!env.DEV_DATA_URL) await env.OAUTH_KV.put(KV_PREFIX + head, JSON.stringify(files), { expirationTtl: 60 * 60 * 24 * 30 });
  }
  const r = checkFiles(files);
  const snap: Snapshot = { sha: head, files, ledger: r.ledger, errors: r.errors.length, warnings: r.warnings.length };
  memory.clear(); // keep one: the newest
  memory.set(head, snap);
  return snap;
}

/* ------------------------------------------------------------------ previews */

export interface Pending {
  baseSha: string;
  files: FileMap; // changed files
  binary?: { path: string; base64: string }[]; // e.g. the raw export kept under imports/raw/
  message: string;
  summary: string[];
  created: string;
}

const PENDING = "ownledger:pending:";

export async function fingerprint(baseSha: string, files: FileMap): Promise<string> {
  const data = new TextEncoder().encode(baseSha + "\n" + JSON.stringify(Object.entries(files).sort()));
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function savePending(env: Env, p: Pending): Promise<string> {
  const fp = await fingerprint(p.baseSha, p.files);
  await env.OAUTH_KV.put(PENDING + fp, JSON.stringify(p), { expirationTtl: 3600 });
  return fp;
}

export async function takePending(env: Env, fp: string): Promise<Pending | null> {
  const p = await env.OAUTH_KV.get<Pending>(PENDING + fp, "json");
  if (p) await env.OAUTH_KV.delete(PENDING + fp);
  return p;
}

export async function applyPending(env: Env, src: DataSource, fp: string): Promise<{ sha: string; message: string; summary: string[] }> {
  const p = await env.OAUTH_KV.get<Pending>(PENDING + fp, "json");
  if (!p) throw new Error("no such preview (it expires after an hour, and works once). Preview again.");
  const head = await src.head();
  if (head !== p.baseSha) {
    await env.OAUTH_KV.delete(PENDING + fp);
    const { MainMovedError } = await import("./github.js");
    throw new MainMovedError();
  }
  // check again against the exact base (defence in depth: the preview was checked too)
  const snap = await snapshot(env, src, head);
  const r = checkFiles({ ...snap.files, ...p.files });
  if (!r.ok) throw new Error(`refused: the data would not pass check: ${r.errors[0]?.message}`);
  const sha = await src.commit(
    p.baseSha,
    [...Object.entries(p.files).map(([path, content]) => ({ path, content })), ...(p.binary ?? []).map((b) => ({ path: b.path, base64: b.base64 }))],
    p.message,
  );
  await env.OAUTH_KV.delete(PENDING + fp);
  return { sha, message: p.message, summary: p.summary };
}
