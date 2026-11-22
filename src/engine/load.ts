import { parse as parseYaml } from "yaml";
import type { Account, Asset, Budget, CategoriesFile, Issue, Ledger, Meta, Plan, Price, Transaction } from "./types.js";

/** Files of a data repo, keyed by path relative to the repo root ("data/meta.yaml"). */
export type FileMap = Record<string, string>;

export const PATHS = {
  meta: "data/meta.yaml",
  accounts: "data/accounts.yaml",
  assets: "data/assets.yaml",
  categories: "data/categories.yaml",
  plans: "data/plans.yaml",
  budgets: "data/budgets.yaml",
  prices: "data/prices.csv",
  ledgerDir: "data/ledger/",
} as const;

export const LEDGER_FILE_RE = /^data\/ledger\/(\d{4})\/(\d{2})\.jsonl$/;

export function ledgerPath(date: string): string {
  return `${PATHS.ledgerDir}${date.slice(0, 4)}/${date.slice(5, 7)}.jsonl`;
}

function yamlFile<T>(files: FileMap, path: string, fallback: T, issues: Issue[], required = false): T {
  const text = files[path];
  if (text === undefined) {
    if (required) issues.push({ level: "error", file: path, message: "missing file" });
    return fallback;
  }
  try {
    const v = parseYaml(text);
    return (v ?? fallback) as T;
  } catch (e) {
    issues.push({ level: "error", file: path, message: `YAML parse error: ${(e as Error).message.split("\n")[0]}` });
    return fallback;
  }
}

export function parsePricesCsv(text: string, issues: Issue[], file = PATHS.prices): Price[] {
  const out: Price[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (i === 0 && /^date\s*,/i.test(line)) return;
    const [date, asset, price] = line.split(",").map((s) => s.trim());
    const p = Number(price);
    if (!date || !asset || !Number.isFinite(p)) {
      issues.push({ level: "error", file, where: `line ${i + 1}`, message: `bad price row "${line}"` });
      return;
    }
    out.push({ date, asset, price: p });
  });
  return out;
}

export function parseJsonl(text: string, file: string, issues: Issue[]): Transaction[] {
  const out: Transaction[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const v = JSON.parse(line);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
      out.push(v as Transaction);
    } catch (e) {
      issues.push({ level: "error", file, where: `line ${i + 1}`, message: `bad JSON: ${(e as Error).message}` });
    }
  });
  return out;
}

export function compareTx(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time ?? "";
  const tb = b.time ?? "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return 0;
}

/** Parses every data file. Never throws: problems become issues (check adds the semantic ones). */
export function loadLedger(files: FileMap): { ledger: Ledger; issues: Issue[] } {
  const issues: Issue[] = [];
  const meta = yamlFile<Meta>(files, PATHS.meta, { format: 0, base: "VND" }, issues, true);
  const accounts = yamlFile<Account[]>(files, PATHS.accounts, [], issues, true);
  const assets = yamlFile<Asset[]>(files, PATHS.assets, [], issues);
  const categories = yamlFile<CategoriesFile>(files, PATHS.categories, { income: [], expense: [] }, issues, true);
  const plans = yamlFile<Plan[]>(files, PATHS.plans, [], issues);
  const budgets = yamlFile<Budget[]>(files, PATHS.budgets, [], issues);
  const prices = files[PATHS.prices] !== undefined ? parsePricesCsv(files[PATHS.prices]!, issues) : [];

  const transactions: Transaction[] = [];
  const txFile = new Map<string, string>();
  const ledgerFiles = Object.keys(files)
    .filter((p) => p.startsWith(PATHS.ledgerDir))
    .sort();
  for (const path of ledgerFiles) {
    if (!LEDGER_FILE_RE.test(path)) {
      issues.push({ level: "warning", file: path, message: "not a ledger file name (data/ledger/yyyy/mm.jsonl); ignored" });
      continue;
    }
    for (const tx of parseJsonl(files[path]!, path, issues)) {
      transactions.push(tx);
      if (typeof tx.id === "string") txFile.set(tx.id, path);
    }
  }
  // stable sort keeps file order for equal date+time
  transactions.sort(compareTx);

  const asArray = <T>(v: unknown, file: string): T[] => {
    if (Array.isArray(v)) return v as T[];
    issues.push({ level: "error", file, message: "expected a list" });
    return [];
  };

  return {
    ledger: {
      meta: meta && typeof meta === "object" ? meta : { format: 0, base: "VND" },
      assets: asArray<Asset>(assets, PATHS.assets),
      accounts: asArray<Account>(accounts, PATHS.accounts),
      categories: {
        income: Array.isArray(categories?.income) ? categories.income : [],
        expense: Array.isArray(categories?.expense) ? categories.expense : [],
      },
      plans: asArray<Plan>(plans, PATHS.plans),
      budgets: asArray<Budget>(budgets, PATHS.budgets),
      prices,
      transactions,
      txFile,
    },
    issues,
  };
}
