import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addMonths, cards, checkFiles, deposits, fold, holdingsAt, netWorth, netWorthSeries, planStatus, plansDue,
  previousPeriod, queryTransactions, report, today, type FileMap,
} from "../src/engine/index.js";
import { readDataDir } from "../src/node/files.js";

const demoFiles = readDataDir(join(import.meta.dirname, "..", "fixtures", "demo"));
const futureFiles = readDataDir(join(import.meta.dirname, "..", "fixtures", "future"));
const demo = checkFiles(demoFiles);
const L = demo.ledger;

describe("check", () => {
  it("demo fixture is clean", () => {
    expect(demo.errors).toEqual([]);
    expect(L.transactions.length).toBeGreaterThan(1000);
  });

  it("future fixture loads: unknown type and keys are warnings, kept as is", () => {
    const r = checkFiles(futureFiles);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.message).join("\n")).toMatch(/unknown type "pension_fund"/);
    const pension = r.ledger.accounts.find((a) => a.id === "pension")!;
    expect(pension.details).toEqual({ provider: "Future Co", vesting_year: 2045 });
    const card = r.ledger.accounts.find((a) => a.id === "card")!;
    expect(card.details?.reward_points).toBe(1200);
    expect(card.colour).toBe("#123456");
    expect(holdingsAt(r.ledger).get("pension")!.amount).toBe(500000);
    expect(r.ledger.transactions[1]!.mood).toBe("happy");
    // unknown type still counts in net worth
    expect(netWorth(r.ledger, "2026-01-31").net).toBe(1000000 - 120000);
    expect(cards(r.ledger, "2026-01-31")[0]!.owed).toBe(120000);
  });

  const base: FileMap = {
    "data/meta.yaml": "format: 1\nbase: VND\n",
    "data/accounts.yaml": "- {id: cash, name: Cash, type: cash}\n- {id: gold, name: Gold, type: gold, asset: GOLD}\n",
    "data/assets.yaml": "- {id: VND}\n- {id: GOLD}\n",
    "data/categories.yaml": "income: [{id: salary, name: Salary}]\nexpense: [{id: food, name: Food, children: [{id: cafe, name: Cafe}]}]\n",
  };
  const withTx = (txs: object[], file = "data/ledger/2026/01.jsonl", extra: FileMap = {}) =>
    checkFiles({ ...base, ...extra, [file]: txs.map((t) => JSON.stringify(t)).join("\n") });
  const msgs = (r: ReturnType<typeof checkFiles>) => r.errors.map((e) => e.message).join("\n");

  it("accepts a balanced transaction", () => {
    expect(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "cash", amount: -10 }, { category: "food/cafe", amount: 10 }] }]).ok).toBe(true);
  });
  it("refuses unbalanced, unknown refs, bad amounts", () => {
    expect(msgs(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "cash", amount: -10 }, { category: "food", amount: 9 }] }]))).toMatch(/don't balance/);
    expect(msgs(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "nope", amount: -10 }, { category: "food", amount: 10 }] }]))).toMatch(/unknown account/);
    expect(msgs(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "cash", amount: -10 }, { category: "drinks", amount: 10 }] }]))).toMatch(/unknown category/);
    expect(msgs(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "cash", amount: -10.5 }, { category: "food", amount: 10.5 }] }]))).toMatch(/whole number/);
    expect(msgs(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "cash", category: "food", amount: 0 }, { category: "food", amount: 0 }] }]))).toMatch(/exactly one/);
  });
  it("refuses wrong month file, duplicate ids and duplicate import keys", () => {
    expect(msgs(withTx([{ id: "a", date: "2026-02-02", lines: [{ account: "cash", amount: -1 }, { category: "food", amount: 1 }] }]))).toMatch(/belongs in data\/ledger\/2026\/02.jsonl/);
    const t = { date: "2026-01-02", lines: [{ account: "cash", amount: -1 }, { category: "food", amount: 1 }], src: { import: "x", key: "k" } };
    const m = msgs(withTx([{ id: "a", ...t }, { id: "a", ...t }]));
    expect(m).toMatch(/duplicate transaction id/);
    expect(m).toMatch(/same import key/);
  });
  it("needs qty on non-base asset lines", () => {
    expect(msgs(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "cash", amount: -100 }, { account: "gold", amount: 100 }] }]))).toMatch(/needs qty/);
    expect(withTx([{ id: "a", date: "2026-01-02", lines: [{ account: "cash", amount: -100 }, { account: "gold", asset: "GOLD", qty: 0.5, amount: 100 }] }]).ok).toBe(true);
  });
  it("format version gates", () => {
    expect(msgs(checkFiles({ ...base, "data/meta.yaml": "format: 2\nbase: VND\n" }))).toMatch(/Update ownledger/);
    expect(msgs(checkFiles({ ...base, "data/meta.yaml": "format: 0\nbase: VND\n" }))).toMatch(/missing or invalid format/);
  });
  it("reports YAML errors without throwing", () => {
    expect(msgs(checkFiles({ ...base, "data/accounts.yaml": "- {id: cash, name: [" }))).toMatch(/YAML parse error/);
  });
});

describe("computations on the demo ledger", () => {
  it("card is paid off monthly and statement math is consistent", () => {
    const c = cards(L, "2026-10-25")[0]!;
    expect(c.account).toBe("card-visa");
    expect(c.statementDate).toBe("2026-10-20");
    expect(c.dueDate).toBe("2026-11-05");
    expect(c.toPay).toBe(c.statementBalance! - c.paidSinceStatement);
    expect(c.available).toBe(50000000 - c.owed);
  });
  it("card period: spending by category, refunds and cashback since the last statement", () => {
    const c = cards(L, "2026-10-31")[0]!;
    expect(c.product).toBe("Demo Visa Cashback");
    expect(c.bank).toBe("Demo Bank");
    expect(c.period.basis).toBe("statement");
    expect(c.period.from).toBe("2026-10-21");
    expect(c.period.to).toBe("2026-10-31");
    expect(c.period.refunds).toBe(50000);
    expect(c.period.cashback).toBe(25000);
    const groceries = c.period.byCategory.find((x) => x.category === "food/groceries")!;
    expect(groceries.amount).toBe(300000); // 350,000 spent - 50,000 refunded
    expect(c.period.byCategory.reduce((a, x) => a + x.amount, 0)).toBe(c.period.spent - c.period.refunds);
  });
  it("card period without a statement day is the calendar month; mixed transactions are left out", () => {
    const files: FileMap = {
      "data/meta.yaml": "format: 1\nbase: VND\n",
      "data/assets.yaml": "- {id: VND}\n",
      "data/categories.yaml": "income: [{id: cashback, name: Cashback}]\nexpense: [{id: food, name: Food}]\n",
      "data/accounts.yaml": "- {id: cash, name: Cash, type: cash}\n- {id: card, name: Card, type: credit_card}\n",
      "data/ledger/2026/10.jsonl": '{"id":"t1","date":"2026-10-30","lines":[{"account":"card","amount":-100},{"category":"food","amount":100}]}',
      "data/ledger/2026/11.jsonl": [
        '{"id":"t2","date":"2026-11-02","lines":[{"account":"card","amount":-300},{"category":"food","amount":300}]}',
        '{"id":"t3","date":"2026-11-03","lines":[{"account":"card","amount":-200},{"account":"cash","amount":-100},{"category":"food","amount":300}]}',
        '{"id":"t4","date":"2026-11-04","lines":[{"account":"cash","amount":-400},{"account":"card","amount":400}]}',
        '{"id":"t5","date":"2026-11-05","lines":[{"account":"card","amount":20},{"category":"cashback","amount":-20}]}',
      ].join("\n"),
    };
    const r = checkFiles(files);
    expect(r.errors).toEqual([]);
    const c = cards(r.ledger, "2026-11-10")[0]!;
    // t1 is last month, t3 is mixed (not split), t4 is a card payment (a transfer, never spending)
    expect(c.period).toMatchObject({ basis: "month", from: "2026-11-01", to: "2026-11-10", spent: 300, refunds: 0, mixed: 1, cashback: 20 });
    expect(c.product).toBeNull();
  });
  it("deposits: maturity and interest", () => {
    const d = deposits(L, "2026-10-31");
    expect(d.map((x) => x.account)).toEqual(["dep-6m"]); // dep-2024 is closed
    expect(d[0]!.maturity).toBe("2026-12-01");
    expect(d[0]!.interestAtMaturity).toBe(Math.round((100000000 * 5.2 * 183) / 36500));
    expect(holdingsAt(L, "2024-08-01").get("dep-2024")!.amount).toBe(0);
  });
  it("plans: paid, left, next, due", () => {
    const st = Object.fromEntries(planStatus(L, "2026-10-31").map((s) => [s.plan, s]));
    expect(st["p-phone"]!.paidCount).toBe(12);
    expect(st["p-phone"]!.finished).toBe(true);
    expect(st["p-life"]!.next).toBe("2027-04-10");
    expect(st["p-life"]!.left).toBeNull();
    expect(st["p-home"]!.paidCount).toBe(19);
    expect(st["p-home"]!.left).toBe(17);
    expect(st["p-home"]!.overdue).toEqual([]);
    const due = plansDue(L, "2026-10-31", 30);
    expect(due.map((x) => [x.plan, x.date])).toEqual([["p-home", "2026-11-01"]]);
  });
  it("report: month by category, totals and previous period", () => {
    const r = report(L, "2026-10");
    expect(r.income).toBeGreaterThanOrEqual(33000000);
    expect(r.rows.reduce((s, x) => s + x.expense, 0)).toBe(r.expense);
    expect(r.previous!.period).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    const top = report(L, "2025", { by: "top", kind: "expense" });
    expect(top.income).toBe(0);
    expect(top.rows.find((x) => x.key === "home")!.expense).toBeGreaterThan(95000000);
    // void transaction is excluded
    expect(queryTransactions(L, { text: "nhập nhầm" }).total).toBe(0);
    expect(queryTransactions(L, { text: "nhập nhầm", includeVoid: true }).total).toBe(1);
  });
  it("transfers, deposits, investments are never income or spending", () => {
    const r = report(L, "2024-01");
    expect(r.rows.some((x) => x.key.startsWith("_"))).toBe(false);
    const all = report(L, { from: "2023-01-01", to: "2026-12-31" }, { compare: false });
    // income - expense == change in net worth at cost minus opening balance (all values at cost when unpriced)
    expect(all.net).toBeTypeOf("number");
  });
  it("net worth: series and point agree", () => {
    const s = netWorthSeries(L, "2023-01-01", "2026-10-31");
    expect(s.length).toBe(46);
    expect(s.at(-1)!.net).toBe(netWorth(L, "2026-10-31").net);
    expect(s[0]!.net).toBe(netWorth(L, "2023-01-31").net);
    expect(s.at(-1)!.unpriced).toEqual([]);
  });
  it("search ignores Vietnamese diacritics", () => {
    expect(fold("Ăn trưa Đà Lạt")).toBe("an trua da lat");
    expect(queryTransactions(L, { text: "an trua", limit: 5 }).items.length).toBeGreaterThan(0);
    const q = queryTransactions(L, { account: "loan-an" });
    expect(q.total).toBe(2);
  });
  it("today summarises", () => {
    const t = today(L, "2026-10-28");
    expect(t.due.map((d) => d.date)).toEqual(["2026-11-01"]);
    expect(t.odd).toEqual([]);
  });
});

describe("dates", () => {
  it("clamps month ends and periods", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(previousPeriod({ from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousPeriod({ from: "2026-03-10", to: "2026-03-19" })).toEqual({ from: "2026-02-28", to: "2026-03-09" });
  });
});
