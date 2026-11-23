import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cmdStatements } from "../src/cli/statements.js";
import {
  datesIn,
  isLocked,
  missingMonths,
  monthFromText,
  passwordVars,
  PdfPasswordError,
  pdfText,
  readEnvFile,
  scanStatements,
  statementWarnings,
  unlockPdf,
} from "../src/node/statements.js";

// Made-up statements only: tiny PDFs written here, one locked with a made-up password.

/** A one-page PDF showing the given lines (Helvetica), with a correct xref table. */
function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const stream = `BT /F1 10 Tf 14 TL 20 180 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** Locks a PDF with qpdf (WebAssembly), AES-256. */
async function lockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const require = createRequire(import.meta.url);
  const { default: createModule } = (await import("@neslinesli93/qpdf-wasm")) as unknown as { default: (o: object) => Promise<{ callMain(a: string[]): number; FS: { writeFile(p: string, d: Uint8Array): void; readFile(p: string): Uint8Array } }> };
  const { error } = console;
  console.error = () => {};
  const q = await createModule({ locateFile: () => require.resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm"), noInitialRun: true });
  console.error = error;
  q.FS.writeFile("/in.pdf", bytes);
  const code = process.exitCode;
  q.callMain(["--encrypt", `--user-password=${password}`, "--owner-password=owner", "--bits=256", "--", "/in.pdf", "/out.pdf"]);
  process.exitCode = code;
  return q.FS.readFile("/out.pdf");
}

const OCT = ["Made-up Bank card statement", "Statement period 2026.10.01 - 2026.10.31", "2026.10.12 Coffee 45,000"];
const SEP = ["Made-up Bank card statement", "Period 01/09/2026 - 30/09/2026", "12/09/2026 Books 120,000"];

describe("statement dates", () => {
  it("reads the common date forms", () => {
    expect([...datesIn("2026.10.01 01/09/2026 2026-08-05 5.7.2026 2026/06/30 99/99/2026")].sort()).toEqual(["2026-06-30", "2026-07-05", "2026-08-05", "2026-09-01", "2026-10-01"]);
  });
  it("picks the period whose first and last days are both in the text", () => {
    expect(monthFromText(OCT.join("\n"), 31)).toMatchObject({ month: "2026-10", from: "2026-10-01", close: "2026-10-31" });
    expect(monthFromText(SEP.join("\n"), 31)).toMatchObject({ month: "2026-09" });
    // statement day 20: the period 21/09 … 20/10
    expect(monthFromText("From 21/09/2026 to 20/10/2026, sent 25/10/2026", 20)).toMatchObject({ month: "2026-10", from: "2026-09-21", close: "2026-10-20" });
  });
  it("never guesses between two periods", () => {
    expect(monthFromText("31/10/2026 and 30/09/2026", 31).month).toBeNull();
    expect(monthFromText("no dates here", 31).month).toBeNull();
    expect(monthFromText(OCT.join("\n"), null).month).toBeNull();
  });
  it("lists the months missing between the first and last", () => {
    expect(missingMonths(["2025-11", "2026-02", "2025-12"])).toEqual(["2026-01"]);
    expect(missingMonths([])).toEqual([]);
  });
  it("tries sources.yaml's variable, then PW_<ACCOUNT_ID>, then PW_<FIRST WORD>", () => {
    expect(passwordVars("woori-gold")).toEqual(["PW_WOORI_GOLD", "PW_WOORI"]);
    expect(passwordVars("acme-gold", { password: "PW_ACME_PERSONAL" })).toEqual(["PW_ACME_PERSONAL", "PW_ACME_GOLD", "PW_ACME"]);
  });
});

describe("unlocking and reading PDFs", () => {
  it("unlocks with the right password, refuses a wrong or missing one", async () => {
    const plain = makePdf(OCT);
    const locked = await lockPdf(plain, "010190");
    expect(await isLocked(locked)).toBe(true);
    expect(await isLocked(plain)).toBe(false);
    await expect(unlockPdf(locked)).rejects.toBeInstanceOf(PdfPasswordError);
    await expect(unlockPdf(locked, "nope")).rejects.toBeInstanceOf(PdfPasswordError);
    const a = await unlockPdf(locked, "010190");
    const b = await unlockPdf(locked, "010190");
    expect(a.wasLocked).toBe(true);
    expect(Buffer.compare(Buffer.from(a.bytes), Buffer.from(b.bytes))).toBe(0); // same input, same bytes
    expect(await isLocked(a.bytes)).toBe(false);
    expect(await pdfText(a.bytes)).toContain("2026.10.31");
    expect(process.exitCode ?? 0).toBe(0);
  }, 30000);
  it("refuses a file that isn't a PDF", async () => {
    await expect(unlockPdf(new TextEncoder().encode("hello"))).rejects.toThrow(/not a readable PDF/);
  });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "ownledger-stmt-"));
  mkdirSync(join(root, "data"));
  writeFileSync(join(root, "data/meta.yaml"), "format: 1\nbase: VND\n");
  writeFileSync(join(root, "data/categories.yaml"), "income: []\nexpense: [{id: food, name: Food}]\n");
  writeFileSync(join(root, "data/accounts.yaml"), "- {id: bank, name: Bank, type: bank}\n- {id: acme-gold, name: Acme Gold, type: credit_card, details: {statement_day: 31, due_day: 15}}\n");
  mkdirSync(join(root, "data/ledger/2026"), { recursive: true });
  writeFileSync(join(root, "data/ledger/2026/10.jsonl"), JSON.stringify({ id: "t1", date: "2026-10-12", note: "Coffee", lines: [{ account: "acme-gold", amount: -45000 }, { category: "food", amount: 45000 }] }) + "\n");
  return root;
}

async function quiet<T>(f: () => Promise<T>): Promise<{ value: T; out: string }> {
  const log = console.log, err = console.error;
  let out = "";
  console.log = console.error = (...a: unknown[]) => void (out += a.join(" ") + "\n");
  try {
    return { value: await f(), out };
  } finally {
    console.log = log;
    console.error = err;
  }
}

describe("ownledger statements", () => {
  it("previews, files, then says already filed; refuses a different file for the same month", async () => {
    const root = repo();
    const dl = mkdtempSync(join(tmpdir(), "ownledger-dl-"));
    writeFileSync(join(dl, "oct.pdf"), await lockPdf(makePdf(OCT), "010190"));
    writeFileSync(join(dl, "sep.pdf"), makePdf(SEP));
    writeFileSync(join(dl, "oct-other.pdf"), makePdf([...OCT, "another line"]));

    // no password yet: says which variable to set
    let r = await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "oct.pdf"), "--dir", root]));
    expect(r.value).toBe(1);
    expect(r.out).toMatch(/PW_ACME_GOLD or PW_ACME in \.env\.statements/);

    writeFileSync(join(root, ".env.statements"), "# made up\nPW_ACME='010190'\n");
    expect(readEnvFile(root)).toEqual({ PW_ACME: "010190" });
    r = await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "oct.pdf"), join(dl, "sep.pdf"), "--dir", root]));
    expect(r.value).toBe(0);
    expect(r.out).toMatch(/2026-10 \| 2026-10-01 … 2026-10-31 \| ✓ new/);
    expect(r.out).toMatch(/Preview only/);
    expect(existsSync(join(root, "imports/statements"))).toBe(false);

    r = await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "oct.pdf"), join(dl, "sep.pdf"), "--dir", root, "--yes"]));
    expect(r.value).toBe(0);
    const filed = readFileSync(join(root, "imports/statements/acme-gold/2026-10.pdf"));
    expect(await isLocked(new Uint8Array(filed))).toBe(false);
    expect(existsSync(join(root, "imports/statements/acme-gold/2026-09.pdf"))).toBe(true);

    r = await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "oct.pdf"), "--dir", root, "--yes"]));
    expect(r.value).toBe(0);
    expect(r.out).toMatch(/already filed/);

    r = await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "oct-other.pdf"), "--dir", root, "--yes"]));
    expect(r.value).toBe(1);
    expect(r.out).toMatch(/different file is already filed/);
    expect(Buffer.compare(readFileSync(join(root, "imports/statements/acme-gold/2026-10.pdf")), filed)).toBe(0);

    // --month when the text doesn't tell
    writeFileSync(join(dl, "blank.pdf"), makePdf(["nothing dated"]));
    r = await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "blank.pdf"), "--dir", root]));
    expect(r.out).toMatch(/can't tell the month/);
    r = await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "blank.pdf"), "--dir", root, "--month", "2026-07", "--yes"]));
    expect(existsSync(join(root, "imports/statements/acme-gold/2026-07.pdf"))).toBe(true);

    r = await quiet(() => cmdStatements(["list", "--dir", root]));
    expect(r.out).toMatch(/\| acme-gold \| 3 \| 2026-07 \| 2026-10 \| 2026-08 \|/);

    r = await quiet(() => cmdStatements(["check", "acme-gold", "2026-10", "--dir", root, "--json"]));
    const j = JSON.parse(r.out) as { statement: { from: string; purchases: number }; transactions: { id: string; amount: number }[]; text: string };
    expect(j.statement).toMatchObject({ from: "2026-10-01", purchases: 45000 });
    expect(j.transactions).toEqual([expect.objectContaining({ id: "t1", amount: -45000 })]);
    expect(j.text).toContain("Coffee 45,000");
  }, 60000);

  it("commits one commit per run in a git repo", async () => {
    const root = repo();
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
    const dl = mkdtempSync(join(tmpdir(), "ownledger-dl-"));
    writeFileSync(join(dl, "a.pdf"), makePdf(OCT));
    writeFileSync(join(dl, "b.pdf"), makePdf(SEP));
    const env = { ...process.env };
    process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "t";
    process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "t@example.com";
    try {
      await quiet(() => cmdStatements(["add", "acme-gold", join(dl, "a.pdf"), join(dl, "b.pdf"), "--dir", root, "--yes"]));
    } finally {
      process.env = env;
    }
    expect(execFileSync("git", ["log", "-1", "--format=%s"], { cwd: root, encoding: "utf8" }).trim()).toBe("Statements: acme-gold 2026-10, 2026-09");
  }, 60000);

  it("warns on files that don't fit, and on locked PDFs", async () => {
    const root = repo();
    const dir = join(root, "imports/statements");
    mkdirSync(join(dir, "acme-gold"), { recursive: true });
    mkdirSync(join(dir, "nobody"), { recursive: true });
    writeFileSync(join(dir, "acme-gold/2026-10.pdf"), await lockPdf(makePdf(OCT), "x"));
    writeFileSync(join(dir, "acme-gold/oct.pdf"), makePdf(OCT));
    writeFileSync(join(dir, "README.md"), "notes");
    writeFileSync(join(dir, "sources.yaml"), "acme-gold: {from: statements@acme.example}\n");
    const ids = new Set(["acme-gold", "bank"]);
    expect(scanStatements(root, ids).files.map((f) => f.path)).toEqual(["imports/statements/acme-gold/2026-10.pdf"]);
    const w = await statementWarnings(root, ids);
    expect(w).toHaveLength(3);
    expect(w.join("\n")).toMatch(/nobody\/: no account "nobody"/);
    expect(w.join("\n")).toMatch(/oct\.pdf: name should be <YYYY-MM>\.pdf/);
    expect(w.join("\n")).toMatch(/2026-10\.pdf: still locked/);
  }, 30000);
});
