import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { todayIn } from "../engine/dates.js";
import { loadLedger } from "../engine/load.js";
import type { Ledger } from "../engine/types.js";
import { statements, type Statement } from "../modules/cards/statements.js";
import { recordFor, termsOf } from "../modules/cards/terms.js";
import { readDataDir } from "../node/files.js";
import {
  ENV_FILE,
  missingMonths,
  monthFromText,
  passwordVars,
  PdfPasswordError,
  pdfText,
  readEnvFile,
  readSources,
  scanStatements,
  STATEMENTS_DIR,
  unlockPdf,
} from "../node/statements.js";

const USAGE = `Usage:
  ownledger statements add <account-id> <file.pdf>... [--month YYYY-MM] [--dir <repo>] [--yes] [--no-commit]
      Unlock (password from ${ENV_FILE}) and file the bank's statement PDFs as ${STATEMENTS_DIR}/<account-id>/<YYYY-MM>.pdf.
      YYYY-MM is the month of the statement's close date, read from the PDF unless --month is given. Preview unless --yes.
  ownledger statements list [<account-id>] [--dir <repo>]
      Which months each card has, and which are missing between the first and the last.
  ownledger statements check <account-id> <YYYY-MM> [--dir <repo>] [--json]
      The statement's text next to ownledger's figures and transactions for the same period, to compare.`;

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
}

const positional = (args: string[]) => args.filter((a, i) => !a.startsWith("-") && !["--month", "--dir"].includes(args[i - 1] ?? ""));

function ledgerAt(root: string): Ledger {
  return loadLedger(readDataDir(root)).ledger;
}

function statementDayOf(l: Ledger, id: string): number | null {
  const a = l.accounts.find((x) => x.id === id);
  return a ? termsOf(a, recordFor(l, id)).statementDay : null;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export async function cmdStatements(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const root = resolve(opt(rest, "--dir") ?? ".");
  if (sub === "add") return add(root, rest);
  if (sub === "list") return list(root, positional(rest)[0]);
  if (sub === "check") return check(root, rest);
  console.log(USAGE);
  return 2;
}

/* ------------------------------------------------------------------ add */

interface Planned {
  file: string;
  month: string | null;
  period?: string;
  status: "new" | "same" | "different" | "error";
  note: string;
  bytes?: Uint8Array;
}

async function add(root: string, args: string[]): Promise<number> {
  const [account, ...files] = positional(args);
  if (!account || !files.length) {
    console.log(USAGE);
    return 2;
  }
  const month = opt(args, "--month");
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    console.error(`--month must be YYYY-MM (got "${month}")`);
    return 2;
  }
  if (month && files.length > 1) {
    console.error("--month goes with one file at a time");
    return 2;
  }
  const l = ledgerAt(root);
  if (!l.accounts.some((a) => a.id === account)) {
    console.error(`No account "${account}" in data/accounts.yaml.`);
    return 1;
  }
  const sd = statementDayOf(l, account);
  const sources = readSources(root);
  const env = readEnvFile(root);
  const vars = passwordVars(account, sources[account]);
  const password = vars.map((v) => env[v]).find((v) => v);

  const planned: Planned[] = [];
  for (const file of files) {
    const p: Planned = { file, month: month ?? null, status: "error", note: "" };
    planned.push(p);
    let unlocked: Uint8Array;
    try {
      unlocked = (await unlockPdf(new Uint8Array(readFileSync(file)), password)).bytes;
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        const hint = sources[account]?.password_hint;
        p.note = password
          ? `wrong password (from ${vars.find((v) => env[v])} in ${ENV_FILE})`
          : `needs a password: set ${vars.join(" or ")} in ${ENV_FILE}${hint ? ` (${hint})` : ""}`;
      } else p.note = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (!month) {
      const g = monthFromText(await pdfText(unlocked), sd);
      if (!g.month) {
        p.note = `can't tell the month (${g.why}): pass --month YYYY-MM`;
        continue;
      }
      p.month = g.month;
      p.period = `${g.from} … ${g.close}`;
    }
    if (planned.some((o) => o !== p && o.month === p.month && o.status !== "error")) {
      p.note = `another file in this run is also ${p.month}`;
      continue;
    }
    const target = join(root, STATEMENTS_DIR, account, `${p.month}.pdf`);
    if (existsSync(target)) {
      // same bytes, or the same text (a copy unlocked by another tool differs in bytes only)
      const had = readFileSync(target);
      const same = Buffer.compare(had, Buffer.from(unlocked)) === 0 || (await pdfText(new Uint8Array(had)).catch(() => null)) === (await pdfText(unlocked));
      p.status = same ? "same" : "different";
      p.note = same ? "already filed" : `a different file is already filed for ${p.month}: delete it first if this one replaces it`;
      continue;
    }
    p.status = "new";
    p.bytes = unlocked;
  }

  console.log(`Statements for ${account}:\n`);
  console.log("| file | month | period | |\n|---|---|---|---|");
  for (const p of planned) console.log(`| ${basename(p.file)} | ${p.month ?? "?"} | ${p.period ?? ""} | ${p.status === "new" ? "✓ new" : p.status === "same" ? "= " + p.note : "✗ " + p.note} |`);
  const news = planned.filter((p) => p.status === "new");
  const failed = planned.some((p) => p.status === "error" || p.status === "different");
  if (!news.length) {
    console.log("\nNothing to file.");
    return failed ? 1 : 0;
  }
  if (!args.includes("--yes")) {
    console.log(`\nPreview only: nothing written. Run again with --yes to file ${news.length} statement(s)${existsSync(join(root, ".git")) ? " and commit" : ""}.`);
    return failed ? 1 : 0;
  }
  const paths: string[] = [];
  for (const p of news) {
    const rel = `${STATEMENTS_DIR}/${account}/${p.month}.pdf`;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), p.bytes!);
    paths.push(rel);
  }
  console.log(`\n✓ Filed: ${paths.join(", ")}`);
  if (existsSync(join(root, ".git")) && !args.includes("--no-commit")) {
    const msg = `Statements: ${account} ${news.map((p) => p.month).sort().reverse().join(", ")}`;
    execFileSync("git", ["add", ...paths], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", msg], { cwd: root, stdio: "inherit" });
    console.log(`✓ Committed: ${msg}`);
  }
  return failed ? 1 : 0;
}

/* ------------------------------------------------------------------ list */

async function list(root: string, only?: string): Promise<number> {
  const l = ledgerAt(root);
  const { files, warnings } = scanStatements(root, new Set(l.accounts.map((a) => a.id)));
  const by = new Map<string, string[]>();
  for (const f of files) if (!only || f.account === only) (by.get(f.account) ?? by.set(f.account, []).get(f.account)!).push(f.month);
  if (!by.size) {
    console.log(only ? `No statements filed for ${only}.` : `No statements filed (${STATEMENTS_DIR}/<account-id>/<YYYY-MM>.pdf).`);
  } else {
    console.log("| account | statements | from | to | missing |\n|---|---|---|---|---|");
    for (const [acc, months] of [...by].sort()) {
      const s = months.sort();
      const miss = missingMonths(s);
      console.log(`| ${acc} | ${s.length} | ${s[0]} | ${s[s.length - 1]} | ${miss.join(", ") || "—"} |`);
    }
  }
  for (const w of warnings) console.log(`! ${w}`);
  return 0;
}

/* ------------------------------------------------------------------ check */

async function check(root: string, args: string[]): Promise<number> {
  const [account, month] = positional(args);
  if (!account || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    console.log(USAGE);
    return 2;
  }
  const rel = `${STATEMENTS_DIR}/${account}/${month}.pdf`;
  if (!existsSync(join(root, rel))) {
    console.error(`No statement filed at ${rel}.`);
    return 1;
  }
  const l = ledgerAt(root);
  if (!l.accounts.some((a) => a.id === account)) {
    console.error(`No account "${account}" in data/accounts.yaml.`);
    return 1;
  }
  let stmt: Statement | undefined;
  try {
    stmt = statements(l, account, todayIn()).find((s) => !s.open && s.close.slice(0, 7) === month);
  } catch {
    stmt = undefined;
  }
  const txs = stmt
    ? l.transactions
        .filter((t) => !t.void && t.date >= stmt.from && t.date <= stmt.close && t.lines.some((ln) => ln.account === account))
        .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
        .map((t) => {
          const own = t.lines.filter((ln) => ln.account === account);
          const other = t.lines.filter((ln) => ln.account !== account);
          return {
            id: t.id,
            date: t.date,
            amount: own.reduce((s, ln) => s + ln.amount, 0),
            note: [t.note, ...own.map((ln) => ln.note)].filter(Boolean).join(" · "),
            against: other.map((ln) => ln.category ?? ln.account).filter(Boolean).join(", "),
          };
        })
    : [];
  let text: string;
  try {
    text = await pdfText(new Uint8Array(readFileSync(join(root, rel))));
  } catch (e) {
    console.error(`${rel}: can't read the PDF's text (${e instanceof Error ? e.message : e}). Is it still locked? File it with \`ownledger statements add\`.`);
    return 1;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify({ account, month, file: rel, statement: stmt ?? null, transactions: txs, text }, null, 2));
    return 0;
  }
  console.log(`# ${account} statement ${month} (${rel})\n`);
  if (!stmt) console.log(`ownledger has no closed statement period for ${account} closing in ${month} (no statement_day, or no transactions then).\n`);
  else {
    console.log(`Period ${stmt.from} … ${stmt.close}${stmt.due ? `, due ${stmt.due}` : ""}. Amounts as owed (positive = you owe).\n`);
    console.log("| opening | purchases | refunds | cashback | fees | charges | payments | adjust | closing | deferred | amount due | bank's amount |\n|---|---|---|---|---|---|---|---|---|---|---|---|");
    console.log(`| ${[stmt.opening, stmt.purchases, stmt.refunds, stmt.cashback, stmt.fees, stmt.charges, stmt.payments, stmt.adjust, stmt.closing, stmt.deferred, stmt.amountDue].map(fmt).join(" | ")} | ${stmt.bank === null ? "—" : fmt(stmt.bank)} |`);
    console.log(`\n## ownledger's transactions on ${account} (${txs.length}; amount on the card: negative = spent, positive = paid/refunded)\n`);
    console.log("| date | amount | note | against | id |\n|---|---|---|---|---|");
    for (const t of txs) console.log(`| ${t.date} | ${fmt(t.amount)} | ${t.note.replace(/\|/g, "/")} | ${t.against} | ${t.id} |`);
  }
  console.log(`\n## Statement text (as extracted from the PDF)\n\n${text}`);
  return 0;
}
