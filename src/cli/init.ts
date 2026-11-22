import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { scaffold } from "../node/scaffold.js";

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
}

function sh(cmd: string, args: string[], cwd?: string): string | null {
  try {
    return execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

export async function cmdInit(args: string[]): Promise<number> {
  const yes = args.includes("--yes") || !process.stdin.isTTY;
  const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, def: string) => {
    if (!rl) return def;
    const a = (await rl.question(`${q} [${def}]: `)).trim();
    return a || def;
  };
  try {
    const flagged = new Set(["--base", "--lang", "--owner", "--dep"]);
    const positional = args.filter((a, i) => !a.startsWith("-") && !flagged.has(args[i - 1] ?? ""));
    const name = positional[0] ?? (await ask("Folder and repo name", "my-money"));
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("name: letters, digits, . _ - only");
    const dir = resolve(name);
    if (existsSync(dir) && readdirSync(dir).filter((f) => f !== ".git").length) throw new Error(`${dir} exists and is not empty`);
    const base = (opt(args, "--base") ?? (await ask("Base currency", "VND"))).toUpperCase();
    const lang = (opt(args, "--lang") ?? (await ask("Category language (vi/en)", "vi"))) === "en" ? "en" : "vi";
    const owner = opt(args, "--owner") ?? sh("gh", ["api", "user", "--jq", ".login"]) ?? undefined;
    const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version as string;

    const files = scaffold({ name, base, lang, owner, version });
    const dep = opt(args, "--dep"); // e.g. file:../ownledger during development
    if (dep) {
      const pkg = JSON.parse(files["package.json"]!);
      pkg.dependencies.ownledger = dep;
      files["package.json"] = JSON.stringify(pkg, null, 2) + "\n";
    }
    for (const [p, c] of Object.entries(files)) {
      const f = join(dir, p);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, c);
    }
    console.log(`✓ Created ${dir} (${Object.keys(files).length} files). Base ${base}, categories in ${lang}${owner ? `, owner ${owner}` : ""}.`);

    if (!existsSync(join(dir, ".git"))) {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
      execFileSync("git", ["add", "-A"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "ownledger init"], { cwd: dir });
      console.log("✓ git repo with a first commit");
    }
    const wantGh = !args.includes("--no-github") && sh("gh", ["auth", "status"]) !== null;
    if (wantGh) {
      const go = yes ? args.includes("--github") : /^y/i.test(await ask(`Create a PRIVATE GitHub repo ${owner ?? ""}/${name} and push?`, "y"));
      if (go) {
        execFileSync("gh", ["repo", "create", name, "--private", "--source", dir, "--push"], { stdio: "inherit" });
        console.log("✓ private GitHub repo created and pushed");
      }
    }
    console.log(`\nNext:\n  cd ${name}\n  npm install\n  npx ownledger import <your export>   # profile → mapping → import\n  npx ownledger deploy                # your Worker on your Cloudflare`);
    return 0;
  } finally {
    rl?.close();
  }
}
