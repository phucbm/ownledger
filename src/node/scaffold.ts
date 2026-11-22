import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { defaultCategories } from "../engine/defaults.js";
import type { FileMap } from "../engine/load.js";
import { FORMAT } from "../engine/types.js";

export interface ScaffoldOpts {
  name: string; // repo / worker name
  base: string; // VND
  lang: "vi" | "en";
  owner?: string; // GitHub login
  version: string; // ownledger version to depend on
}

const CURRENCY_NAMES: Record<string, string> = { VND: "Việt Nam đồng", USD: "US dollar", EUR: "Euro" };
const DECIMALS: Record<string, number> = { VND: 0, JPY: 0, KRW: 0 };

/** Absolute path of a file in the installed ownledger package (works from src/ and dist/). */
export function pkgPath(rel: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", rel);
}

export function readPkgFile(rel: string): string {
  return readFileSync(pkgPath(rel), "utf8");
}

export function pkgVersion(): string {
  return (JSON.parse(readPkgFile("package.json")) as { version: string }).version;
}

/** The files `init` writes into a new data repo. */
export function scaffold(o: ScaffoldOpts): FileMap {
  const y = (v: unknown) => stringify(v, { lineWidth: 0 });
  const files: FileMap = {
    "data/meta.yaml": y({ format: FORMAT, base: o.base, locale: o.lang, owner: o.owner ?? null, name: o.name }),
    "data/assets.yaml": y([{ id: o.base, name: CURRENCY_NAMES[o.base] ?? o.base, kind: "currency", decimals: DECIMALS[o.base] ?? 2 }]),
    "data/accounts.yaml": "[]\n",
    "data/categories.yaml": y(defaultCategories(o.lang)),
    "data/plans.yaml": "[]\n",
    "data/budgets.yaml": "[]\n",
    "data/prices.csv": "date,asset,price\n",
    "imports/raw/.gitkeep": "",
    "package.json": JSON.stringify(
      {
        name: o.name,
        private: true,
        type: "module",
        scripts: { check: "ownledger check", import: "ownledger import", deploy: "ownledger deploy", dev: "ownledger dev" },
        dependencies: { ownledger: `^${o.version}` },
      },
      null,
      2,
    ) + "\n",
    ".gitignore": "node_modules/\n.wrangler/\n.dev.vars\n.env*\n.DS_Store\n",
  };
  for (const t of ["AGENTS.md", "README.md", ".github/workflows/check.yml", ".github/dependabot.yml"]) {
    try {
      files[t] = readPkgFile(`templates/repo/${t}`).replaceAll("{{name}}", o.name);
    } catch {
      /* templates are added in later phases */
    }
  }
  return files;
}
