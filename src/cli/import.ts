import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { checkFiles } from "../engine/check.js";
import { loadLedger } from "../engine/load.js";
import { applyChange } from "../engine/write.js";
import { parseMapping } from "../import/mapping.js";
import { profileText, profileWorkbook } from "../import/profile.js";
import { runImport, type ImportResult } from "../import/run.js";
import { readWorkbook } from "../import/workbook.js";
import { readDataDir } from "../node/files.js";
import { readPkgFile } from "../node/scaffold.js";
import { fmtIssue } from "./check.js";

const n = (x: number | null) => (x === null ? "—" : Math.round(x).toLocaleString("en-US"));

export function importReport(r: ImportResult, verbose = false): string {
  const out: string[] = [];
  out.push(`Source "${r.source}": ${r.rows} rows read.`);
  out.push(`New transactions: ${r.transactions.length}. Already imported: ${r.skipped}. New accounts: ${r.accounts.length}${r.accounts.length ? ` (${r.accounts.map((a) => `${a.id}:${a.type}`).join(", ")})` : ""}.`);
  const bad = r.reconcile.filter((x) => !x.ok);
  out.push("", `Reconcile against the source's own figures: ${r.reconcile.length - bad.length}/${r.reconcile.length} accounts match.`);
  const show = verbose ? r.reconcile : bad;
  if (show.length) {
    out.push("", "| sheet | account | rows | opening | in | out | closing (source) | closing (imported) | rounding | ok |", "|---|---|---|---|---|---|---|---|---|---|");
    for (const x of show) out.push(`| ${x.sheet} | ${x.account} | ${x.rows} | ${n(x.source.opening)} | ${n(x.source.in)} | ${n(x.source.out)} | ${n(x.source.closing)} | ${n(x.imported.closing)} | ${x.rounding} | ${x.ok ? "✓" : "✗ " + x.problems.join("; ")} |`);
  }
  if (r.zeroed.length) out.push("", `Closed accounts set to 0 on their closing date (_adjust): ${r.zeroed.map((z) => `${z.account} ${z.amount > 0 ? "+" : ""}${z.amount}`).join(", ")}`);
  if (r.rounding.length) out.push("", `Rounding to whole units booked as _adjust: ${r.rounding.map((x) => `${x.sheet} ${x.diff > 0 ? "+" : ""}${x.diff}`).join(", ")}`);
  if (r.unpaired.length) {
    out.push("", `Transfers with no other side in the file (booked against the unmatched account, ${r.unpaired.length}):`);
    for (const u of r.unpaired.slice(0, 50)) out.push(`  - ${u.sheet} row ${u.row}: ${u.date} ${u.time ?? ""} ${n(u.amount)} "${u.note}"`);
  }
  if (r.unresolvedCategories.length) {
    out.push("", "✗ Source categories not in the mapping (add them to `categories`):");
    for (const u of r.unresolvedCategories) out.push(`  - "${u.key}" (${u.rows} rows, e.g. ${u.example})`);
  }
  if (r.unresolvedRows.length) {
    out.push("", `✗ Rows with no category that are not transfers (add \`uncategorized\` rules, ${r.unresolvedRows.length}):`);
    for (const u of r.unresolvedRows.slice(0, 50)) out.push(`  - ${u.sheet} row ${u.row}: ${u.date} ${n(u.amount)} "${u.note}"`);
  }
  if (r.replace.length) out.push("", `Derived opening/rounding transactions updated: ${r.replace.length}`);
  if (r.changed.length) {
    out.push("", `! Rows already imported whose content changed in the source (not applied; decide by hand, ${r.changed.length}):`);
    for (const c of r.changed.slice(0, 30)) out.push(`  - ${c.id}: was ${c.was} now ${c.now}`);
  }
  if (r.gone.length) {
    out.push("", `! Imported earlier but no longer in the source file (not removed; ${r.gone.length}):`);
    for (const g of r.gone.slice(0, 30)) out.push(`  - ${g.id} ${g.date} "${g.note ?? ""}"`);
  }
  for (const e of r.errors) out.push(`✗ ${e}`);
  out.push("", r.ok ? "✓ Import is complete and reconciles." : "✗ Import refused: fix the mapping (or the file) and run again.");
  return out.join("\n");
}

function findMapping(root: string, explicit?: string): string | null {
  if (explicit) return resolve(explicit);
  const dir = join(root, "imports");
  if (!existsSync(dir)) return null;
  const maps = readdirSync(dir).filter((f) => f.endsWith(".mapping.yaml"));
  if (maps.length === 1) return join(dir, maps[0]!);
  if (maps.length > 1) throw new Error(`several mappings in imports/ (${maps.join(", ")}): pass --mapping <file>`);
  return null;
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
}

export async function cmdImport(args: string[]): Promise<number> {
  const positional = args.filter((a, i) => !a.startsWith("-") && !["--mapping", "--dir", "--preset"].includes(args[i - 1] ?? ""));
  const file = positional[0];
  const root = resolve(opt(args, "--dir") ?? ".");
  if (!file) {
    console.error("Usage: ownledger import <export file> [--profile] [--preset misa] [--mapping imports/x.mapping.yaml] [--yes] [--verbose]");
    return 2;
  }
  const data = new Uint8Array(readFileSync(file));
  const wb = readWorkbook(file, data);

  const preset = opt(args, "--preset");
  if (preset) {
    const target = join(root, "imports", `${preset}.mapping.yaml`);
    if (existsSync(target)) console.log(`${target} exists; not overwritten.`);
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readPkgFile(`presets/${preset}.mapping.yaml`));
      console.log(`Wrote ${target} from the ${preset} preset. Fill accounts, categories and uncategorized, then run the import again.`);
    }
  }

  const mappingPath = findMapping(root, opt(args, "--mapping"));
  if (args.includes("--profile") || preset || !mappingPath) {
    console.log(profileText(profileWorkbook(wb)));
    if (!mappingPath)
      console.log(
        "No mapping yet. Write imports/<source>.mapping.yaml from this profile (see AGENTS.md, \"First import of a new app\"), have the owner review accounts and categories, then run `ownledger import <file>` again.",
      );
    return 0;
  }

  const mapping = parseMapping(readFileSync(mappingPath, "utf8"));
  const files = readDataDir(root);
  const { ledger } = loadLedger(files);
  const r = runImport(wb, mapping, ledger);
  console.log(importReport(r, args.includes("--verbose")));
  if (!r.ok) return 1;
  if (!r.transactions.length && !r.accounts.length && !r.replace.length) {
    console.log("Nothing new to import.");
    return 0;
  }
  if (!args.includes("--yes")) {
    console.log("\nPreview only: nothing written. Run again with --yes to write, check and commit.");
    return 0;
  }

  // write: build the new files in memory, check them, then write and commit
  const change = applyChange(files, { addAccounts: r.accounts, addTransactions: r.transactions, replaceTransactions: r.replace });
  const result = checkFiles({ ...files, ...change });
  if (!result.ok) {
    console.log("\n✗ The data would not pass check after this import; nothing written:");
    for (const e of result.errors.slice(0, 30)) console.log(fmtIssue(e));
    return 1;
  }
  for (const [p, c] of Object.entries(change)) {
    const f = join(root, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c);
  }
  const rawDir = join(root, "imports", "raw");
  mkdirSync(rawDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const raw = join(rawDir, `${stamp}-${basename(file)}`);
  if (!existsSync(raw)) copyFileSync(file, raw);
  console.log(`\n✓ Written: ${Object.keys(change).length} data file(s), raw copy at ${raw}.`);
  if (existsSync(join(root, ".git")) && !args.includes("--no-commit")) {
    const msg = `Import ${mapping.source}: ${r.transactions.length} transaction(s)${r.accounts.length ? `, ${r.accounts.length} account(s)` : ""}`;
    execFileSync("git", ["add", "data", "imports"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", msg], { cwd: root, stdio: "inherit" });
    console.log(`✓ Committed: ${msg}`);
  }
  return 0;
}
