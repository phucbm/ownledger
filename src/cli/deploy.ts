import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createPrivateKey, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { parse as parseJsonc } from "./jsonc.js";
import { appJwt } from "../worker/github.js";

/**
 * ownledger deploy: the user's Worker on the user's Cloudflare, reading the user's private repo through
 * the user's own GitHub App. Nothing goes through anyone else's server. Secrets go to Worker secrets only.
 */

interface Ctx {
  root: string;
  name: string;
  repo: string; // owner/name
  login: string;
  yes: boolean;
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function run(cmd: string, args: string[], cwd: string, input?: string): string {
  const r = spawnSync(cmd, args, { cwd, input, encoding: "utf8", stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${(r.stderr || r.stdout).slice(-1500)}`);
  return r.stdout;
}

const wrangler = (c: Ctx, args: string[], input?: string) => run("npx", ["wrangler", ...args], c.root, input);

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    /* printed below anyway */
  }
}

const say = (s: string) => console.log(s);

/* ------------------------------------------------------------------ steps */

function cloudflareAccount(c: Ctx, args: string[]): string {
  const given = opt(args, "--account-id") ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  let out: string;
  try {
    out = wrangler(c, ["whoami"]);
  } catch {
    say("Signing in to Cloudflare (browser)…");
    execFileSync("npx", ["wrangler", "login"], { cwd: c.root, stdio: "inherit" });
    out = wrangler(c, ["whoami"]);
  }
  if (/not authenticated/i.test(out)) {
    execFileSync("npx", ["wrangler", "login"], { cwd: c.root, stdio: "inherit" });
    out = wrangler(c, ["whoami"]);
  }
  const ids = [...out.matchAll(/│\s*(.+?)\s*│\s*([0-9a-f]{32})\s*│/g)].map((m) => ({ name: m[1]!.trim(), id: m[2]! }));
  if (given) return given;
  if (ids.length === 1) return ids[0]!.id;
  if (!ids.length) throw new Error("couldn't read your Cloudflare account id from `wrangler whoami`; pass --account-id");
  throw new Error(`several Cloudflare accounts: pass --account-id <id>\n${ids.map((x) => `  ${x.id}  ${x.name}`).join("\n")}`);
}

function readConfig(c: Ctx): Record<string, any> {
  const f = join(c.root, "wrangler.jsonc");
  return existsSync(f) ? parseJsonc(readFileSync(f, "utf8")) : {};
}

function writeConfig(c: Ctx, cfg: Record<string, any>) {
  writeFileSync(
    join(c.root, "wrangler.jsonc"),
    `// Written by \`ownledger deploy\`. No secrets here: they are Worker secrets (wrangler secret list).\n${JSON.stringify(cfg, null, 2)}\n`,
  );
}

function kvId(c: Ctx, accountId: string): string {
  const title = `ownledger-${c.name}`;
  const list = JSON.parse(wrangler(c, ["kv", "namespace", "list"]).replace(/^[^[]*/, "")) as { id: string; title: string }[];
  const hit = list.find((n) => n.title === title);
  if (hit) return hit.id;
  const out = wrangler(c, ["kv", "namespace", "create", title]);
  const m = /"?id"?\s*[:=]\s*"([0-9a-f]{32})"/.exec(out);
  if (!m) throw new Error(`couldn't read the new KV namespace id:\n${out}`);
  void accountId;
  return m[1]!;
}

function baseConfig(c: Ctx, accountId: string, kv: string, publicUrl?: string): Record<string, any> {
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    name: c.name,
    account_id: accountId,
    main: "node_modules/ownledger/dist/worker/index.js",
    compatibility_date: "2026-11-01",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    assets: {
      directory: "node_modules/ownledger/assets",
      binding: "ASSETS",
      run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/authorize", "/oauth/*", "/auth/*", "/.well-known/*"],
    },
    kv_namespaces: [{ binding: "OAUTH_KV", id: kv }],
    vars: {
      ...(publicUrl ? { PUBLIC_URL: publicUrl } : {}),
      DATA_REPO: c.repo,
      DATA_BRANCH: "main",
      ALLOWED_LOGINS: c.login,
      TIMEZONE: "Asia/Ho_Chi_Minh",
    },
    observability: { enabled: true, head_sampling_rate: 1 },
  };
}

function deployOnce(c: Ctx): string {
  say("Deploying the Worker…");
  const out = wrangler(c, ["deploy"]);
  const m = /(https:\/\/[a-z0-9.-]+\.workers\.dev)/i.exec(out);
  if (!m) throw new Error(`couldn't read the Worker URL from wrangler:\n${out.slice(-800)}`);
  return m[1]!;
}

function secretNames(c: Ctx): string[] {
  try {
    return (JSON.parse(wrangler(c, ["secret", "list", "--format", "json"]).replace(/^[^[]*/, "")) as { name: string }[]).map((s) => s.name);
  } catch {
    return [];
  }
}

interface AppCreds {
  id: number;
  slug: string;
  pem: string;
  client_id: string;
  client_secret: string;
  html_url: string;
}

/** GitHub App manifest flow: one click creates the app in the user's account, then install it on the one repo. */
async function createGitHubApp(c: Ctx, publicUrl: string): Promise<AppCreds> {
  const port = 8794;
  const state = randomBytes(16).toString("hex");
  const short = c.name.replace(/[^a-z0-9-]/gi, "-").slice(0, 20);
  const manifest = {
    name: `ownledger ${short} ${randomBytes(2).toString("hex")}`.slice(0, 34),
    url: publicUrl,
    description: `Your ownledger Worker's access to ${c.repo} (contents only), and your sign-in.`,
    hook_attributes: { url: publicUrl, active: false },
    redirect_url: `http://localhost:${port}/created`,
    callback_urls: [`${publicUrl}/oauth/callback`, `${publicUrl}/auth/callback`],
    setup_url: `http://localhost:${port}/installed`,
    public: false,
    request_oauth_on_install: false,
    default_permissions: { contents: "write", metadata: "read" },
    default_events: [],
  };
  return new Promise((resolveP, reject) => {
    let creds: AppCreds | null = null;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (url.pathname === "/") {
        res.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;max-width:34rem;margin:10vh auto">
<h2>Create your GitHub App</h2><p>On the next page GitHub shows the app (access: <b>contents</b> of the repos you pick, nothing else). Click <b>Create GitHub App</b>.</p>
<form method="post" action="https://github.com/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'><button style="font:inherit;padding:.6rem 1rem">Continue to GitHub</button></form>
<script>document.forms[0].submit()</script></body>`);
        return;
      }
      if (url.pathname === "/created") {
        if (url.searchParams.get("state") !== state) {
          res.statusCode = 400;
          return res.end("state mismatch");
        }
        const r = await fetch(`https://api.github.com/app-manifests/${url.searchParams.get("code")}/conversions`, { method: "POST", headers: { Accept: "application/vnd.github+json", "User-Agent": "ownledger-cli" } });
        if (!r.ok) {
          res.end(`GitHub refused: ${r.status}`);
          return reject(new Error(`app manifest conversion: ${r.status} ${await r.text()}`));
        }
        creds = (await r.json()) as AppCreds;
        res.statusCode = 302;
        res.setHeader("Location", `https://github.com/apps/${creds.slug}/installations/new`);
        say(`✓ GitHub App created: ${creds.slug}. Now install it: choose "Only select repositories" → ${c.repo} → Install.`);
        return res.end();
      }
      if (url.pathname === "/installed") {
        res.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;max-width:34rem;margin:10vh auto"><h2>Installed ✓</h2><p>Back to the terminal; you can close this tab.</p></body>`);
        server.close();
        if (creds) resolveP(creds);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    server.listen(port, "127.0.0.1", () => {
      const u = `http://localhost:${port}/`;
      say(`\nOpening ${u} to create your GitHub App (if the browser didn't open, open it yourself).`);
      openBrowser(u);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("timed out waiting for the GitHub App (20 min)"));
    }, 20 * 60_000).unref();
  });
}

async function waitForInstallation(appId: string, pem: string, repo: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const jwt = await appJwt(appId, pem);
    const r = await fetch(`https://api.github.com/repos/${repo}/installation`, { headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "User-Agent": "ownledger-cli" } });
    if (r.ok) {
      const inst = (await r.json()) as { id: number; repository_selection: string };
      const t = (await (await fetch(`https://api.github.com/app/installations/${inst.id}/access_tokens`, { method: "POST", headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "User-Agent": "ownledger-cli" } })).json()) as { token: string };
      const repos = (await (await fetch("https://api.github.com/installation/repositories", { headers: { Authorization: `Bearer ${t.token}`, Accept: "application/vnd.github+json", "User-Agent": "ownledger-cli" } })).json()) as { repositories: { full_name: string }[] };
      const names = repos.repositories.map((x) => x.full_name);
      say(`✓ The app can reach: ${names.join(", ")}`);
      if (inst.repository_selection === "all" || names.length > 1) say(`! The app is installed on more than ${repo}. It only ever reads ${repo}, but you can limit it on GitHub (Settings → Applications).`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`the app is not installed on ${repo} (waited 10 minutes)`);
}

/* ------------------------------------------------------------------ command */

export async function cmdDeploy(args: string[]): Promise<number> {
  const root = resolve(opt(args, "--dir") ?? ".");
  if (!existsSync(join(root, "data", "meta.yaml"))) throw new Error(`${root} has no data/meta.yaml (run inside your data repo)`);
  if (!existsSync(join(root, "node_modules", "ownledger"))) throw new Error("run `npm install` first");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string };
  const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root }).toString().trim();
  const repo = /github\.com[/:]([^/]+\/[^/.]+?)(\.git)?$/.exec(remote)?.[1];
  if (!repo) throw new Error(`origin is not a GitHub repo: ${remote}`);
  const login = opt(args, "--login") ?? execFileSync("gh", ["api", "user", "--jq", ".login"]).toString().trim();
  const c: Ctx = { root, name: opt(args, "--name") ?? pkg.name, repo, login, yes: args.includes("--yes") };
  say(`Deploying ${c.name}: data ${repo}, sign-in allowed for ${login}.`);

  const accountId = cloudflareAccount(c, args);
  say(`✓ Cloudflare account ${accountId}`);
  const kv = kvId(c, accountId);
  say(`✓ KV namespace ${kv}`);

  let cfg = readConfig(c);
  let publicUrl: string | undefined = opt(args, "--url") ?? cfg.vars?.PUBLIC_URL;
  if (!publicUrl) {
    writeConfig(c, baseConfig(c, accountId, kv));
    publicUrl = deployOnce(c);
    say(`✓ Worker URL ${publicUrl}`);
  }
  cfg = { ...baseConfig(c, accountId, kv, publicUrl), ...(cfg.routes ? { routes: cfg.routes } : {}) };
  if (cfg.vars && readConfig(c).vars?.ALLOWED_LOGINS) cfg.vars.ALLOWED_LOGINS = readConfig(c).vars.ALLOWED_LOGINS;
  writeConfig(c, cfg);

  const have = secretNames(c);
  const needApp = args.includes("--new-app") || !["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"].every((n) => have.includes(n));
  if (needApp) {
    const app = await createGitHubApp(c, publicUrl);
    const pkcs8 = createPrivateKey(app.pem).export({ type: "pkcs8", format: "pem" }).toString();
    await waitForInstallation(String(app.id), pkcs8, repo);
    const secrets = {
      GITHUB_APP_ID: String(app.id),
      GITHUB_APP_PRIVATE_KEY: pkcs8,
      GITHUB_CLIENT_ID: app.client_id,
      GITHUB_CLIENT_SECRET: app.client_secret,
      ...(have.includes("COOKIE_SECRET") ? {} : { COOKIE_SECRET: randomBytes(32).toString("base64url") }),
    };
    wrangler(c, ["secret", "bulk"], JSON.stringify(secrets));
    say(`✓ Secrets stored in the Worker (${Object.keys(secrets).join(", ")}); not written anywhere else.`);
    say(`  GitHub App: ${app.html_url}`);
  } else if (!have.includes("COOKIE_SECRET")) {
    wrangler(c, ["secret", "bulk"], JSON.stringify({ COOKIE_SECRET: randomBytes(32).toString("base64url") }));
  }

  deployOnce(c);
  const meta = await fetch(`${publicUrl}/.well-known/oauth-protected-resource/mcp`);
  say(meta.ok ? "✓ The Worker answers (OAuth metadata ok)" : `! The Worker answered ${meta.status} on its metadata URL`);

  say(`\nDone.\n  Connector (MCP):  ${publicUrl}/mcp\n  Dashboard:        ${publicUrl}/\n`);
  say("Add it in Claude: Settings → Connectors → Add custom connector → paste the connector URL → Connect, then sign in with GitHub.");
  say("ChatGPT (plans with custom connectors): Settings → Apps & Connectors → add the same URL.");
  say("\nCommit wrangler.jsonc (no secrets in it). For redeploy on every push, add a Cloudflare API token as a repo secret (see README).");
  return 0;
}
