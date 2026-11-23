import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { todayIn } from "../engine/dates.js";
import { loadLedger } from "../engine/load.js";
import type { Ledger } from "../engine/types.js";
import { statements, type Statement } from "../modules/cards/statements.js";
import { recordFor, termsOf } from "../modules/cards/terms.js";
import { readDataDir } from "../node/files.js";
import { plan } from "../engine/actions.js";
import { yamlText } from "../engine/write.js";
import { STATEMENTS_FILE, withBankAmounts } from "../modules/cards/terms.js";
import { reconcile, type FiledStatement, type ReconcileResult } from "../node/reconcile.js";
import { linesText, parseStatement, pdfLines } from "../node/statement-rows.js";
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
      One statement's rows and text (columns kept) next to ownledger's figures and transactions for the same period.
  ownledger statements reconcile <account-id> [--from YYYY-MM] [--to YYYY-MM] [--dir <repo>] [--json] [--save-bank-amounts [--yes]]
      Every filed statement of the card against the ledger: the bank's closing figure next to ownledger's per month,
      rows missing on the ledger, ledger rows on no statement, typos, rows on the wrong account, balance adjustments.
      Reports only. --json is shaped for one \`batch\` call. --save-bank-amounts saves each month's bank figure
      (data/cards/statements.yaml): preview unless --yes.`;

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
}

const positional = (args: string[]) => args.filter((a, i) => !a.startsWith("-") && !["--month", "--dir", "--from", "--to"].includes(args[i - 1] ?? ""));

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
  if (sub === "reconcile") return reconcileCmd(root, rest);
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
  let parsed: ReturnType<typeof parseStatement> | null = null;
  try {
    const lines = await pdfLines(new Uint8Array(readFileSync(join(root, rel))));
    text = linesText(lines);
    if (stmt) parsed = parseStatement(lines, stmt, readSources(root)[account], l.meta.base);
  } catch (e) {
    console.error(`${rel}: can't read the PDF's text (${e instanceof Error ? e.message : e}). Is it still locked? File it with \`ownledger statements add\`.`);
    return 1;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify({ account, month, file: rel, statement: stmt ?? null, transactions: txs, bank_closing: parsed?.closing ?? null, rows: parsed?.rows ?? [], text }, null, 2));
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
  if (parsed) {
    console.log(`\n## Rows read from the statement (${parsed.rows.length}; same signs as above)${parsed.closing !== null ? `, bank's closing figure ${fmt(parsed.closing)} ("${parsed.closingLabel}")` : ", no closing figure found (set closing_label in sources.yaml)"}\n`);
    console.log("| date | amount | description |\n|---|---|---|");
    for (const r of parsed.rows) console.log(`| ${r.date} | ${fmt(r.amount)} | ${r.description.replace(/\|/g, "/")} |`);
  }
  console.log(`\n## Statement text (columns kept)\n\n${text}`);
  console.log(`\nTo check every statement of the card at once: ownledger statements reconcile ${account}`);
  return 0;
}

/* ------------------------------------------------------------------ reconcile */

async function reconcileCmd(root: string, args: string[]): Promise<number> {
  const [account] = positional(args);
  const fromM = opt(args, "--from");
  const toM = opt(args, "--to");
  if (!account || [fromM, toM].some((m) => m !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(m))) {
    console.log(USAGE);
    return 2;
  }
  const files = readDataDir(root);
  const l = loadLedger(files).ledger;
  if (!l.accounts.some((a) => a.id === account)) {
    console.error(`No account "${account}" in data/accounts.yaml.`);
    return 1;
  }
  if (!statementDayOf(l, account)) {
    console.error(`${account} has no statement_day: set it (edit_account details.statement_day) so statement periods are known.`);
    return 1;
  }
  const asOf = todayIn();
  const periods = new Map(statements(l, account, asOf).filter((s) => !s.open).map((s) => [s.close.slice(0, 7), s]));
  const layout = readSources(root)[account];
  const list = scanStatements(root, new Set([account])).files.filter((f) => f.account === account && (!fromM || f.month >= fromM) && (!toM || f.month <= toM));
  if (!list.length) {
    console.error(`No statements filed for ${account}${fromM || toM ? " in that range" : ""} (${STATEMENTS_DIR}/${account}/<YYYY-MM>.pdf). File them with \`ownledger statements add\`.`);
    return 1;
  }
  const filed: FiledStatement[] = [];
  for (const f of list) {
    const p = periods.get(f.month);
    try {
      const lines = await pdfLines(new Uint8Array(readFileSync(join(root, f.path))));
      const parsed = p ? parseStatement(lines, p, layout, l.meta.base) : { rows: [], closing: null };
      filed.push({ month: f.month, path: f.path, rows: parsed.rows, closing: parsed.closing });
    } catch (e) {
      filed.push({ month: f.month, path: f.path, rows: [], closing: null, error: `can't read the PDF (${e instanceof Error ? e.message : e}); still locked? file it with \`ownledger statements add\`` });
    }
  }
  const r = reconcile(l, account, filed, asOf);

  if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else printReconcile(r);

  if (args.includes("--save-bank-amounts")) return saveBankAmounts(root, files, l, r, args.includes("--yes"));
  return 0;
}

function printReconcile(r: ReconcileResult): void {
  const sign = (n: number | null) => (n === null ? "—" : n > 0 ? `+${fmt(n)}` : fmt(n));
  console.log(`# ${r.account}: ${r.months.length} statement(s), ${r.from} … ${r.to}\n`);
  console.log("Amounts on the card like the ledger: negative = spent, positive = paid back / refunded / cashback. Gap = ownledger − bank.\n");
  console.log("| month | period | rows | bank | ownledger | gap | of which timing | change | missing | |\n|---|---|---|---|---|---|---|---|---|---|");
  for (const m of r.months) {
    const note = m.error ?? (m.diff && m.timing === m.diff ? "timing only: rows on the other side of the close date" : m.bankFrom === "saved" ? "bank figure from data/cards/statements.yaml" : m.bank === null ? "no closing figure found: set closing_label in sources.yaml" : "");
    console.log(`| ${m.month} | ${m.from ? `${m.from} … ${m.close}` : ""} | ${m.rows} | ${m.bank === null ? "—" : fmt(m.bank)} | ${m.ledger === null ? "—" : fmt(m.ledger)} | ${m.diff ? sign(m.diff) : m.diff === 0 ? "✓" : "—"} | ${m.timing ? sign(m.timing) : ""} | ${m.change ? sign(m.change) : ""} | ${m.missing || ""} | ${note} |`);
  }
  console.log(`\nMatched ${r.matched} row(s).`);
  const row = (x: { date: string; amount: number; description?: string; note?: string }) => `${x.date}  ${fmt(x.amount).padStart(12)}  ${(x.description ?? x.note ?? "").slice(0, 70)}`;
  if (r.missing.length) {
    console.log(`\n## On a statement, not on the ledger (${r.missing.length}, total ${fmt(r.missing.reduce((s, x) => s + x.amount, 0))})\n`);
    for (const x of r.missing) console.log(`- ${row(x)}  (${x.month})`);
  }
  if (r.amountDiffs.length) {
    console.log(`\n## Different amount (${r.amountDiffs.length}): statement → ledger\n`);
    for (const x of r.amountDiffs) console.log(`- ${x.statement.date} ${fmt(x.statement.amount)} → ledger ${x.ledger.date} ${fmt(x.ledger.amount)} "${x.ledger.note}" (${x.ledger.id})`);
  }
  if (r.otherAccount.length) {
    console.log(`\n## Probably booked on another account (${r.otherAccount.length})\n`);
    for (const x of r.otherAccount) console.log(`- ${row(x.statement)} → on ${x.ledger.account}: ${x.ledger.date} "${x.ledger.note}" (${x.ledger.id})`);
  }
  if (r.notOnStatement.length) {
    console.log(`\n## On the ledger, on no statement (${r.notOnStatement.length}, total ${fmt(r.notOnStatement.reduce((s, x) => s + x.amount, 0))})\n`);
    for (const x of r.notOnStatement) console.log(`- ${row(x)}  [${x.against}] (${x.id})`);
  }
  if (r.adjustments.length) {
    console.log(`\n## Balance adjustments covering a gap (${r.adjustments.length}): replace them with the real rows above\n`);
    for (const x of r.adjustments) console.log(`- ${row(x)} (${x.id})`);
  }
  if (r.joined.length) {
    console.log(`\n## Matched as a sum (${r.joined.length}): fine, shown so you know\n`);
    for (const j of r.joined) console.log(`- statement ${j.statement.map((x) => `${x.date} ${fmt(x.amount)}`).join(" + ")} = ledger ${j.ledger.map((x) => `${x.date} ${fmt(x.amount)}`).join(" + ")}`);
  }
  if (r.netZero.length) {
    console.log(`\n## Missing but net 0 (${r.netZero.length}): a purchase and its refund/cashback, both not on the ledger\n`);
    for (const z of r.netZero) console.log(`- ${z.map((x) => `${x.date} ${fmt(x.amount)} ${x.description.slice(0, 40)}`).join("  +  ")}`);
  }
  const clean = !r.missing.length && !r.amountDiffs.length && !r.otherAccount.length && !r.notOnStatement.length && !r.adjustments.length && r.months.every((m) => !m.diff || m.diff === m.timing);
  console.log(clean ? "\n✓ Every statement agrees with the ledger." : "\nNext: propose the fixes to the owner as ONE batch (connector `batch`, or --json for the hints). Never add a balance adjustment to cover a gap.");
}

function saveBankAmounts(root: string, files: Record<string, string>, l: Ledger, r: ReconcileResult, yes: boolean): number {
  const set = r.months.filter((m) => m.bank !== null && m.bankFrom === "pdf" && m.close).map((m) => ({ account: r.account, statement_date: m.close, amount: m.bank! }));
  const had = new Map(withBankAmounts(l, []).map((x) => [`${x.account}|${x.statement_date}`, x.amount]));
  const changes = set.filter((x) => had.get(`${x.account}|${x.statement_date}`) !== x.amount);
  if (!changes.length) {
    console.log("\nBank amounts: nothing new to save.");
    return 0;
  }
  const p = plan(files, { putFiles: { [STATEMENTS_FILE]: yamlText(withBankAmounts(l, changes)) } }, `Card statements: ${r.account} bank amounts ${changes.map((x) => x.statement_date.slice(0, 7)).join(", ")}`);
  console.log(`\nBank amounts to save in ${STATEMENTS_FILE} (${changes.length}):`);
  for (const x of changes) console.log(`- ${x.statement_date}: ${fmt(x.amount)}${had.has(`${x.account}|${x.statement_date}`) ? ` (was ${fmt(had.get(`${x.account}|${x.statement_date}`)!)})` : ""}`);
  if (!yes) {
    console.log("\nPreview only: nothing written. Run again with --save-bank-amounts --yes after the owner's go.");
    return 0;
  }
  for (const [path, content] of Object.entries(p.files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  console.log(`✓ Saved ${STATEMENTS_FILE}`);
  if (existsSync(join(root, ".git"))) {
    execFileSync("git", ["add", ...Object.keys(p.files)], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", p.message], { cwd: root, stdio: "inherit" });
    console.log(`✓ Committed: ${p.message.split("\n")[0]}`);
  }
  return 0;
}
