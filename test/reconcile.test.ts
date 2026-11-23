import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cmdStatements } from "../src/cli/statements.js";
import { checkFiles, type FileMap } from "../src/engine/index.js";
import { reconcile, type FiledStatement } from "../src/node/reconcile.js";
import { amountOf, datesOf, linesFromText, parseStatement, pdfLines, plain } from "../src/node/statement-rows.js";

// Made-up statements only: PDFs drawn here with a bank-like table (date, description, amount columns).

type Cell = [x: number, text: string];

/** A one-page PDF with lines of positioned cells (Helvetica 9pt), top to bottom. */
function tablePdf(lines: Cell[][]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const h = 60 + lines.length * 14;
  const ops = lines.flatMap((cells, i) => cells.map(([x, t]) => `BT /F1 9 Tf 1 0 0 1 ${x} ${h - 30 - i * 14} Tm (${esc(t)}) Tj ET`)).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 ${h}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`,
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

/** A statement like a Korean-Vietnamese bank's: header, "Payable amount", rows with posting date and amount. */
function statementPdf(o: { from: string; close: string; payable: string; rows: [date: string, desc: string, amount: string][] }): Uint8Array {
  return tablePdf([
    [[30, "SAMPLE BANK VIETNAM"], [380, "CREDIT CARD STATEMENT"]],
    [[30, "Statement period"], [200, `${o.from} - ${o.close}`]],
    [[30, "Payment due date"], [200, "05/12/2099"]],
    [[30, "Payable amount"], [200, o.payable]],
    [[30, "Minimum payment"], [200, "50,000"]],
    [[30, "Trans date"], [100, "Post date"], [170, "Description"], [480, "Amount (VND)"]],
    ...o.rows.map(([d, desc, a]) => [[30, d], [100, d], [170, desc], [480, a]] as Cell[]),
    [[170, "Total"], [480, "9,999,999"]],
  ]);
}

const tx = (id: string, date: string, note: string, amount: number, other: { category?: string; account?: string }) =>
  JSON.stringify({ id, date, note, lines: [{ account: "card-x", amount }, { ...other, amount: -amount }] });

const files: FileMap = {
  "data/meta.yaml": "format: 1\nbase: VND\n",
  "data/accounts.yaml": "- {id: card-x, name: Card X, type: credit_card, details: {statement_day: 20, due_day: 5}}\n- {id: bank, name: Bank, type: bank}\n- {id: cash, name: Cash, type: cash}\n",
  "data/categories.yaml": "income: [{id: cashback, name: Cashback}]\nexpense: [{id: food, name: Food}, {id: shop, name: Shop}, {id: fees, name: Fees}, {id: travel, name: Travel}]\n",
  "data/ledger/2026/09.jsonl": [
    tx("s1", "2026-09-01", "Coffee", -500000, { category: "food" }),
    tx("s2", "2026-09-05", "Shop", -1200000, { category: "shop" }),
    tx("s3", "2026-09-10", "Annual fee", -10000, { category: "fees" }),
    tx("s4", "2026-09-15", "Pay card", 700000, { account: "bank" }),
  ].join("\n") + "\n",
  "data/ledger/2026/10.jsonl": [
    tx("o1", "2026-10-02", "Book", -300000, { category: "shop" }),
    tx("o2", "2026-10-08", "Hotel", -1530000, { category: "travel" }),
    tx("o3", "2026-10-12", "Ghost", -45000, { category: "food" }),
    tx("o4", "2026-10-19", "Balance fix", -85000, { category: "_adjust" }),
    tx("o5", "2026-10-20", "Late dinner", -60000, { category: "food" }),
    JSON.stringify({ id: "o6", date: "2026-10-18", note: "Taxi", lines: [{ account: "cash", amount: -120000 }, { category: "travel", amount: 120000 }] }),
  ].join("\n") + "\n",
  "data/ledger/2026/11.jsonl": tx("n1", "2026-11-01", "Pay card", 2000000, { account: "bank" }) + "\n",
};

const SEP = { from: "21/08/2026", close: "20/09/2026", payable: "1,095,000", rows: [["01/09/2026", "COFFEE HOUSE", "500,000"], ["05/09/2026", "SHOP ONLINE", "1,200,000"], ["10/09/2026", "ANNUAL FEE", "9,091"], ["10/09/2026", "VAT ANNUAL FEE", "909"], ["12/09/2026", "GRAB RIDE", "85,000"], ["15/09/2026", "PAYMENT THANK YOU", "700,000"]] as [string, string, string][] };
const OCT = { from: "21/09/2026", close: "20/10/2026", payable: "2,865,000", rows: [["03/10/2026", "BOOK STORE", "300,000"], ["08/10/2026", "HOTEL", "1,350,000"], ["10/10/2026", "GADGET", "250,000"], ["15/10/2026", "CASHBACK GADGET", "250,000"], ["18/10/2026", "TAXI", "120,000"]] as [string, string, string][] };
const NOV = { from: "21/10/2026", close: "20/11/2026", payable: "925,000", rows: [["22/10/2026", "LATE DINNER", "60,000"], ["01/11/2026", "PAYMENT", "2,000,000 CR"]] as [string, string, string][] };

describe("statement rows: general rules", () => {
  it("reads amounts in the common forms, with credit marks", () => {
    expect(amountOf("1,234,567")).toEqual({ value: 1234567, sign: 0 });
    expect(amountOf("1.234.567")).toEqual({ value: 1234567, sign: 0 });
    expect(amountOf("1,234.00")).toEqual({ value: 1234, sign: 0 });
    expect(amountOf("909")).toEqual({ value: 909, sign: 0 });
    expect(amountOf("(50,000)")).toEqual({ value: 50000, sign: -1 });
    expect(amountOf("50,000 CR")).toEqual({ value: 50000, sign: -1 });
    expect(amountOf("-50,000")).toEqual({ value: 50000, sign: -1 });
    expect(amountOf("50,000 VND")).toEqual({ value: 50000, sign: 0, currency: "VND" });
    expect(amountOf("VND 3,000,000")).toEqual({ value: 3000000, sign: 0, currency: "VND" });
    expect(amountOf("50.000đ")).toEqual({ value: 50000, sign: 0, currency: "VND" });
    expect(amountOf("USD 10.00")).toEqual({ value: 10, sign: 0, currency: "USD" });
    expect(amountOf("CR 399,000.00")).toEqual({ value: 399000, sign: -1 });
    expect(amountOf("3,483,958 (VND)")).toEqual({ value: 3483958, sign: 0, currency: "VND" });
    expect(amountOf("GRAB 50,000")).toBeNull();
    expect(amountOf("(50,000")).toBeNull();
  });
  it("reads dates with and without a year", () => {
    expect(datesOf("03/10/2026 04/10/2026", "2026-10-20")).toEqual(["2026-10-03", "2026-10-04"]);
    expect(datesOf("28/12", "2027-01-20")).toEqual(["2026-12-28"]);
    expect(datesOf("2026-10-03", "2026-10-20")).toEqual(["2026-10-03"]);
  });
  it("matches Vietnamese words without their marks", () => {
    expect(plain("Hoàn tiền Thẻ")).toBe("hoan tien the");
  });
  it("finds rows, the closing figure by label, credits by mark, word and column; skips header lines", () => {
    const lines = linesFromText([
      "Statement date  20/10/2026",
      "Tổng số tiền phải thanh toán  1.234.000",
      "Ngày GD      Mô tả                       Ghi nợ        Ghi có",
      "03/10/2026   BOOK STORE                 300.000",
      "05/10/2026   HOÀN TIỀN ĐƠN HÀNG                       100.000",
      "06/10/2026   SOMETHING   USD 10.00      250.000",
      "07/10/2026   CASHBACK                    25.000",
      "Total   9.999.999",
    ].join("\n"));
    const p = parseStatement(lines, { from: "2026-09-21", close: "2026-10-20" });
    expect(p.closing).toBe(1234000);
    expect(p.rows.map((r) => [r.date, r.amount, r.credit ?? ""])).toEqual([
      ["2026-10-03", -300000, ""],
      ["2026-10-05", 100000, "column"],
      ["2026-10-06", -250000, ""],
      ["2026-10-07", 25000, "word"],
    ]);
  });
  it("a layout with the amount first (amount_column: 1), a points column last, VND-prefixed figures; foreign amounts are skipped", () => {
    const lines = linesFromText([
      "Current Points  278,591  Payable amount / Số tiền thanh toán  VND 4,211,082",
      "2025.08.03  2025.08.06  SHOP A  VND 33,300  0  33,300  1,665",
      "2025.08.05  2025.08.07  SHOP ABROAD  USD 10.00  0  262,000  13,100",
      "2025.08.27  2025.08.29  Sms Service Monthly Fee(VAT)  VND 909  0  909",
      "2025.08.21  2025.08.21  Payment(Virtual Account)  VND 5,379,500  0",
      "Projected Interest-2025.09.25  0",
    ].join("\n"));
    const p = parseStatement(lines, { from: "2025-08-01", close: "2025-08-31" }, { amount_column: 1 }, "VND");
    expect(p.closing).toBe(4211082);
    expect(p.rows.map((r) => [r.date, r.amount])).toEqual([["2025-08-03", -33300], ["2025-08-05", 0 - 262000], ["2025-08-27", -909], ["2025-08-21", 5379500]]);
  });
  it("a description wrapped onto the lines around the row; CR before the amount; the currency column is not the description; the period line is not a row", () => {
    const lines = linesFromText([
      "21/06/2025 - 20/07/2025   100,000",
      "Retail VNM Q PHU NHUAN",
      "21/06/25  24/06/25  -722,520.00  VND  722,520.00",
      "MPOS*HARU SUSHI",
      "22/06/25  24/06/25  Retail Foody  -34,000.00  VND  34,000.00",
      "04/07/25  04/07/25  Nộp tiền vào tài khoản thẻ  399,000.00  VND  CR 399,000.00",
    ].join("\n"));
    const p = parseStatement(lines, { from: "2025-06-21", close: "2025-07-20" }, {}, "VND");
    expect(p.rows.map((r) => [r.date, r.amount, r.description])).toEqual([
      ["2025-06-21", -722520, "Retail VNM Q PHU NHUAN MPOS*HARU SUSHI"],
      ["2025-06-22", -34000, "Retail Foody"],
      ["2025-07-04", 399000, "Nộp tiền vào tài khoản thẻ"],
    ]);
  });
  it("closing figure: a label with the figure on its line, never the minimum payment below it", () => {
    const lines = linesFromText("Dư nợ cuối kỳ  3,483,958 (VND)\nStatement balance\nThanh toán tối thiểu\n174,198 (VND)\n");
    expect(parseStatement(lines, { from: "2025-09-06", close: "2025-10-05" }, {}, "VND").closing).toBe(3483958);
    const below = linesFromText("Statement balance\nThanh toán tối thiểu\n174,198 (VND)\n");
    expect(parseStatement(below, { from: "2025-09-06", close: "2025-10-05" }, {}, "VND").closing).toBeNull();
  });
  it("sources.yaml fields: closing_label, credit_words, skip_words", () => {
    const lines = linesFromText("Số tiền cần trả  500.000\n03/10/2026  NẠP TIỀN  200.000\n04/10/2026  PHÍ DỊCH VỤ ẨN  9.000\n");
    const p = parseStatement(lines, { from: "2026-09-21", close: "2026-10-20" }, { closing_label: "Số tiền cần trả", credit_words: ["nạp tiền"], skip_words: ["phí dịch vụ ẩn"] });
    expect(p.closing).toBe(500000);
    expect(p.rows).toEqual([{ date: "2026-10-03", amount: 200000, description: "NẠP TIỀN", credit: "word", line: 1 }]);
  });
  it("keeps the columns of a generated PDF", async () => {
    const lines = await pdfLines(statementPdf(SEP));
    const row = lines.find((l) => l.some((c) => c.text === "GRAB RIDE"))!;
    expect(row.map((c) => c.text)).toEqual(["12/09/2026", "12/09/2026", "GRAB RIDE", "85,000"]);
    const p = parseStatement(lines, { from: "2026-08-21", close: "2026-09-20" });
    expect(p.closing).toBe(1095000);
    expect(p.rows).toHaveLength(6);
    expect(p.rows.find((r) => r.description === "PAYMENT THANK YOU")!.amount).toBe(700000);
  });
});

describe("reconcile", () => {
  const L = checkFiles(files).ledger;
  const filed = async (): Promise<FiledStatement[]> => {
    const out: FiledStatement[] = [];
    for (const [month, s, period] of [["2026-09", SEP, { from: "2026-08-21", close: "2026-09-20" }], ["2026-10", OCT, { from: "2026-09-21", close: "2026-10-20" }], ["2026-11", NOV, { from: "2026-10-21", close: "2026-11-20" }]] as const) {
      const p = parseStatement(await pdfLines(statementPdf(s)), period);
      out.push({ month, path: `imports/statements/card-x/${month}.pdf`, rows: p.rows, closing: p.closing });
    }
    return out;
  };

  it("finds missing rows, a typo, the wrong account, an adjustment, a ledger-only row, fee+VAT and net 0", async () => {
    const r = reconcile(L, "card-x", await filed(), "2026-11-23");
    expect(r.missing.map((x) => [x.date, x.amount, x.description])).toEqual([["2026-09-12", -85000, "GRAB RIDE"]]);
    expect(r.missing[0]!.hint).toEqual({ op: "add", date: "2026-09-12", kind: "expense", amount: 85000, account: "card-x", note: "GRAB RIDE", category: null });
    expect(r.amountDiffs.map((x) => [x.ledger.id, x.statement.amount])).toEqual([["o2", -1350000]]);
    expect(r.amountDiffs[0]!.hint).toEqual({ op: "edit", id: "o2", amount: 1350000 });
    expect(r.otherAccount.map((x) => [x.ledger.id, x.ledger.account, x.hint])).toEqual([["o6", "cash", { op: "edit", id: "o6", account: "card-x" }]]);
    expect(r.adjustments.map((x) => x.id)).toEqual(["o4"]);
    expect(r.notOnStatement.map((x) => x.id)).toEqual(["o3"]);
    expect(r.joined).toEqual([{ statement: [expect.objectContaining({ amount: -9091 }), expect.objectContaining({ amount: -909 })], ledger: [expect.objectContaining({ id: "s3" })] }]);
    expect(r.netZero.map((z) => z.map((x) => x.amount))).toEqual([[-250000, 250000]]);
  });

  it("per month: bank against ledger, the change, and the part that is timing", async () => {
    const r = reconcile(L, "card-x", await filed(), "2026-11-23");
    const m = Object.fromEntries(r.months.map((x) => [x.month, x]));
    // Sep: the missing Grab ride
    expect(m["2026-09"]).toMatchObject({ bank: 1095000, ledger: 1010000, diff: -85000, timing: 0, missing: 1, bankFrom: "pdf" });
    // Oct: + hotel typo 180,000 + ghost 45,000 + adjustment 85,000 + late dinner 60,000 (timing) − taxi 120,000 on cash
    expect(m["2026-10"]!.diff).toBe(-85000 + 180000 + 45000 + 85000 + 60000 - 120000);
    expect(m["2026-10"]!.timing).toBe(60000);
    expect(m["2026-10"]!.change).toBe(180000 + 45000 + 85000 + 60000 - 120000);
    // Nov: the late dinner is on both now
    expect(m["2026-11"]!.timing).toBe(0);
    expect(m["2026-11"]!.diff).toBe(-85000 + 180000 + 45000 + 85000 - 120000);
  });

  it("joins a purchase with its DCC fee and VAT booked as one ledger row", () => {
    const l = checkFiles({ ...files, "data/ledger/2026/09.jsonl": tx("d1", "2026-09-08", "Hosting", -258151, { category: "shop" }) + "\n", "data/ledger/2026/10.jsonl": "", "data/ledger/2026/11.jsonl": "" }).ledger;
    const rows = [{ date: "2026-09-08", amount: -255343, description: "HOSTING", line: 1 }, { date: "2026-09-08", amount: -2553, description: "DCC FEE", line: 2 }, { date: "2026-09-08", amount: -255, description: "DCC VAT", line: 3 }];
    const r = reconcile(l, "card-x", [{ month: "2026-09", path: "x.pdf", rows, closing: 258151 }], "2026-11-23");
    expect(r.missing).toEqual([]);
    expect(r.joined[0]!.statement).toHaveLength(3);
    expect(r.months[0]!.diff).toBe(0);
  });
  it("a filed month the ledger has no period for is listed with the reason; the saved bank figure is used when the PDF has none", async () => {
    const f = await filed();
    f[1] = { ...f[1]!, closing: null };
    const withSaved = checkFiles({ ...files, "data/cards/statements.yaml": "- {account: card-x, statement_date: 2026-10-20, amount: 2865000}\n" }).ledger;
    const r = reconcile(withSaved, "card-x", [...f, { month: "2025-01", path: "x.pdf", rows: [], closing: null }], "2026-11-23");
    expect(r.months.find((x) => x.month === "2026-10")).toMatchObject({ bank: 2865000, bankFrom: "saved" });
    expect(r.months.find((x) => x.month === "2025-01")!.error).toMatch(/no closed statement period/);
  });
});

describe("ownledger statements reconcile (CLI)", () => {
  function repo(): string {
    const dir = mkdtempSync(join(tmpdir(), "ol-rec-"));
    for (const [p, c] of Object.entries(files)) {
      mkdirSync(join(dir, p, ".."), { recursive: true });
      writeFileSync(join(dir, p), c);
    }
    mkdirSync(join(dir, "imports/statements/card-x"), { recursive: true });
    writeFileSync(join(dir, "imports/statements/card-x/2026-09.pdf"), statementPdf(SEP));
    writeFileSync(join(dir, "imports/statements/card-x/2026-10.pdf"), statementPdf(OCT));
    writeFileSync(join(dir, "imports/statements/card-x/2026-11.pdf"), statementPdf(NOV));
    return dir;
  }
  const run = async (args: string[]) => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
    const err = vi.spyOn(console, "error").mockImplementation((...a) => void logs.push(a.join(" ")));
    try {
      return { code: await cmdStatements(args), out: logs.join("\n") };
    } finally {
      spy.mockRestore();
      err.mockRestore();
    }
  };

  it("prints the table and the lists; --json is data; --from/--to narrow it", async () => {
    const dir = repo();
    const t = await run(["reconcile", "card-x", "--dir", dir]);
    expect(t.code).toBe(0);
    expect(t.out).toMatch(/\| 2026-09 \| 2026-08-21 … 2026-09-20 \| 6 \| 1,095,000 \| 1,010,000 \| -85,000 \|/);
    expect(t.out).toMatch(/GRAB RIDE/);
    expect(t.out).toMatch(/Never add a balance adjustment/);
    const j = await run(["reconcile", "card-x", "--dir", dir, "--json"]);
    const data = JSON.parse(j.out);
    expect(data.missing).toHaveLength(1);
    const one = JSON.parse((await run(["reconcile", "card-x", "--dir", dir, "--json", "--from", "2026-09", "--to", "2026-09"])).out);
    expect(one.months.map((m: { month: string }) => m.month)).toEqual(["2026-09"]);
  });

  it("--save-bank-amounts previews, then saves and commits with --yes", async () => {
    const dir = repo();
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
    const p = await run(["reconcile", "card-x", "--dir", dir, "--save-bank-amounts"]);
    expect(p.out).toMatch(/Preview only/);
    expect(() => readFileSync(join(dir, "data/cards/statements.yaml"))).toThrow();
    const y = await run(["reconcile", "card-x", "--dir", dir, "--save-bank-amounts", "--yes"]);
    expect(y.code).toBe(0);
    expect(readFileSync(join(dir, "data/cards/statements.yaml"), "utf8")).toMatch(/statement_date: 2026-10-20\n {2}amount: 2865000/);
    const again = await run(["reconcile", "card-x", "--dir", dir, "--save-bank-amounts"]);
    expect(again.out).toMatch(/nothing new to save/);
  });
});
