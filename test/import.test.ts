import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyChange, checkFiles, holdingsAt, loadLedger, type FileMap } from "../src/engine/index.js";
import { parseMapping } from "../src/import/mapping.js";
import { profileWorkbook } from "../src/import/profile.js";
import { excelSheetName, parseAmount, parseDate, runImport } from "../src/import/run.js";
import { readCsv, readWorkbook } from "../src/import/workbook.js";
import { scaffold } from "../src/node/scaffold.js";

const dir = join(import.meta.dirname, "..", "fixtures", "misa");
const wb = readWorkbook("x.xlsx", new Uint8Array(readFileSync(join(dir, "bang-ke-demo.xlsx"))));
const wbNewer = readWorkbook("x.xlsx", new Uint8Array(readFileSync(join(dir, "bang-ke-demo-newer.xlsx"))));
const mapping = parseMapping(readFileSync(join(dir, "misa.mapping.yaml"), "utf8"));
const empty = scaffold({ name: "test-money", base: "VND", lang: "vi", version: "0.0.0" });

function importInto(files: FileMap, w = wb) {
  const { ledger } = loadLedger(files);
  const r = runImport(w, mapping, ledger);
  const next = { ...files, ...applyChange(files, { addAccounts: r.accounts, addTransactions: r.transactions, replaceTransactions: r.replace }) };
  return { r, next };
}

describe("readers", () => {
  it("reads the xlsx sheets, names and cells", () => {
    expect(wb.sheets.map((s) => s.name)).toEqual(["cash", "vcb visa _1234 🗓️20💸5 hạn mức", "gửi 6 tháng từ 01_07_2025", "momo", "momo_4", "chứng chỉ quỹ"]);
    expect(wb.sheets[0]!.rows[9]![1]).toBe("Ngày");
  });
  it("csv with quotes, semicolons and BOM", () => {
    const w = readCsv('﻿date;note;amount\n2026-01-02;"a; ""b""";-1.000,5\n');
    expect(w.sheets[0]!.rows).toEqual([["date", "note", "amount"], ["2026-01-02", 'a; "b"', "-1.000,5"]]);
    expect(parseAmount("-1.000,5", ",")).toBe(-1000.5);
    expect(parseAmount("(2,500)")).toBe(-2500);
  });
  it("dates", () => {
    expect(parseDate("05/01/2025", "dd/mm/yyyy")).toBe("2025-01-05");
    expect(parseDate("01/05/2025", "mm/dd/yyyy")).toBe("2025-01-05");
    expect(parseDate(45658, undefined)).toBe("2025-01-01");
    expect(parseDate("31/02/2025", "dd/mm/yyyy")).toBeNull();
  });
  it("excel sheet names", () => {
    expect(excelSheetName("gửi 6 tháng từ 01/07/2025")).toBe("gửi 6 tháng từ 01_07_2025");
  });
  it("profile spots MISA, headers and transfer notes", () => {
    const p = profileWorkbook(wb);
    expect(p.hints.join(" ")).toMatch(/MISA/);
    expect(p.sheets[0]!.headerRow).toBe(10);
    expect(p.sheets[0]!.figures["Số dư đầu kì"]).toBe(100000);
    expect(JSON.stringify(p.emptyColumnNotes)).toMatch(/Chuyển tới <name>/);
  });
});

describe("MISA-shaped import", () => {
  const { r, next } = importInto(empty);

  it("reconciles every sheet exactly and pairs transfers", () => {
    expect(r.errors).toEqual([]);
    expect(r.unresolvedCategories).toEqual([]);
    expect(r.unresolvedRows).toEqual([]);
    expect(r.reconcile.every((x) => x.ok)).toBe(true);
    expect(r.ok).toBe(true);
    // the one transfer to a wallet not in the file is listed, not dropped
    expect(r.unpaired.map((u) => u.note)).toEqual(["Chuyển tới ví không có trong file"]);
    const transfers = r.transactions.filter((t) => t.lines.every((l) => l.account));
    // cash→momo, cash→card, cash→deposit, deposit→cash, cash→fund, cash→gold, plus the unpaired one
    expect(transfers.length).toBe(7);
    const dep = transfers.find((t) => t.note?.startsWith("Gửi tiết kiệm"))!;
    expect(dep.lines.map((l) => l.account)).toEqual(["cash", "dep-20250701"]);
    expect(dep.note).toBe("Gửi tiết kiệm tài khoản gửi 6 tháng từ 01/07/2025");
  });

  it("result passes check and balances equal the source's closing balances", () => {
    const c = checkFiles(next);
    expect(c.errors).toEqual([]);
    const h = holdingsAt(c.ledger);
    for (const x of r.reconcile) expect(h.get(x.account)!.amount).toBe(Math.round(x.source.closing!));
    expect(h.get("import-unmatched")!.amount).toBe(70000);
    expect(h.get("gold")!.amount).toBe(17000000); // "account:" target: a move, not spending
    // float noise rounded: deposit closes at 0 after rounding interest and settlement
    expect(h.get("dep-20250701")!.amount).toBe(0);
  });

  it("keeps who, event, identical rows and income without category", () => {
    const c = checkFiles(next).ledger;
    expect(c.transactions.find((t) => t.note === "Đám cưới")!.who).toBe("Bạn A");
    expect(c.transactions.find((t) => t.note === "Xe")!.event).toBe("Đà Lạt 2026");
    expect(c.transactions.filter((t) => t.note === "Phở" && t.time === "12:30").length).toBe(2);
    expect(c.transactions.find((t) => t.note === "Bán đồ cũ")!.lines[1]!.category).toBe("other-income");
    // a rule on the note wins over the source category (unmapped "Khoản chi bí ẩn" is never looked up)
    expect(c.transactions.find((t) => t.note === "Điều chỉnh số dư tài khoản")!.lines[1]!.category).toBe("_adjust");
  });

  it("running twice changes nothing; a newer export adds only the new rows", () => {
    const again = importInto(next);
    expect(again.r.transactions).toEqual([]);
    expect(again.r.accounts).toEqual([]);
    expect(again.r.replace).toEqual([]);
    expect(again.r.skipped).toBe(r.transactions.length);
    const newer = importInto(next, wbNewer);
    expect(newer.r.ok).toBe(true);
    expect(newer.r.transactions.map((t) => t.note).sort()).toEqual(["Bún", "Tên miền"]);
    expect(newer.r.gone).toEqual([]);
    expect(newer.r.changed).toEqual([]);
    expect(checkFiles(newer.next).ok).toBe(true);
  });

  it("unpaired rules and zero_closed", () => {
    const m2 = {
      ...mapping,
      zero_closed: true,
      unpaired: [{ wallet: "không có trong file", category: "other" }],
      accounts: { ...mapping.accounts, momo: { ...mapping.accounts.momo!, closed: "2025-01-31" } },
    };
    const r2 = runImport(wb, m2, loadLedger(empty).ledger);
    expect(r2.ok).toBe(true);
    expect(r2.unpaired).toEqual([]);
    expect(r2.accounts.some((a) => a.id === "import-unmatched")).toBe(false);
    expect(r2.zeroed).toEqual([{ account: "momo", date: "2025-01-31", amount: -4780000 }]);
    const next = { ...empty, ...applyChange(empty, { addAccounts: r2.accounts, addTransactions: r2.transactions }) };
    const c = checkFiles(next);
    expect(c.ok).toBe(true);
    expect(holdingsAt(c.ledger).get("momo")!.amount).toBe(0);
  });

  it("refuses when a category is not mapped", () => {
    const m2 = { ...mapping, categories: { ...mapping.categories } };
    delete m2.categories["Hoá đơn/Internet"];
    const r2 = runImport(wb, m2, loadLedger(empty).ledger);
    expect(r2.ok).toBe(false);
    expect(r2.unresolvedCategories.map((u) => u.key)).toEqual(["Hoá đơn/Internet"]);
  });
});
