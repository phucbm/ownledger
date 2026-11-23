import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ActionError, addAccount, batch, addCategory, addPlan, addPrice, addTransaction, checkFiles, editAccount, editCategory, editTransaction,
  holdingsAt, voidTransaction, type FileMap,
} from "../src/engine/index.js";
import { readDataDir } from "../src/node/files.js";

const demo = readDataDir(join(import.meta.dirname, "..", "fixtures", "demo"));
const after = (files: FileMap, out: FileMap) => checkFiles({ ...files, ...out }).ledger;

describe("actions", () => {
  it("adds an expense in the simple form, into the right month file", () => {
    const p = addTransaction(demo, { date: "2026-11-18", kind: "expense", amount: 168500, account: "card-visa", category: "food/eating-out", note: "Lunch" });
    expect(Object.keys(p.files)).toEqual(["data/ledger/2026/11.jsonl"]);
    const l = after(demo, p.files);
    const t = l.transactions.find((x) => x.note === "Lunch")!;
    expect(t.lines).toEqual([{ account: "card-visa", amount: -168500 }, { category: "food/eating-out", amount: 168500 }]);
    expect(t.id).toMatch(/^t_[0-9a-f]{14}$/);
  });
  it("refuses what check would refuse", () => {
    expect(() => addTransaction(demo, { date: "2026-11-18", kind: "expense", amount: 1, account: "nope", category: "food" })).toThrow(ActionError);
    expect(() => addTransaction(demo, { date: "2026-11-18", lines: [{ account: "cash", amount: -5 }, { category: "food", amount: 4 }] })).toThrow(/balance/);
    expect(() => addTransaction(demo, { date: "18/11/2026", kind: "expense", amount: 1, account: "cash", category: "food" })).toThrow(/yyyy-mm-dd/);
  });
  it("transfer, edit (moving months) and void", () => {
    const p = addTransaction(demo, { date: "2026-11-02", kind: "transfer", amount: 1000000, account: "vcb", to_account: "cash", note: "ATM" });
    const files = { ...demo, ...p.files };
    const id = after(demo, p.files).transactions.find((t) => t.note === "ATM")!.id;
    const e = editTransaction(files, id, { date: "2026-10-30", amount: 2000000 });
    expect(Object.keys(e.files).sort()).toEqual(["data/ledger/2026/10.jsonl", "data/ledger/2026/11.jsonl"]);
    const l = after(files, e.files);
    const t = l.transactions.find((x) => x.id === id)!;
    expect(t.date).toBe("2026-10-30");
    expect(t.lines).toEqual([{ account: "vcb", amount: -2000000 }, { account: "cash", amount: 2000000 }]);
    const v = voidTransaction({ ...files, ...e.files }, id);
    expect(after({ ...files, ...e.files }, v.files).transactions.find((x) => x.id === id)!.void).toBe(true);
  });
  it("accounts: add, edit, close; unknown types are fine", () => {
    const a = addAccount(demo, { id: "pension", name: "Pension", type: "pension_fund", details: { x: 1 } });
    expect(a.warnings.map((w) => w.message).join()).toMatch(/unknown type/);
    const files = { ...demo, ...a.files };
    expect(files["data/accounts.yaml"]).toContain("pension_fund");
    const c = editAccount(files, "pension", { closed: "2026-11-01" });
    expect(after(files, c.files).accounts.find((x) => x.id === "pension")!.closed).toBe("2026-11-01");
    expect(() => editAccount(files, "nope", { name: "x" })).toThrow(/no account/);
  });
  it("plans and prices", () => {
    const p = addPlan(demo, { id: "p-laptop", kind: "instalment", account: "card-visa", principal: 30000000, count: 6, every: "month", start: "2026-12-20" });
    expect(after(demo, p.files).plans.some((x) => x.id === "p-laptop")).toBe(true);
    const pr = addPrice(demo, { date: "2026-11-20", asset: "GOLD_CHI", price: 8800000 });
    expect(pr.files["data/prices.csv"]).toMatch(/2026-11-20,GOLD_CHI,8800000\n$/);
  });
  it("categories: add, rename, move with remap of every line and budget", () => {
    const a = addCategory(demo, { kind: "expense", parent: "food", id: "snacks", name: "Ăn vặt" });
    const files = { ...demo, ...a.files };
    expect(checkFiles(files).ok).toBe(true);
    const before = checkFiles(demo).ledger.transactions.filter((t) => t.lines.some((l) => l.category === "food/cafe")).length;
    const m = editCategory(files, "food", { new_path: "eat", name: "Ăn" });
    const l = after(files, m.files);
    expect(l.transactions.filter((t) => t.lines.some((x) => x.category === "eat/cafe")).length).toBe(before);
    expect(l.transactions.some((t) => t.lines.some((x) => x.category?.startsWith("food")))).toBe(false);
    expect(l.budgets.find((b) => b.amount === 4000000)!.category).toBe("eat");
    // balances unchanged by a remap
    expect(holdingsAt(l).get("cash")).toEqual(holdingsAt(checkFiles(demo).ledger).get("cash"));
  });
  it("trail: each add/edit/void through a client is recorded on the row and in the commit message", () => {
    const m = { via: "mcp", client: "Claude", at: "2026-11-22T08:55:59Z" };
    const a = addTransaction(demo, { date: "2026-11-21", kind: "income", amount: 1500000, account: "cash", category: "other-income", note: "Share" }, { ...m, reason: "  Phương sent 1.5m\n for the shared plan " });
    expect(a.message).toBe("Add: 2026-11-21 Share\n\nReason: Phương sent 1.5m for the shared plan\nVia: mcp (Claude)");
    const files = { ...demo, ...a.files };
    const id = after(demo, a.files).transactions.find((t) => t.note === "Share")!.id;
    const e = editTransaction(files, id, { amount: 1600000 }, { ...m, reason: "it was 1.6m" });
    const f2 = { ...files, ...e.files };
    const v = voidTransaction(f2, id, "duplicate", { ...m, reason: "duplicate" });
    const t = after(f2, v.files).transactions.find((x) => x.id === id)!;
    expect(t.trail).toEqual([
      { op: "add", at: m.at, via: "mcp", client: "Claude", reason: "Phương sent 1.5m for the shared plan" },
      { op: "edit", at: m.at, via: "mcp", client: "Claude", reason: "it was 1.6m" },
      { op: "void", at: m.at, via: "mcp", client: "Claude", reason: "duplicate" },
    ]);
    expect(t.void_reason).toBe("duplicate");
    expect(() => addTransaction(demo, { date: "2026-11-21", kind: "expense", amount: 1, account: "cash", category: "food" }, { via: "mcp", reason: "x".repeat(201) })).toThrow(/too long/);
  });
  it("trail: no meta means no trail and the old commit message; a malformed trail fails check", () => {
    const a = addTransaction(demo, { date: "2026-11-21", kind: "expense", amount: 1, account: "cash", category: "food", note: "Plain" });
    expect(a.message).toBe("Add: 2026-11-21 Plain");
    expect(after(demo, a.files).transactions.find((t) => t.note === "Plain")!.trail).toBeUndefined();
    const bad = a.files["data/ledger/2026/11.jsonl"]!.replace('"note":"Plain"', '"note":"Plain","trail":[{"op":"add"}]');
    expect(checkFiles({ ...demo, "data/ledger/2026/11.jsonl": bad }).errors.some((x) => /trail entry/.test(x.message))).toBe(true);
  });
  it("batch: mixed ops in one change, ops see earlier ops, one commit message, balance change", () => {
    const m = { via: "mcp", client: "Claude", at: "2026-11-23T01:00:00Z", reason: "Woori statement check" };
    const base = addTransaction(demo, { date: "2026-10-05", kind: "expense", amount: 50000, account: "cash", category: "food", note: "Old" });
    const files = { ...demo, ...base.files };
    const oldId = after(demo, base.files).transactions.find((t) => t.note === "Old")!.id;
    const other = addTransaction(files, { date: "2026-10-06", kind: "expense", amount: 70000, account: "cash", category: "food", note: "Dup" });
    const f2 = { ...files, ...other.files };
    const dupId = after(files, other.files).transactions.find((t) => t.note === "Dup")!.id;
    const b = batch(f2, [
      { op: "add", date: "2026-11-03", kind: "expense", amount: 9091, account: "card-visa", category: "food", note: "Fee" },
      { op: "add", date: "2026-11-03", kind: "expense", amount: 909, account: "card-visa", category: "food", note: "Fee VAT", reason: "VAT row" },
      { op: "edit", id: oldId, amount: 60000, date: "2026-11-01" },
      { op: "void", id: dupId, reason: "duplicate" },
    ], m);
    expect(b.counts).toEqual({ add: 2, edit: 1, void: 1 });
    expect(b.message).toBe("Batch: 2 adds, 1 edit, 1 void\n\nReason: Woori statement check\nVia: mcp (Claude)");
    expect(Object.keys(b.files).sort()).toEqual(["data/ledger/2026/10.jsonl", "data/ledger/2026/11.jsonl"]);
    expect(b.balanceChange).toEqual({ "card-visa": -10000, cash: -60000 + 50000 + 70000 });
    const l = after(f2, b.files);
    expect(l.transactions.find((t) => t.note === "Fee VAT")!.trail).toEqual([{ op: "add", at: m.at, via: "mcp", client: "Claude", reason: "Woori statement check; VAT row" }]);
    expect(l.transactions.find((t) => t.id === dupId)!.void_reason).toBe("duplicate");
    expect(l.transactions.find((t) => t.id === oldId)!.date).toBe("2026-11-01");
    expect(b.change.addTransactions!.length).toBe(2);
    expect(b.change.replaceTransactions!.length).toBe(2);
  });
  it("batch: two ops on the same row show as one replace with the final version", () => {
    const base = addTransaction(demo, { date: "2026-10-05", kind: "expense", amount: 50000, account: "cash", category: "food", note: "Twice" });
    const files = { ...demo, ...base.files };
    const id = base.change.addTransactions![0]!.id;
    const b = batch(files, [{ op: "edit", id, amount: 40000 }, { op: "void", id, reason: "wrong" }]);
    expect(b.change.replaceTransactions!.length).toBe(1);
    expect(b.change.replaceTransactions![0]!.void).toBe(true);
    expect(b.balanceChange).toEqual({ cash: 50000 });
  });
  it("batch: one failing op refuses everything and says which; check runs on the final files", () => {
    expect(() => batch(demo, [
      { op: "add", date: "2026-11-03", kind: "expense", amount: 1000, account: "cash", category: "food" },
      { op: "add", date: "2026-11-03", kind: "expense", amount: 1000, account: "nope-acc", category: "food" },
    ])).toThrow(/would not pass check/);
    expect(() => batch(demo, [
      { op: "add", date: "2026-11-03", kind: "expense", amount: 1000, account: "cash", category: "food" },
      { op: "void", id: "t_missing" },
    ])).toThrow(/op 2 \(void t_missing\) failed: no transaction t_missing/);
    expect(() => batch(demo, [])).toThrow(/no ops/);
    expect(() => batch(demo, Array.from({ length: 201 }, () => ({ op: "void" as const, id: "x" })))).toThrow(/at most 200/);
  });
});
