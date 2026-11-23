import { execFileSync } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appJwt, filesAt, pemToPkcs8 } from "../src/worker/github.js";
import { startDataServer } from "../src/cli/dev.js";
import { STATEMENT_PDF_RE } from "../src/modules/cards/files.js";

describe("worker helpers", () => {
  it("GitHub App JWT from a PKCS#1 key (what GitHub hands out) verifies with the public key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem1 = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const pem8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const der8 = Buffer.from(pem8.replace(/-----[^-]+-----|\s/g, ""), "base64");
    expect(Buffer.from(pemToPkcs8(pem1)).equals(der8)).toBe(true);
    const jwt = await appJwt("12345", pem1, 1_700_000_000);
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(b!, "base64url").toString())).toEqual({ iat: 1_700_000_000 - 60, exp: 1_700_000_000 + 540, iss: "12345" });
    expect(verify("sha256", Buffer.from(`${h}.${b}`), publicKey, Buffer.from(s!, "base64url"))).toBe(true);
  });

  it("filesAt reads data files by tree + GraphQL (no tarball): PDFs by path only, batches of 100, raw fallback when truncated", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const tree = [
      { path: "data", type: "tree", sha: "d0" },
      { path: "data/meta.yaml", type: "blob", sha: "m1" },
      { path: "data/big.jsonl", type: "blob", sha: "big" },
      ...Array.from({ length: 120 }, (_, i) => ({ path: `data/ledger/x${i}.jsonl`, type: "blob", sha: `l${i}` })),
      { path: "imports/misa.mapping.yaml", type: "blob", sha: "map" },
      { path: "imports/statements/card/2026-10.pdf", type: "blob", sha: "pdf" },
      { path: "imports/statements/card/notes.txt", type: "blob", sha: "n" },
      { path: "imports/raw/20261101-x.xlsx", type: "blob", sha: "raw" },
      { path: "README.md", type: "blob", sha: "r" },
    ];
    const text = (sha: string) => (sha === "m1" ? "format: 1\nname: Ăn uống ☕\n" : `text of ${sha}`);
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://api.github.com", "")}`);
      const j = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
      if (url.endsWith("/installation")) return j({ id: 7 });
      if (url.endsWith("/access_tokens")) return j({ token: "t", expires_at: new Date(Date.now() + 3600_000).toISOString() });
      if (url.includes("/git/trees/")) return j({ tree, truncated: false });
      if (url.endsWith("/graphql")) {
        const q = JSON.parse(String(init!.body)) as { query: string };
        const repo: Record<string, unknown> = {};
        for (const m of q.query.matchAll(/(f\d+): object\(oid: "([^"]+)"\)/g)) repo[m[1]!] = m[2] === "big" ? { text: "cut", isTruncated: true } : { text: text(m[2]!), isTruncated: false };
        return j({ data: { repository: repo } });
      }
      if (url.endsWith("/git/blobs/big")) return new Response("the whole big file", { status: 200 });
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    try {
      const files = await filesAt({ appId: "1", privateKey: pem, repo: "o/r", branch: "main" }, "abc");
      expect(Object.keys(files).length).toBe(124);
      expect(files["data/meta.yaml"]).toBe("format: 1\nname: Ăn uống ☕\n");
      expect(files["data/big.jsonl"]).toBe("the whole big file");
      expect(files["imports/misa.mapping.yaml"]).toBe("text of map");
      expect(files["imports/statements/card/2026-10.pdf"]).toBe("");
      expect(files["imports/raw/20261101-x.xlsx"]).toBeUndefined();
      expect(files["README.md"]).toBeUndefined();
      expect(calls.filter((c) => c.endsWith("/graphql"))).toHaveLength(2);
      expect(calls.some((c) => c.includes("tarball") || c.includes("/pdf") || c.includes("/raw"))).toBe(false);
    } finally {
      globalThis.fetch = real;
    }
  });

  it("ownledger dev's data server lists statement PDFs by path and serves only those", async () => {
    const root = mkdtempSync(join(tmpdir(), "ol-dev-"));
    mkdirSync(join(root, "data"));
    writeFileSync(join(root, "data/meta.yaml"), "format: 1\nbase: VND\n");
    mkdirSync(join(root, "imports/statements/card"), { recursive: true });
    writeFileSync(join(root, "imports/statements/card/2026-10.pdf"), "%PDF made up");
    writeFileSync(join(root, "imports/statements/card/notes.pdf"), "x");
    writeFileSync(join(root, ".env.statements"), "PW_X=made-up");
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = startDataServer(root, port);
    try {
      await new Promise((r) => server.once("listening", r));
      const base = `http://127.0.0.1:${port}`;
      const files = (await (await fetch(`${base}/files`)).json()) as Record<string, string>;
      expect(files["imports/statements/card/2026-10.pdf"]).toBe("");
      expect(Object.keys(files).filter((p) => p.startsWith("imports/"))).toEqual(["imports/statements/card/2026-10.pdf"]);
      const ok = await fetch(`${base}/blob?path=${encodeURIComponent("imports/statements/card/2026-10.pdf")}`);
      expect(ok.status).toBe(200);
      expect(await ok.text()).toBe("%PDF made up");
      for (const bad of ["data/meta.yaml", ".env.statements", "imports/statements/card/notes.pdf", "imports/statements/../../.env.statements", "imports/statements/card/2026-11.pdf"])
        expect((await fetch(`${base}/blob?path=${encodeURIComponent(bad)}`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});
