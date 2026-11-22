import { execFileSync } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appJwt, pemToPkcs8 } from "../src/worker/github.js";
import { untar } from "../src/worker/tar.js";

describe("worker helpers", () => {
  it("untar reads a gzipped tarball like GitHub's (top folder stripped, long names, filter)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ol-tar-"));
    const top = join(dir, "owner-repo-abc1234");
    const long = "data/ledger/2026/" + "x".repeat(120) + ".txt";
    for (const [p, c] of [["data/meta.yaml", "format: 1\n"], ["data/ledger/2026/11.jsonl", '{"id":"t1"}\n'], ["README.md", "hi"], [long, "long name"], ["data/vi.yaml", "Ăn uống ☕"]] as const) {
      mkdirSync(join(top, p, ".."), { recursive: true });
      writeFileSync(join(top, p), c);
    }
    const tgz = join(dir, "x.tgz");
    execFileSync("tar", ["--format=pax", "-czf", tgz, "-C", dir, "owner-repo-abc1234"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    const bytes = new Uint8Array(readFileSync(tgz));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const files = await untar(stream as ReadableStream<Uint8Array>, (p) => p.startsWith("data/"));
    expect(Object.keys(files).sort()).toEqual(["data/ledger/2026/11.jsonl", long, "data/meta.yaml", "data/vi.yaml"].sort());
    expect(files["data/vi.yaml"]).toBe("Ăn uống ☕");
    expect(files[long]).toBe("long name");
  });

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
});
