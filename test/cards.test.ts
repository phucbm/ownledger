import { describe, expect, it } from "vitest";
import { applyChange, cards, checkFiles, type FileMap, type Transaction } from "../src/engine/index.js";
import { bestCard, cashback, cardValues, feeWaiver, interestFreeUntil, statements } from "../src/modules/cards/statements.js";
import { cardList } from "../src/modules/cards/index.js";
import { mergeNameCodes, parseCardName, termsOf } from "../src/modules/cards/terms.js";
import { attention } from "../src/engine/attention.js";

// Made-up cards. "end" closes on the 31st (clamped in short months); "cb" has cashback rules; "debit" is a debit card with cashback.
const files: FileMap = {
  "data/meta.yaml": "format: 1\nbase: VND\n",
  "data/categories.yaml": [
    "income: [{id: cashback, name: Cashback}, {id: salary, name: Salary}]",
    "expense: [{id: food, name: Food, children: [{id: groceries, name: Groceries}, {id: eating-out, name: Eating out}]}, {id: transport, name: Transport, children: [{id: fuel, name: Fuel}]}, {id: shopping, name: Shopping}, {id: bank-fees, name: Fees}]",
    "",
  ].join("\n"),
  "data/accounts.yaml": [
    "- {id: bank, name: Bank, type: bank}",
    "- {id: end, name: End Card, type: credit_card, details: {statement_day: 31, due_day: 15, limit: 10000000}}",
    "- id: cb",
    "  name: Cashback Card",
    "  type: credit_card",
    "  details:",
    "    statement_day: 7",
    "    due_day: 3",
    "    limit: 50000000",
    "    fee_month: 1",
    "    annual_fee: 499000",
    "    fee_waiver: {spend: 50000000, within: year}",
    "    cashback:",
    "      base: 0.5",
    "      rules:",
    "        - {categories: [food/groceries, food/eating-out], rate: 5}",
    "        - {categories: [transport/fuel], rate: 3}",
    "      cap: {amount: 600000, per: statement}",
    "      min_spend: {amount: 5000000, per: statement}",
    "      paid_on: next_statement",
    "- {id: plain, name: Plain Card, type: credit_card, details: {statement_day: 20, due_day: 5}}",
    "- {id: debit, name: Debit Wallet, type: bank}",
    "",
  ].join("\n"),
  "data/cards.yaml": [
    "- {id: cb-card, kind: credit, account: cb, bank: Bank B, name: Cashback Card, last4: \"8866\", status: active, issued: 2025-01-10, annual_fee: 499000, benefits: 300000}",
    "- id: debit-card",
    "  kind: debit",
    "  account: debit",
    "  name: Debit Card",
    "  statement_day: 1",
    "  cashback: {base: 0, rules: [{categories: [shopping], rate: 2}]}",
    "- {id: old, kind: credit, name: Old Card, status: cancelled, cancel_plan: {by: 2026-12}, close_fee: 200000}",
    "",
  ].join("\n"),
};

let n = 0;
const buy = (date: string, account: string, amount: number, category = "shopping", extra: Partial<Transaction> = {}): Transaction => ({ id: `c${++n}`, date, note: "", ...extra, lines: [{ account, amount: -amount }, { category, amount }] });
const pay = (date: string, account: string, amount: number): Transaction => ({ id: `c${++n}`, date, note: "pay", lines: [{ account: "bank", amount: -amount }, { account, amount }] });
const refund = (date: string, account: string, amount: number, category = "shopping"): Transaction => ({ id: `c${++n}`, date, note: "refund", lines: [{ account, amount }, { category, amount: -amount }] });
const back = (date: string, account: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id: `c${++n}`, date, note: "cashback", ...extra, lines: [{ account, amount }, { category: "cashback", amount: -amount }] });

function ledger(txs: Transaction[], extra: FileMap = {}) {
  const base = { ...files, ...extra };
  const r = checkFiles({ ...base, ...applyChange(base, { addTransactions: [{ id: "open", date: "2025-01-01", note: "", lines: [{ account: "bank", amount: 500000000 }, { category: "salary", amount: -500000000 }] }, ...txs] }) });
  expect(r.errors).toEqual([]);
  return r.ledger;
}

describe("statements", () => {
  it("statement_day 31 closes on the last day of short months; a refund and a split payment", () => {
    const L = ledger([
      buy("2026-01-20", "end", 3000000),
      refund("2026-01-25", "end", 500000),
      buy("2026-02-10", "end", 1000000),
      pay("2026-02-05", "end", 1500000), // pays January's statement, part 1
      pay("2026-02-14", "end", 1000000), // part 2, on time (due 15 Feb)
      buy("2026-03-01", "end", 200000),
    ]);
    const st = statements(L, "end", "2026-03-10");
    expect(st.map((s) => s.close)).toEqual(["2026-01-31", "2026-02-28", "2026-03-10"]);
    const jan = st[0]!;
    expect(jan).toMatchObject({ purchases: 3000000, refunds: 500000, closing: 2500000, amountDue: 2500000, due: "2026-02-15", paidByDue: 2500000, status: "paid", toPay: 0 });
    const feb = st[1]!;
    expect(feb).toMatchObject({ opening: 2500000, purchases: 1000000, payments: 2500000, closing: 1000000, due: "2026-03-15", status: "due", toPay: 1000000 });
    expect(st[2]).toMatchObject({ open: true, purchases: 200000, closing: 1200000 });
  });

  it("a late payment and a partly paid statement", () => {
    const L = ledger([buy("2026-01-10", "plain", 2000000), pay("2026-02-10", "plain", 2000000), buy("2026-02-10", "plain", 1000000), pay("2026-03-01", "plain", 400000)]);
    const st = statements(L, "plain", "2026-03-15");
    expect(st[0]).toMatchObject({ close: "2026-01-20", due: "2026-02-05", status: "late" });
    expect(st[1]).toMatchObject({ close: "2026-02-20", due: "2026-03-05", closing: 1000000, paid: 400000, status: "partly", toPay: 600000 });
  });

  it("agrees with the existing cards() on what's left to pay and the due date", () => {
    const L = ledger([buy("2026-01-10", "plain", 2000000), pay("2026-01-25", "plain", 500000)]);
    const old = cards(L, "2026-01-30").find((c) => c.account === "plain")!;
    const last = statements(L, "plain", "2026-01-30").filter((s) => !s.open).pop()!;
    expect(last.toPay).toBe(old.toPay);
    expect(last.due).toBe(old.dueDate);
  });

  it("the bank's amount wins and a difference over 1,000 is in Needs you", () => {
    const L = ledger([buy("2026-01-10", "plain", 2000000)], { "data/cards/statements.yaml": "- {account: plain, statement_date: 2026-01-20, amount: 2050000}\n" });
    const s = statements(L, "plain", "2026-01-25")[0]!;
    expect(s).toMatchObject({ bank: 2050000, bankDiff: -50000, amountDue: 2050000 });
    expect(attention(L, "2026-01-25").map((a) => a.kind)).toContain("card_bank_diff");
  });

  it("a 0% instalment counts only the monthly amount on each statement", () => {
    const L = ledger(
      [{ id: "iphone", date: "2026-01-10", note: "iPhone", lines: [{ account: "plain", amount: -12000000 }, { category: "shopping", amount: 12000000 }] }],
      { "data/plans.yaml": "- {id: iphone-0, kind: instalment, account: plain, principal: 12000000, count: 6, every: month, start: 2026-01-20, source: iphone}\n" },
    );
    const st = statements(L, "plain", "2026-03-01");
    expect(st[0]).toMatchObject({ close: "2026-01-20", closing: 12000000, deferred: 10000000, amountDue: 2000000 });
    expect(st[1]).toMatchObject({ close: "2026-02-20", deferred: 8000000 });
  });

  it("interest-free date for a purchase", () => {
    const L = ledger([]);
    const t = termsOf(L.accounts.find((a) => a.id === "cb")!);
    expect(interestFreeUntil(t, "2026-01-07")).toBe("2026-02-03"); // falls into the 7 Jan statement
    expect(interestFreeUntil(t, "2026-01-08")).toBe("2026-03-03"); // the next one: 54 days
  });
});

describe("cashback", () => {
  it("category rates, base rate, received in the next statement period", () => {
    const L = ledger([
      buy("2025-12-10", "cb", 4000000, "food/groceries"), // 5% = 200k
      buy("2025-12-12", "cb", 2000000, "shopping"), // 0.5% = 10k
      back("2026-01-15", "cb", 210000),
    ]);
    const p = cashback(L, "cb", "2026-02-10").find((x) => x.close === "2026-01-07")!;
    expect(p).toMatchObject({ spend: 6000000, expected: 210000, minMet: true, received: 210000, payBy: "2026-02-07" });
  });

  it("the cap is hit mid-period; minimum spend not reached gives 0", () => {
    const L = ledger([buy("2025-12-10", "cb", 15000000, "food/groceries"), buy("2026-01-10", "cb", 1000000, "food/groceries")]);
    const ps = cashback(L, "cb", "2026-01-20");
    expect(ps.find((x) => x.close === "2026-01-07")).toMatchObject({ expected: 600000, capLeft: 0 }); // 750k capped
    expect(ps.find((x) => x.open)).toMatchObject({ spend: 1000000, minMet: false, expected: 0, needForMin: 4000000 });
  });

  it("cashback paid to another account carries card:", () => {
    const L = ledger([buy("2025-12-10", "cb", 6000000, "food/groceries"), { id: "cbx", date: "2026-01-20", note: "cashback", card: "cb", lines: [{ account: "bank", amount: 300000 }, { category: "cashback", amount: -300000 }] }]);
    expect(cashback(L, "cb", "2026-02-10").find((x) => x.close === "2026-01-07")!.received).toBe(300000);
  });

  it("a debit card with cashback works from its card record (cycle from statement_day 1)", () => {
    const L = ledger([buy("2026-02-03", "debit", 1000000, "shopping")]);
    expect(cashback(L, "debit", "2026-02-20").find((p) => p.open)).toMatchObject({ spend: 1000000, expected: 20000 });
  });
});

describe("which card", () => {
  it("ranks by cashback with cap left, then free days", () => {
    const L = ledger([buy("2026-01-08", "cb", 9000000, "food/groceries")]); // 450k of 600k cap used
    const r = bestCard(L, { category: "food/groceries", amount: 5000000, date: "2026-01-10" });
    expect(r[0]).toMatchObject({ account: "cb", rate: 5, earn: 150000, capLeft: 150000 });
    expect(r[0]!.reason).toMatch(/5% \(cap left 150000\)/);
    const shop = bestCard(L, { category: "shopping", amount: 100000, date: "2026-01-10" });
    expect(shop.map((b) => b.account).slice(0, 2)).toEqual(["debit", "cb"]); // debit card 2% on shopping, then 0.5% base
    expect(shop.find((b) => b.account === "end")!.rate).toBeNull(); // no terms: ranked after the known rates
  });
});

describe("annual fee waiver", () => {
  it("on and off pace", () => {
    const on = ledger([buy("2026-01-15", "cb", 30000000), buy("2026-05-01", "cb", 10000000)]);
    expect(feeWaiver(on, "cb", "2026-06-01")).toMatchObject({ spent: 40000000, needed: 10000000, onTrack: true, deadline: "2027-01-01" });
    const off = ledger([buy("2026-01-15", "cb", 2000000)]);
    const fw = feeWaiver(off, "cb", "2026-12-10")!;
    expect(fw).toMatchObject({ onTrack: false, needed: 48000000 });
    expect(attention(off, "2026-12-10").find((a) => a.kind === "fee_waiver_risk")).toMatchObject({ severity: "amber", days: 22 });
  });
});

describe("cards list, value and lifecycle", () => {
  it("a missing limit shows the most ever owed as 'at least'", () => {
    const L = ledger([buy("2026-01-10", "plain", 2000000), pay("2026-02-01", "plain", 2000000)]);
    expect(cardList(L, "2026-02-10").find((c) => c.account === "plain")).toMatchObject({ limit: null, limitAtLeast: 2000000, missing: ["limit"] });
  });

  it("net value: benefits + cashback − fees (from the ledger, else the card record)", () => {
    const L = ledger([back("2026-02-15", "cb", 210000), { id: "fee", date: "2026-01-05", note: "Phí thường niên", lines: [{ account: "cb", amount: -499000 }, { category: "bank-fees", amount: 499000 }] }]);
    const v = cardValues(L, "2026-03-01").find((x) => x.card === "cb-card")!;
    expect(v).toMatchObject({ benefits: 300000, cashback: 210000, fees: 499000, feesFrom: "ledger", net: 11000 });
    expect(cardValues(L, "2026-03-01").find((x) => x.card === "old")).toMatchObject({ status: "cancelled", closeFee: 200000, net: -200000 });
  });

  it("check: a full card number is refused, a cancelled card with an open account is a warning", () => {
    const bad = checkFiles({ ...files, "data/cards.yaml": '- {id: x, kind: credit, account: plain, last4: "4238123412343584", status: cancelled}\n' });
    expect(bad.errors.map((e) => e.message).join("\n")).toMatch(/exactly 4 digits/);
    expect(bad.warnings.map((e) => e.message).join("\n")).toMatch(/cancelled, but account plain is still open/);
  });
});

describe("codes in MISA wallet names", () => {
  it("reads statement and due days, emoji categories, anniversary, spend band and last 4", () => {
    expect(parseCardName("Bank A *1234🗓️7💸3").details).toEqual({ statement_day: 7, due_day: 3, number_last4: "1234" });
    expect(parseCardName("Bank B • 🗓️06💸21").details).toEqual({ statement_day: 6, due_day: 21 });
    const lio = parseCardName("Wallet 5tr 🛒🏋️🍿📞 • 🗓️01 • 🎉02/25 • 1-5tr");
    expect(lio.warnings).toEqual([]);
    expect(lio.details).toEqual({
      statement_day: 1,
      fee_month: 2,
      anniversary: "2025-02",
      cashback: { min_spend: { amount: 1000000, per: "statement" }, spend_max: { amount: 5000000, per: "statement" }, rules: [{ categories: ["shopping", "health/sport", "fun/entertainment", "subscriptions"], rate: null }] },
    });
    expect(parseCardName("Card 🦄 • 🗓️40").warnings).toEqual(expect.arrayContaining([expect.stringMatching(/statement day 40/), expect.stringMatching(/no category for 🦄/)]));
  });

  it("a re-import never overwrites what the owner set", () => {
    const owner = { statement_day: 7, due_day: 3, limit: 50000000 }; // set by hand: no from_name
    expect(mergeNameCodes(owner, { statement_day: 8, due_day: 3 })).toBeNull();
    const fromName = mergeNameCodes(undefined, { statement_day: 8, due_day: 3 })!;
    expect(fromName).toEqual({ statement_day: 8, due_day: 3, from_name: ["due_day", "statement_day"] });
    expect(mergeNameCodes(fromName, { statement_day: 9, due_day: 3 })).toMatchObject({ statement_day: 9 });
    const rates = { cashback: { rules: [{ categories: ["shopping"], rate: 2 }] } };
    expect(mergeNameCodes(rates, { cashback: { rules: [{ categories: ["shopping"], rate: null }], min_spend: { amount: 1, per: "statement" } } })).toMatchObject({ cashback: { rules: [{ rate: 2 }], min_spend: { amount: 1 } } });
  });
});
