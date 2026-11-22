/**
 * Writes fixtures/demo (a made-up multi-year ledger covering every account type) and
 * fixtures/future (unknown type and unknown detail keys that must still load).
 * Everything here is invented. Deterministic: re-running gives the same files.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { addMonths, dayIn, daysInMonth, fmt, parts } from "../src/engine/dates.js";
import { defaultCategories } from "../src/engine/defaults.js";
import { ledgerPath } from "../src/engine/load.js";
import type { Account, Line, Plan, Transaction } from "../src/engine/types.js";

const ROOT = join(import.meta.dirname, "..", "fixtures");

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;
const between = (lo: number, hi: number, step = 1000) => Math.round((lo + rnd() * (hi - lo)) / step) * step;

const accounts: Account[] = [
  { id: "cash", name: "Ví tiền mặt", type: "cash", opened: "2023-01-01" },
  { id: "vcb", name: "Vietcombank", type: "bank", opened: "2023-01-01", details: { bank: "VCB", number_last4: "0001" } },
  { id: "momo", name: "MoMo", type: "ewallet", opened: "2023-01-01", details: { provider: "MoMo" } },
  { id: "card-visa", name: "Thẻ Visa", type: "credit_card", opened: "2023-03-01", details: { statement_day: 20, due_day: 5, limit: 50000000, bank: "Demo Bank", product: "Demo Visa Cashback" } },
  { id: "spaylater", name: "SPayLater", type: "bnpl", opened: "2024-02-01", details: { provider: "Shopee", limit: 10000000, due_day: 10 } },
  { id: "dep-2024", name: "Sổ tiết kiệm 2024", type: "deposit", opened: "2024-01-15", closed: "2024-07-15", details: { bank: "VCB", principal: 50000000, rate: 4.8, term_months: 6, start: "2024-01-15", rollover: "none" } },
  { id: "dep-6m", name: "Sổ tiết kiệm 6 tháng", type: "deposit", opened: "2026-06-01", details: { bank: "VCB", principal: 100000000, rate: 5.2, term_months: 6, start: "2026-06-01", rollover: "principal" } },
  { id: "goal-trip", name: "Quỹ du lịch Nhật", type: "savings_goal", opened: "2025-01-01", details: { target: 60000000, by: "2027-03-01" } },
  { id: "gold", name: "Vàng nhẫn", type: "gold", asset: "GOLD_CHI", opened: "2023-06-01" },
  { id: "fund-vesaf", name: "Quỹ VESAF", type: "fund", asset: "VESAF", opened: "2024-01-01", details: { broker: "Demo Fund Co" } },
  { id: "stock-fpt", name: "Cổ phiếu FPT", type: "stock", asset: "FPT", opened: "2024-05-01", details: { broker: "Demo Securities" } },
  { id: "etf-e1", name: "ETF E1VFVN30", type: "etf", asset: "E1VFVN30", opened: "2025-01-01", details: { broker: "Demo Securities" } },
  { id: "btc", name: "Bitcoin", type: "crypto", asset: "BTC", opened: "2025-06-01" },
  { id: "ins-life", name: "Bảo hiểm nhân thọ", type: "insurance", opened: "2023-04-01", details: { insurer: "Demo Life", cash_value: 12000000 } },
  { id: "loan-an", name: "Cho An mượn", type: "loan_given", opened: "2024-03-01", details: { borrower: "An" } },
  { id: "loan-home", name: "Vay sửa nhà", type: "loan_taken", opened: "2025-03-01", details: { lender: "Demo Bank", rate: 9.5 } },
  { id: "misc", name: "Khác", type: "other", opened: "2023-01-01" },
];

const assets = [
  { id: "VND", name: "Việt Nam đồng", kind: "currency", decimals: 0 },
  { id: "GOLD_CHI", name: "Vàng nhẫn 9999", kind: "gold", unit: "chỉ" },
  { id: "VESAF", name: "Quỹ VESAF", kind: "fund", unit: "ccq" },
  { id: "FPT", name: "FPT", kind: "stock", unit: "cp" },
  { id: "E1VFVN30", name: "E1VFVN30", kind: "etf", unit: "ccq" },
  { id: "BTC", name: "Bitcoin", kind: "crypto", unit: "BTC" },
];

const plans: Plan[] = [
  { id: "p-phone", kind: "instalment", account: "card-visa", name: "Trả góp điện thoại", principal: 24000000, count: 12, every: "month", start: "2025-09-20", fee: 0 },
  { id: "p-life", kind: "insurance_premium", account: "vcb", name: "Phí bảo hiểm nhân thọ", amount: 12000000, every: "year", start: "2023-04-10" },
  { id: "p-home", kind: "loan_taken", account: "loan-home", name: "Trả nợ vay sửa nhà", principal: 120000000, count: 36, every: "month", start: "2025-04-01", rate: 9.5 },
];

// price paths (base VND per unit), monthly
const priceStart: Record<string, number> = { GOLD_CHI: 5500000, VESAF: 22000, FPT: 90000, E1VFVN30: 21000, BTC: 1500000000 };
const prices: string[] = ["date,asset,price"];
const priceAt = new Map<string, number>();
{
  const cur = { ...priceStart };
  for (let i = 0; i < 47; i++) {
    const d = addMonths("2023-01-01", i);
    const mEnd = dayIn(...(parts(d).slice(0, 2) as [number, number]), 31);
    for (const k of Object.keys(cur)) {
      const drift = k === "BTC" ? 0.12 : k === "GOLD_CHI" ? 0.03 : 0.05;
      cur[k] = Math.max(1, Math.round(cur[k]! * (1 + (rnd() - 0.42) * drift)));
      priceAt.set(`${k}:${mEnd.slice(0, 7)}`, cur[k]!);
      if ((k === "BTC" && d < "2025-06-01") || (k === "E1VFVN30" && d < "2025-01-01")) continue;
      prices.push(`${mEnd},${k},${cur[k]}`);
    }
  }
}
const px = (asset: string, date: string) => priceAt.get(`${asset}:${date.slice(0, 7)}`) ?? priceStart[asset]!;

const txs: Transaction[] = [];
let n = 0;
const tx = (date: string, note: string, lines: Line[], extra: Partial<Transaction> = {}) => {
  n++;
  txs.push({ id: `t_demo${String(n).padStart(5, "0")}`, date, time: null, note, lines, ...extra });
};
const spend = (date: string, from: string, cat: string, amount: number, note: string, extra: Partial<Transaction> = {}) =>
  tx(date, note, [{ account: from, amount: -amount }, { category: cat, amount }], extra);
const earn = (date: string, to: string, cat: string, amount: number, note: string) =>
  tx(date, note, [{ account: to, amount }, { category: cat, amount: -amount }]);
const move = (date: string, from: string, to: string, amount: number, note: string, extra: Partial<Transaction> = {}) =>
  tx(date, note, [{ account: from, amount: -amount }, { account: to, amount }], extra);
const buy = (date: string, from: string, to: string, asset: string, qty: number, note: string) => {
  const amount = Math.round(qty * px(asset, date));
  tx(date, note, [{ account: from, amount: -amount }, { account: to, asset, qty, amount }]);
};

// opening balances
tx("2023-01-01", "Số dư ban đầu", [
  { account: "cash", amount: 3000000 },
  { account: "vcb", amount: 45000000 },
  { account: "momo", amount: 500000 },
  { category: "_opening", amount: -48500000 },
]);

let cardBal = 0; // negative = owed
const end = "2026-10-31";
for (let i = 0; i < 46; i++) {
  const m0 = addMonths("2023-01-01", i);
  const [y, m] = parts(m0);
  const dim = daysInMonth(y, m);
  const d = (day: number) => fmt(y, m, Math.min(day, dim));
  // pay card in full on the 5th for last month's charges
  if (m0 >= "2023-04-01" && cardBal < 0) {
    move(d(5), "vcb", "card-visa", -cardBal, "Thanh toán thẻ Visa");
    cardBal = 0;
  }
  earn(d(5), "vcb", "salary", 30000000 + Math.floor(i / 12) * 3000000, "Lương tháng");
  if (i % 3 === 1) earn(d(18), "vcb", "freelance", between(3000000, 9000000, 100000), "Dự án làm thêm");
  spend(d(8), "vcb", "home/electricity", between(600000, 1400000), "Tiền điện", { who: null });
  spend(d(9), "vcb", "home/internet", 250000, "Internet");
  spend(d(10), "vcb", "family/parents", 3000000, "Gửi bố mẹ", { who: "Bố mẹ" });
  move(d(6), "vcb", "cash", 4000000, "Rút tiền mặt");
  move(d(6), "vcb", "momo", 2000000, "Nạp MoMo");
  if (m0 >= "2025-01-01") move(d(7), "vcb", "goal-trip", 2000000, "Để dành đi Nhật");
  for (let k = 0; k < 14; k++) {
    const day = 1 + Math.floor(rnd() * dim);
    const kind = pick(["eat", "eat", "cafe", "groceries", "fuel", "fares"]);
    const from = m0 >= "2023-03-01" && rnd() < 0.35 ? "card-visa" : pick(["cash", "momo"]);
    const amount =
      kind === "eat" ? between(40000, 250000) : kind === "cafe" ? between(30000, 80000) : kind === "groceries" ? between(150000, 600000) : kind === "fuel" ? between(60000, 90000) : between(10000, 50000);
    const cat = { eat: "food/eating-out", cafe: "food/cafe", groceries: "food/groceries", fuel: "transport/fuel", fares: "transport/fares" }[kind]!;
    spend(d(day), from, cat, amount, pick(["", "Ăn trưa", "Cafe sáng", "Đi chợ", "Đổ xăng", "Gửi xe"]) || cat);
    if (from === "card-visa") cardBal -= amount;
  }
  if (i % 4 === 2) {
    spend(d(15), "card-visa", "work-tools", between(250000, 1200000), "Tên miền & hosting", { tags: ["work"] });
    cardBal -= txs[txs.length - 1]!.lines[1]!.amount;
  }
  if (i % 6 === 3) spend(d(22), "momo", "shopping/clothes", between(300000, 1500000), "Quần áo");
  if (i % 12 === 7) spend(d(12), "vcb", "fun/trips", between(5000000, 12000000), "Du lịch Đà Lạt", { event: "Đà Lạt " + y });
  if (m0 >= "2024-02-01" && i % 5 === 0) {
    const a = between(500000, 2000000);
    spend(d(14), "spaylater", "shopping/clothes", a, "Mua Shopee trả sau");
    move(addMonths(d(10), 1), "vcb", "spaylater", a, "Trả SPayLater");
  }
  // card instalment payments are charges on the card
  if (m0 >= "2025-09-01" && m0 <= "2026-08-01") {
    spend(d(20), "card-visa", "shopping/big-purchases", 2000000, "Trả góp điện thoại", { plan: "p-phone" });
    cardBal -= 2000000;
  }
  if (m0 >= "2024-01-01") buy(d(16), "vcb", "fund-vesaf", "VESAF", Math.round((2000000 / px("VESAF", d(16))) * 100) / 100, "Mua CCQ VESAF");
  if (m0 >= "2025-01-01" && i % 2 === 0) buy(d(16), "vcb", "etf-e1", "E1VFVN30", 50, "Mua E1VFVN30");
  if (m0 >= "2025-04-01" && m0 <= end) {
    // home loan: principal + interest
    tx(d(1), "Trả nợ vay sửa nhà", [
      { account: "vcb", amount: -4300000 },
      { account: "loan-home", amount: 3333333 },
      { category: "bank-fees", amount: 966667 },
    ], { plan: "p-home" });
  }
}
// one-offs
buy("2023-06-10", "vcb", "gold", "GOLD_CHI", 2, "Mua 2 chỉ vàng");
buy("2024-12-20", "vcb", "gold", "GOLD_CHI", 1, "Mua 1 chỉ vàng");
tx("2025-11-02", "Bán 1 chỉ vàng", [{ account: "gold", asset: "GOLD_CHI", qty: -1, amount: -px("GOLD_CHI", "2023-06-10") }, { account: "vcb", amount: px("GOLD_CHI", "2025-11-02") }, { category: "interest", amount: px("GOLD_CHI", "2023-06-10") - px("GOLD_CHI", "2025-11-02") }]);
buy("2024-05-20", "vcb", "stock-fpt", "FPT", 100, "Mua 100 FPT");
earn("2025-07-15", "vcb", "interest", 200000, "Cổ tức FPT");
buy("2025-06-12", "vcb", "btc", "BTC", 0.002, "Mua BTC");
move("2024-01-15", "vcb", "dep-2024", 50000000, "Gửi tiết kiệm 6 tháng");
move("2024-07-15", "dep-2024", "vcb", 50000000, "Tất toán sổ tiết kiệm");
earn("2024-07-15", "vcb", "interest", 1196712, "Lãi sổ tiết kiệm");
move("2026-06-01", "vcb", "dep-6m", 100000000, "Gửi tiết kiệm 6 tháng");
move("2024-03-05", "vcb", "loan-an", 5000000, "Cho An mượn", { who: "An" });
move("2025-02-10", "loan-an", "cash", 5000000, "An trả tiền", { who: "An" });
move("2025-03-01", "loan-home", "vcb", 120000000, "Giải ngân vay sửa nhà");
spend("2025-03-10", "vcb", "home/repairs", 95000000, "Sửa nhà");
for (let y = 2023; y <= 2026; y++) {
  spend(`${y}-04-10`, "vcb", "health/insurance", 12000000, "Phí bảo hiểm nhân thọ", { plan: "p-life" });
}
earn("2026-01-25", "momo", "cashback", 85000, "Hoàn tiền MoMo");
earn("2024-02-10", "cash", "gifts-received", 2000000, "Lì xì Tết");
// a voided one, kept for history
spend("2026-10-12", "cash", "other", 999000, "Nhập nhầm", { void: true });
// this statement period on the card (2026-10-21 →): groceries, a refund and cashback
spend("2026-10-27", "card-visa", "food/groceries", 350000, "Đi siêu thị");
earn("2026-10-29", "card-visa", "cashback", 25000, "Hoàn tiền thẻ Visa");
tx("2026-10-30", "Siêu thị hoàn tiền hàng lỗi", [{ account: "card-visa", amount: 50000 }, { category: "food/groceries", amount: -50000 }]);

// write
function write(dir: string, files: Record<string, string>) {
  rmSync(dir, { recursive: true, force: true });
  for (const [p, c] of Object.entries(files)) {
    const f = join(dir, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c);
  }
}

const y = (v: unknown) => stringify(v, { lineWidth: 0 });
const ledgerFiles: Record<string, string> = {};
txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
for (const t of txs) {
  const p = ledgerPath(t.date);
  ledgerFiles[p] = (ledgerFiles[p] ?? "") + JSON.stringify(t) + "\n";
}
const demo = {
  "data/meta.yaml": y({ format: 1, base: "VND", locale: "vi", owner: "demo-user", name: "Demo ledger (made up)" }),
  "data/assets.yaml": y(assets),
  "data/accounts.yaml": y(accounts),
  "data/categories.yaml": y(defaultCategories("vi")),
  "data/plans.yaml": y(plans),
  "data/budgets.yaml": y([{ category: "food", amount: 4000000, every: "month" }, { category: "fun", amount: 15000000, every: "year" }]),
  "data/prices.csv": prices.join("\n") + "\n",
  ...ledgerFiles,
};
write(join(ROOT, "demo"), demo);

const future = {
  "data/meta.yaml": y({ format: 1, base: "VND", locale: "en", some_future_setting: true }),
  "data/accounts.yaml": y([
    { id: "cash", name: "Cash", type: "cash" },
    { id: "pension", name: "Voluntary pension", type: "pension_fund", details: { provider: "Future Co", vesting_year: 2045 } },
    { id: "card", name: "Card", type: "credit_card", details: { statement_day: 25, due_day: 10, limit: 20000000, cashback_tier: "gold", reward_points: 1200 }, colour: "#123456" },
  ]),
  "data/categories.yaml": y(defaultCategories("en")),
  "data/ledger/2026/01.jsonl": [
    { id: "t1", date: "2026-01-01", lines: [{ account: "cash", amount: 1000000 }, { category: "_opening", amount: -1000000 }] },
    { id: "t2", date: "2026-01-05", lines: [{ account: "cash", amount: -500000 }, { account: "pension", amount: 500000 }], mood: "happy" },
    { id: "t3", date: "2026-01-07", lines: [{ account: "card", amount: -120000 }, { category: "food/cafe", amount: 120000, receipt: "r-1" }] },
  ].map((t) => JSON.stringify(t)).join("\n") + "\n",
};
write(join(ROOT, "future"), future);
console.log(`demo: ${txs.length} transactions, ${Object.keys(ledgerFiles).length} ledger files`);
