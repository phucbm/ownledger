import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { checkFiles } from "../engine/check.js";
import { applyChange, yamlText, type Change } from "../engine/write.js";
import { loadLedger } from "../engine/load.js";
import { CARDS_FILE } from "../modules/cards/terms.js";
import { loadTracker } from "../modules/cards/tracker.js";
import { readDataDir } from "../node/files.js";
import { parse as parseYaml } from "yaml";
import { readdirSync } from "node:fs";
import { fmtIssue } from "./check.js";

/** ownledger cards load <tracker.csv> [dir] [--yes]: preview (default) or write data/cards.yaml and the account changes. */
export async function cmdCards(args: string[]): Promise<number> {
  const [sub, file, ...rest] = args;
  if (sub !== "load" || !file) {
    console.log("Usage: ownledger cards load <tracker.csv> [dir] [--link card=account] [--closed account=yyyy-mm-dd] [--as-debit card=account] [--yes]\n  Reads a card tracker (CSV) into data/cards.yaml and the cards' limits. Preview only unless --yes.");
    return 2;
  }
  const root = resolve(rest.find((a, i) => !a.startsWith("-") && !a.includes("=") && !["--link", "--closed", "--as-debit"].includes(rest[i - 1] ?? "")) ?? ".");
  const files = readDataDir(root);
  const imp = join(root, "imports");
  if (existsSync(imp)) for (const f of readdirSync(imp)) if (f.endsWith(".mapping.yaml")) files[`imports/${f}`] = readFileSync(join(imp, f), "utf8");
  const { ledger } = loadLedger(files);
  // the owner's answers: --link card=account, --closed account=yyyy-mm-dd, --as-debit card=account (repeatable)
  const pairs = (flag: string) => Object.fromEntries(rest.flatMap((a, i) => (a === flag && rest[i + 1]?.includes("=") ? [rest[i + 1]!.split("=") as [string, string]] : [])));
  const names: Record<string, string[]> = {};
  for (const [p, text] of Object.entries(files)) {
    if (!/^imports\/[^/]+\.mapping\.yaml$/.test(p)) continue;
    try {
      for (const [src, a] of Object.entries((parseYaml(text) as { accounts?: Record<string, { id: string; names?: string[] }> }).accounts ?? {})) (names[a.id] ??= []).push(src, ...(a.names ?? []));
    } catch {
      /* a broken mapping is reported by import */
    }
  }
  const t = loadTracker(readFileSync(file, "utf8"), ledger, { link: pairs("--link"), closed: pairs("--closed"), asDebit: pairs("--as-debit"), names });

  console.log(`Cards in the tracker: ${t.records.length} (${t.records.filter((r) => r.kind === "credit").length} credit, ${t.records.filter((r) => r.kind !== "credit").length} debit/ATM).\n`);
  console.log("| card | kind | status | account | last4 | annual fee | close fee | benefits | cancel plan |\n|---|---|---|---|---|---|---|---|---|");
  for (const r of t.records) console.log(`| ${r.name} | ${r.kind} | ${r.status}${r.cancelled ? ` ${r.cancelled}` : ""} | ${r.account ?? ""} | ${r.last4 ?? ""} | ${r.annual_fee ?? ""} | ${r.close_fee ?? ""} | ${r.benefits ?? ""} | ${r.cancel_plan?.by ?? (r.keep_for_limit ? "keep for limit" : "")} |`);
  if (t.accountUpdates.length) {
    console.log("\nAccount changes:");
    for (const u of t.accountUpdates) console.log(`  - ${u.id}: ${u.why}`);
  }
  if (t.mismatches.length) {
    console.log("\nTo confirm (not changed by this load):");
    for (const m of t.mismatches) console.log(`  - ${m}`);
  }
  if (existsSync(join(root, CARDS_FILE))) console.log(`\n! ${CARDS_FILE} exists: --yes replaces it.`);
  if (!rest.includes("--yes")) {
    console.log("\nPreview only: nothing written. Run again with --yes to write, check and commit.");
    return 0;
  }
  const change: Change = { putFiles: { [CARDS_FILE]: yamlText(t.records) }, updateAccounts: t.accountUpdates.map((u) => ({ id: u.id, set: u.set })) };
  const out = applyChange(files, change);
  for (const p of Object.keys(out)) if (p.startsWith("imports/")) delete out[p];
  const r = checkFiles({ ...files, ...out });
  if (!r.ok) {
    console.log("\n✗ The data would not pass check; nothing written:");
    for (const e of r.errors.slice(0, 30)) console.log(fmtIssue(e));
    return 1;
  }
  for (const [p, c] of Object.entries(out)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  console.log(`\n✓ Written: ${Object.keys(out).join(", ")}`);
  if (existsSync(join(root, ".git")) && !rest.includes("--no-commit")) {
    execFileSync("git", ["add", "data"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", `Cards: load the card tracker (${t.records.length} cards)`], { cwd: root, stdio: "inherit" });
    console.log("✓ Committed");
  }
  return 0;
}
