import { describe, expect, it } from "vitest";
import { applyChange, checkFiles, type FileMap, type Transaction } from "../src/engine/index.js";
import { attention } from "../src/engine/attention.js";
import { bestCard, cashback, points } from "../src/modules/cards/statements.js";
import { cardList } from "../src/modules/cards/index.js";

// Made-up cards shaped like real ones (plan 006):
// "wg": per-group caps + a merchant rule + a global cap, closes on the 31st;
// "md": one group, points cashed in from 300k, expiring after 12 months;
// "su": a 2-day post margin; "sm": a minimum and a spend_max, no caps.
const files: FileMap = {
  "data/meta.yaml": "format: 1\nbase: VND\n",
  "data/categories.yaml": [
    "income: [{id: cashback, name: Cashback}, {id: salary, name: Salary}]",
    "expense: [{id: food, name: Food, children: [{id: groceries, name: Groceries}, {id: eating-out, name: Eating out}]}, {id: transport, name: Transport, children: [{id: fuel, name: Fuel}]}, {id: shopping, name: Shopping}]",
    "",
  ].join("\n"),
  "data/accounts.yaml": [
    "- {id: bank, name: Bank, type: bank}",
    "- id: wg",
    "  name: Group Card",
    "  type: credit_card",
    "  details:",
    "    statement_day: 31",
    "    due_day: 15",
    "    cashback:",
    "      cap: 1000000",
    "      rules:",
    "        - {merchants: [shopee, lazada], rate: 8, cap: 300000}",
    "        - {categories: [food/eating-out], rate: 10, cap: 300000, in_store: true, label: dining}",
    "        - {categories: [food/groceries], rate: 5, cap: 300000, in_store: true}",
    "        - {categories: [transport/fuel], rate: 5, cap: 300000}",
    "- id: md",
    "  name: Points Card",
    "  type: credit_card",
    "  details:",
    "    statement_day: 20",
    "    due_day: 4",
    "    cashback:",
    "      payout: points",
    "      redeem_min: 300000",
    "      expire_months: 12",
    "      rules: [{categories: [food/eating-out], rate: 20, cap: 300000}]",
    "- id: su",
    "  name: Auto Card",
    "  type: credit_card",
    "  details:",
    "    statement_day: 7",
    "    due_day: 3",
    "    cashback: {post_margin_days: 2, base: 0.5, cap: 600000, rules: [{categories: [food/groceries, transport], rate: 20, cap: 300000}]}",
    "- id: sm",
    "  name: Band Card",
    "  type: credit_card",
    "  details:",
    "    statement_day: 10",
    "    due_day: 1",
    "    cashback: {min_spend: 1000000, spend_max: 5000000, rules: [{categories: [shopping], rate: 2}]}",
    "",
  ].join("\n"),
};

let n = 0;
const buy = (date: string, account: string, amount: number, category = "shopping", extra: Partial<Transaction> = {}): Transaction => ({ id: `r${++n}`, date, note: "", ...extra, lines: [{ account, amount: -amount }, { category, amount }] });
const back = (date: string, account: string, amount: number): Transaction => ({ id: `r${++n}`, date, note: "cashback", lines: [{ account, amount }, { category: "cashback", amount: -amount }] });

function ledger(txs: Transaction[], extra: FileMap = {}) {
  const base = { ...files, ...extra };
  const r = checkFiles({ ...base, ...applyChange(base, { addTransactions: [{ id: "open", date: "2025-01-01", note: "", lines: [{ account: "bank", amount: 500000000 }, { category: "salary", amount: -500000000 }] }, ...txs] }) });
  if (r.errors.length) throw new Error(`fixture errors: ${r.errors.map((i) => i.message).join("; ")}`);
  return { ledger: r.ledger, warnings: r.warnings };
}

describe("room per cashback group", () => {
  const { ledger: L } = ledger([
    buy("2026-11-03", "wg", 2000000, "food/eating-out"), // 200k of 300k
    buy("2026-11-04", "wg", 6200000, "food/groceries"), // 310k → 300k (cap)
    buy("2026-11-05", "wg", 1000000, "food/groceries", { merchant: "Lazada" }), // merchant rule wins: 8% = 80k
  ]);
  const p = cashback(L, "wg", "2026-11-20").find((x) => x.open)!;
  const g = (label: string) => p.groups.find((x) => x.label === label)!;

  it("each rule earns up to its own cap; a merchant rule wins over the category", () => {
    expect(g("dining")).toMatchObject({ rate: 10, spend: 2000000, earned: 200000, cap: 300000, inStore: true });
    expect(g("food/groceries")).toMatchObject({ spend: 6200000, earned: 300000, room: 0 });
    expect(g("shopee, lazada")).toMatchObject({ rate: 8, spend: 1000000, earned: 80000 });
    expect(p.expected).toBe(580000);
  });

  it("room = what each cap still pays ÷ its rate, trimmed by the global cap left", () => {
    // global 1,000,000 − 580,000 = 420,000 left
    expect(g("dining").room).toBe(1000000); // 100k ÷ 10%
    expect(g("shopee, lazada").room).toBe(2750000); // 220k ÷ 8%
    expect(g("transport/fuel")).toMatchObject({ spend: 0, room: 6000000 }); // 300k ÷ 5% (under the 420k left)
    expect(p.earnLeft).toBe(420000); // 620k left in the groups, 420k under the global cap
    expect(p.roomSpend).toBeNull(); // the groups carry the room
  });

  it("the global cap trims a group's room", () => {
    const { ledger: L2 } = ledger([buy("2026-11-03", "wg", 3000000, "food/eating-out"), buy("2026-11-04", "wg", 6000000, "food/groceries"), buy("2026-11-05", "wg", 3750000, "shopping", { merchant: "Shopee VN" })]);
    const q = cashback(L2, "wg", "2026-11-20").find((x) => x.open)!;
    expect(q.expected).toBe(900000);
    expect(q.groups.find((x) => x.label === "transport/fuel")!.room).toBe(2000000); // 100k left ÷ 5%
  });

  it("no rule cap: spend_max gives the room; else the global cap ÷ the best rate (an estimate)", () => {
    const { ledger: L2 } = ledger([buy("2026-11-12", "sm", 1500000), buy("2026-11-12", "su", 100000, "shopping")]);
    expect(cashback(L2, "sm", "2026-11-20").find((x) => x.open)).toMatchObject({ roomSpend: 3500000, roomEstimate: false, earnLeft: null });
    const su = cashback(L2, "su", "2026-11-20").find((x) => x.open)!;
    expect(su.groups.find((x) => x.rate === 20)!.room).toBe(1500000); // a rule cap: room per group
  });
});

describe("last safe day", () => {
  it("statement date − 3 days; a 31st close is clamped to the month's end", () => {
    const { ledger: L } = ledger([buy("2026-11-03", "wg", 100000, "food/eating-out")]);
    expect(cashback(L, "wg", "2026-11-26").find((x) => x.open)).toMatchObject({ closesOn: "2026-11-30", safeUntil: "2026-11-27", daysLeft: 1 });
    expect(cashback(L, "wg", "2026-11-28").find((x) => x.open)!.daysLeft).toBe(-1); // too late: it may post on the next statement
    expect(cashback(L, "wg", "2026-11-30").find((x) => x.open)).toMatchObject({ closesOn: "2026-12-31", safeUntil: "2026-12-28" }); // the close day starts the next period
  });

  it("the card's own margin", () => {
    const { ledger: L } = ledger([buy("2026-01-10", "su", 100000, "food/groceries")]);
    expect(cashback(L, "su", "2026-02-01").find((x) => x.open)).toMatchObject({ closesOn: "2026-02-07", safeUntil: "2026-02-05", daysLeft: 4 });
  });
});

describe("warnings", () => {
  it("room left near the safe day lists the groups", () => {
    const { ledger: L } = ledger([buy("2026-11-03", "wg", 2000000, "food/eating-out")]);
    const a = attention(L, "2026-11-25").find((x) => x.kind === "card_spend_room" && x.account === "wg")!;
    expect(a).toMatchObject({ severity: "info", days: 2, date: "2026-11-27" });
    expect(a.title).toMatch(/dining 1000000 at 10% \(in store\)/);
    expect(attention(L, "2026-11-20").some((x) => x.kind === "card_spend_room" && x.account === "wg")).toBe(false); // 7 days: not yet
    expect(attention(L, "2026-11-28").some((x) => x.kind === "card_spend_room" && x.account === "wg")).toBe(false); // past the safe day
  });

  it("a minimum not met counts to the safe day, red in the last 2 days", () => {
    const { ledger: L } = ledger([buy("2026-11-12", "sm", 400000)]);
    // closes 2026-12-10, safe until 2026-12-07
    expect(attention(L, "2026-12-01").find((x) => x.kind === "cashback_min")).toMatchObject({ severity: "amber", days: 6, amount: 600000, date: "2026-12-07" });
    expect(attention(L, "2026-12-06").find((x) => x.kind === "cashback_min")!.severity).toBe("red");
    expect(attention(L, "2026-12-06").some((x) => x.kind === "card_spend_room" && x.account === "sm")).toBe(false); // the minimum warning covers it
  });
});

describe("points cards", () => {
  it("earned at each statement, cashed in from the minimum, no 'cashback missing'", () => {
    const { ledger: L } = ledger([buy("2025-12-25", "md", 1500000, "food/eating-out")]); // 300k at the 2026-01-20 statement
    expect(points(L, "md", "2026-02-01")).toMatchObject({ balance: 300000, canRedeem: true, pending: 0 });
    const kinds = attention(L, "2026-03-01").filter((x) => x.account === "md").map((x) => x.kind);
    expect(kinds).toContain("card_points_redeem");
    expect(kinds).not.toContain("cashback_missing");
    const { ledger: L2 } = ledger([buy("2025-12-25", "md", 1500000, "food/eating-out"), back("2026-02-05", "md", 300000)]);
    expect(points(L2, "md", "2026-02-10")).toMatchObject({ balance: 0, canRedeem: false });
    expect(cardList(L2, "2026-02-10").find((c) => c.account === "md")!.points!.balance).toBe(0);
  });

  it("points below the minimum expire 12 months after their statement", () => {
    const { ledger: L } = ledger([buy("2025-02-01", "md", 1000000, "food/eating-out")]); // 200k at 2025-02-20
    expect(points(L, "md", "2026-02-01")).toMatchObject({ balance: 200000, canRedeem: false, lots: [{ close: "2025-02-20", left: 200000, expires: "2026-02-20" }] });
    expect(attention(L, "2026-02-01").find((x) => x.kind === "card_points_expiring")).toMatchObject({ severity: "amber", amount: 200000, days: 19 });
    expect(points(L, "md", "2026-03-01")).toMatchObject({ balance: 0, expired: 200000 });
  });
});

describe("which card, with groups", () => {
  it("a merchant picks its rule, the group's cap left, in-store and the safe day", () => {
    const { ledger: L } = ledger([buy("2026-11-03", "wg", 3500000, "shopping", { merchant: "Shopee" })]); // 280k of 300k
    const r = bestCard(L, { category: "shopping", merchant: "shopee", amount: 1000000, date: "2026-11-20" });
    expect(r.find((b) => b.account === "wg")).toMatchObject({ rate: 8, rule: "shopee, lazada", capLeft: 20000, earn: 20000, safeUntil: "2026-11-27", nextPeriod: false });
    const dine = bestCard(L, { category: "food/eating-out", amount: 500000, date: "2026-11-28" }).find((b) => b.account === "wg")!;
    expect(dine).toMatchObject({ rate: 10, inStore: true, nextPeriod: true });
    expect(dine.reason).toMatch(/in store only/);
  });
});

describe("checks", () => {
  it("warns on bad new fields, reads old terms as before", () => {
    const bad = files["data/accounts.yaml"]!.replace("post_margin_days: 2", "post_margin_days: 20").replace("- {categories: [transport/fuel], rate: 5, cap: 300000}", "- {rate: 5, cap: -1}");
    const { warnings } = ledger([], { "data/accounts.yaml": bad });
    const msgs = warnings.map((w) => w.message).join("\n");
    expect(msgs).toMatch(/post_margin_days/);
    expect(msgs).toMatch(/needs categories or merchants/);
    expect(msgs).toMatch(/cap: a positive whole amount/);
  });
});
