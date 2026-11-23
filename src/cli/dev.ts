import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { STATEMENT_PDF_RE, STATEMENTS_DIR } from "../modules/cards/files.js";
import { readDataDir } from "../node/files.js";
import { pkgPath } from "../node/scaffold.js";
import { openwalletFlag } from "./deploy.js";

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** data/ + imports/*.mapping.yaml, and statement PDFs by path only (""), as the Worker would read them from GitHub. */
function localFiles(root: string): Record<string, string> {
  const files = readDataDir(root);
  const imp = join(root, "imports");
  if (existsSync(imp)) for (const f of readdirSync(imp)) if (f.endsWith(".mapping.yaml")) files[`imports/${f}`] = readFileSync(join(imp, f), "utf8");
  const st = join(root, STATEMENTS_DIR);
  if (existsSync(st))
    for (const acc of readdirSync(st)) {
      if (!statSync(join(st, acc)).isDirectory()) continue;
      for (const f of readdirSync(join(st, acc))) if (STATEMENT_PDF_RE.test(`${STATEMENTS_DIR}/${acc}/${f}`)) files[`${STATEMENTS_DIR}/${acc}/${f}`] = "";
    }
  return files;
}

function headOf(files: Record<string, string>): string {
  const h = createHash("sha1");
  for (const [p, c] of Object.entries(files).sort()) h.update(p + "\0" + c + "\0");
  return h.digest("hex");
}

/** Local data server standing in for GitHub: /head, /files, /commit (writes the files, git commit if a repo). */
export function startDataServer(root: string, port: number) {
  const server = createServer((req, res) => {
    const files = localFiles(root);
    if (req.url === "/head") return res.end(headOf(files));
    if (req.url?.startsWith("/blob?")) {
      // statement PDFs only: the path must be one the listing above has
      const path = new URL(req.url, "http://x").searchParams.get("path") ?? "";
      if (!STATEMENT_PDF_RE.test(path) || files[path] === undefined) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader("Content-Type", "application/pdf");
      return res.end(readFileSync(join(root, path)));
    }
    if (req.url === "/files") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(files));
    }
    if (req.url === "/commit" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { baseSha, files: changed, message } = JSON.parse(body) as { baseSha: string; files: { path: string; content?: string; base64?: string }[]; message: string };
        if (baseSha !== headOf(files)) {
          res.statusCode = 409;
          return res.end("moved");
        }
        for (const f of changed) {
          const full = join(root, f.path);
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, f.base64 !== undefined ? Buffer.from(f.base64, "base64") : (f.content ?? ""));
        }
        if (existsSync(join(root, ".git"))) {
          try {
            execFileSync("git", ["add", ...changed.map((f) => f.path)], { cwd: root });
            execFileSync("git", ["commit", "-q", "-m", message], { cwd: root });
          } catch {
            /* nothing to commit */
          }
        }
        console.log(`[dev] committed: ${message}`);
        res.end(headOf(localFiles(root)));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(port, "127.0.0.1");
  return server;
}

export async function cmdDev(args: string[]): Promise<number> {
  const root = resolve(args.find((a) => !a.startsWith("-") && !["--port", "--login"].includes(args[args.indexOf(a) - 1] ?? "")) ?? ".");
  if (!existsSync(join(root, "data", "meta.yaml"))) throw new Error(`${root} has no data/meta.yaml (run inside your data repo)`);
  const port = Number(opt(args, "--port") ?? 8787);
  const dataPort = port + 3;
  const login = opt(args, "--login") ?? "dev";
  const ow = openwalletFlag(args);
  startDataServer(root, dataPort);
  const cfgDir = join(root, ".wrangler");
  mkdirSync(cfgDir, { recursive: true });
  const cfg = join(cfgDir, "ownledger-dev.jsonc");
  const assets = pkgPath("assets");
  writeFileSync(
    cfg,
    JSON.stringify(
      {
        name: "ownledger-dev",
        main: pkgPath("dist/worker/index.js"),
        compatibility_date: "2026-11-01",
        compatibility_flags: ["nodejs_compat"],
        ...(existsSync(assets) ? { assets: { directory: assets, binding: "ASSETS", run_worker_first: ["/api/*", "/mcp", "/authorize", "/oauth/*", "/auth/*", "/.well-known/*"] } } : {}),
        kv_namespaces: [{ binding: "OAUTH_KV", id: "ownledger-dev-kv" }],
        vars: {
          PUBLIC_URL: `http://localhost:${port}`,
          DATA_REPO: "local/dev",
          ALLOWED_LOGINS: login,
          DEV_DATA_URL: `http://127.0.0.1:${dataPort}`,
          DEV_LOGIN: login,
          GITHUB_APP_ID: "dev",
          GITHUB_APP_PRIVATE_KEY: "dev",
          GITHUB_CLIENT_ID: "dev",
          GITHUB_CLIENT_SECRET: "dev",
          COOKIE_SECRET: "dev-only-not-secret",
          ...(ow ? { OPENWALLET_URL: ow } : {}),
        },
      },
      null,
      2,
    ),
  );
  console.log(`ownledger dev: data ${root}\n  MCP        http://localhost:${port}/mcp   (sign-in skipped: ${login})\n  Dashboard  http://localhost:${port}/\n  Writes commit to the local folder${existsSync(join(root, ".git")) ? " (git)" : ""}.\n${ow ? `  OpenWallet ${ow} (best_card on)\n` : ""}`);
  const child = spawn("npx", ["wrangler", "dev", "-c", cfg, "--port", String(port), "--persist-to", join(cfgDir, "state")], { cwd: root, stdio: "inherit" });
  return new Promise((r) => child.on("exit", (code) => r(code ?? 0)));
}
