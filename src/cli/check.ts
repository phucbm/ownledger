import { resolve } from "node:path";
import { checkFiles } from "../engine/check.js";
import type { Issue } from "../engine/types.js";
import { readDataDir } from "../node/files.js";
import { statementWarnings } from "../node/statements.js";

export function fmtIssue(i: Issue): string {
  return `${i.level === "error" ? "✗" : "!"} ${i.file ?? ""}${i.where ? ` [${i.where}]` : ""}: ${i.message}`;
}

export async function cmdCheck(args: string[]): Promise<number> {
  const root = resolve(args.find((a) => !a.startsWith("-")) ?? ".");
  const quiet = args.includes("--quiet");
  const r = checkFiles(readDataDir(root));
  for (const e of r.errors) console.log(fmtIssue(e));
  if (!quiet) for (const w of r.warnings) console.log(fmtIssue(w));
  const stmtWarnings = await statementWarnings(root, new Set(r.ledger.accounts.map((a) => a.id)));
  if (!quiet) for (const w of stmtWarnings) console.log(`! ${w}`);
  const warned = r.warnings.length + stmtWarnings.length;
  const live = r.ledger.transactions.filter((t) => !t.void).length;
  console.log(
    r.ok
      ? `✓ ok: ${r.ledger.accounts.length} accounts, ${live} transactions${warned ? `, ${warned} warning(s)` : ""}`
      : `✗ ${r.errors.length} error(s)`,
  );
  return r.ok ? 0 : 1;
}
