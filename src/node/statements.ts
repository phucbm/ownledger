import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { addDays } from "../engine/dates.js";
import type { ISODate } from "../engine/types.js";
import { closeOnOrAfter, prevClose } from "../modules/cards/statements.js";

/**
 * Bank statements (plan 004): imports/statements/<account-id>/<YYYY-MM>.pdf, unlocked.
 * Read on the user's computer only (CLI); the Worker never parses them.
 */
export const STATEMENTS_DIR = "imports/statements";
export const SOURCES_FILE = `${STATEMENTS_DIR}/sources.yaml`;
export const ENV_FILE = ".env.statements";
const MONTH_FILE = /^\d{4}-(0[1-9]|1[0-2])\.pdf$/;

/* ------------------------------------------------------------------ qpdf (WebAssembly) */

interface Qpdf {
  callMain(args: string[]): number;
  FS: { writeFile(p: string, d: Uint8Array): void; readFile(p: string): Uint8Array };
}

const require = createRequire(import.meta.url);

/** Runs qpdf once in a fresh instance (an Emscripten program isn't meant to run twice) on /in.pdf → /out.pdf. */
async function qpdf(args: string[], input: Uint8Array): Promise<{ rc: number; out: Uint8Array | null; err: string }> {
  const { default: createModule } = (await import("@neslinesli93/qpdf-wasm")) as unknown as { default: (o: object) => Promise<Qpdf> };
  const wasm = require.resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm");
  let err = "";
  // the build binds its output to console.log/console.error when created (print/printErr options are ignored):
  // catch it for the error message instead of letting it reach the user's terminal
  const { log, error } = console;
  console.log = () => {};
  console.error = (...a: unknown[]) => void (err += a.join(" ") + "\n");
  const exitCode = process.exitCode; // qpdf's exit sets Node's exit code; keep ours
  let rc: number;
  let q: Qpdf;
  try {
    q = await createModule({ locateFile: () => wasm, noInitialRun: true });
    q.FS.writeFile("/in.pdf", input);
    try {
      rc = q.callMain([...args, "/in.pdf", "/out.pdf"]);
    } catch (e) {
      rc = typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 2;
    }
  } finally {
    console.log = log;
    console.error = error;
    process.exitCode = exitCode;
  }
  let out: Uint8Array | null = null;
  try {
    out = q.FS.readFile("/out.pdf");
  } catch {
    /* no output */
  }
  return { rc, out, err };
}

export class PdfPasswordError extends Error {}

/**
 * The PDF without any encryption (same bytes for the same input: --deterministic-id).
 * Throws PdfPasswordError when it needs a password and none (or a wrong one) is given.
 */
export async function unlockPdf(bytes: Uint8Array, password?: string): Promise<{ bytes: Uint8Array; wasLocked: boolean }> {
  const tries = password ? [undefined, password] : [undefined];
  for (const pw of tries) {
    const r = await qpdf([...(pw ? [`--password=${pw}`] : []), "--decrypt", "--deterministic-id"], bytes);
    if (r.rc === 0 || (r.rc === 3 && r.out)) return { bytes: r.out!, wasLocked: pw !== undefined };
    if (!/invalid password/i.test(r.err)) throw new Error(`not a readable PDF (${r.err.trim().split("\n").pop() ?? `qpdf ${r.rc}`})`);
  }
  throw new PdfPasswordError(password ? "wrong password" : "the PDF needs a password");
}

/** True when the PDF can't be opened without a password. */
export async function isLocked(bytes: Uint8Array): Promise<boolean> {
  const r = await qpdf(["--decrypt"], bytes);
  return r.rc !== 0 && r.rc !== 3 && /invalid password/i.test(r.err);
}

/** The PDF's text, pages joined (pdf.js via unpdf). */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes)); // pdf.js takes over the buffer: give it a copy
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}

/* ------------------------------------------------------------------ month of a statement */

/** Every calendar date written in the text (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd, yyyy/mm/dd, yyyy.mm.dd). */
export function datesIn(text: string): Set<ISODate> {
  const out = new Set<ISODate>();
  const add = (y: string, m: string, d: string) => {
    const mm = Number(m), dd = Number(d);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) out.add(`${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
  };
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/g)) add(m[3]!, m[2]!, m[1]!);
  for (const m of text.matchAll(/(?<!\d)(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?!\d)/g)) add(m[1]!, m[2]!, m[3]!);
  return out;
}

export interface MonthGuess {
  month: string | null; // YYYY-MM of the close date
  from?: ISODate;
  close?: ISODate;
  why: string;
}

/**
 * The statement period a statement's text is about, from the card's statement day: the period whose first and
 * last days both appear in the text; else the one period whose close date appears. Never guesses between two.
 */
export function monthFromText(text: string, statementDay: number | null): MonthGuess {
  if (!statementDay) return { month: null, why: "the card has no statement_day" };
  const dates = datesIn(text);
  const periods = new Map<ISODate, ISODate>(); // close → from
  for (const d of dates) {
    const c = closeOnOrAfter(d, statementDay);
    periods.set(c, addDays(prevClose(c, statementDay), 1));
  }
  const both = [...periods].filter(([c, f]) => dates.has(c) && dates.has(f));
  const closeOnly = [...periods].filter(([c]) => dates.has(c));
  const pick = both.length ? both : closeOnly;
  if (pick.length === 1) {
    const [close, from] = pick[0]!;
    return { month: close.slice(0, 7), from, close, why: both.length ? "period dates in the text" : "close date in the text" };
  }
  if (!pick.length) return { month: null, why: "no statement period's dates found in the text" };
  return { month: null, why: `several periods fit (${pick.map(([c]) => c.slice(0, 7)).join(", ")})` };
}

/* ------------------------------------------------------------------ passwords and sources */

/** KEY=value lines of .env.statements (quotes stripped, # comments). Missing file: {}. */
export function readEnvFile(root: string): Record<string, string> {
  const p = join(root, ENV_FILE);
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

export interface StatementSource {
  from?: string;
  subject?: string;
  /** Name of the variable in .env.statements. */
  password?: string;
  /** What the password is made of (never the password). */
  password_hint?: string;
}

/** imports/statements/sources.yaml: account id → how to find its statements in email. Missing file: {}. */
export function readSources(root: string): Record<string, StatementSource> {
  const p = join(root, SOURCES_FILE);
  if (!existsSync(p)) return {};
  const y = parseYaml(readFileSync(p, "utf8")) as unknown;
  if (y === null || y === undefined) return {};
  if (typeof y !== "object" || Array.isArray(y)) throw new Error(`${SOURCES_FILE}: expected account ids as keys`);
  return y as Record<string, StatementSource>;
}

const envName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/** The variables tried for a card's password, in order: sources.yaml's, PW_<ACCOUNT_ID>, PW_<FIRST WORD>. */
export function passwordVars(account: string, source?: StatementSource): string[] {
  const out = [source?.password, `PW_${envName(account)}`, `PW_${envName(account.split(/[-_]/)[0]!)}`].filter((x): x is string => !!x);
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ files */

export interface StatementFile {
  account: string;
  month: string; // YYYY-MM
  path: string; // repo-relative
}

/** The statement PDFs on disk, and what doesn't fit the convention (warnings, never errors). */
export function scanStatements(root: string, accountIds: Set<string>): { files: StatementFile[]; warnings: string[] } {
  const dir = join(root, STATEMENTS_DIR);
  const files: StatementFile[] = [];
  const warnings: string[] = [];
  if (!existsSync(dir)) return { files, warnings };
  for (const acc of readdirSync(dir).sort()) {
    if (acc.startsWith(".")) continue;
    const p = join(dir, acc);
    if (!statSync(p).isDirectory()) {
      if (acc !== "sources.yaml" && !/^readme\.md$/i.test(acc)) warnings.push(`${STATEMENTS_DIR}/${acc}: not a statement folder (expected <account-id>/<YYYY-MM>.pdf)`);
      continue;
    }
    if (!accountIds.has(acc)) warnings.push(`${STATEMENTS_DIR}/${acc}/: no account "${acc}" in data/accounts.yaml`);
    for (const f of readdirSync(p).sort()) {
      if (f.startsWith(".")) continue;
      if (!MONTH_FILE.test(f)) warnings.push(`${STATEMENTS_DIR}/${acc}/${f}: name should be <YYYY-MM>.pdf (the month of the statement's close date)`);
      else files.push({ account: acc, month: f.slice(0, 7), path: `${STATEMENTS_DIR}/${acc}/${f}` });
    }
  }
  return { files, warnings };
}

/** Months between the first and last filed month that have no file. */
export function missingMonths(months: string[]): string[] {
  if (!months.length) return [];
  const have = new Set(months);
  const sorted = [...have].sort();
  const out: string[] = [];
  let [y, m] = sorted[0]!.split("-").map(Number) as [number, number];
  const last = sorted[sorted.length - 1]!;
  for (;;) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > last) break;
    if (!have.has(k)) out.push(k);
    m++;
    if (m > 12) (m = 1), y++;
  }
  return out;
}

/** Warnings for `ownledger check`: the convention, plus PDFs still locked. */
export async function statementWarnings(root: string, accountIds: Set<string>): Promise<string[]> {
  const { files, warnings } = scanStatements(root, accountIds);
  for (const f of files) {
    try {
      if (await isLocked(new Uint8Array(readFileSync(join(root, f.path))))) warnings.push(`${f.path}: still locked with a password (file it with \`ownledger statements add\`)`);
    } catch {
      warnings.push(`${f.path}: can't be read as a PDF`);
    }
  }
  return warnings;
}
