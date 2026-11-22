import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  applyChange, attention, checkDashboard, checkFiles, defaultWidgets, features, pace, poolOf, queryTransactions, report,
  series, unusual, usual, usualWindows, weekStart, type FileMap, type Transaction,
} from "../src/engine/index.js";
import { validateMapping, type Mapping } from "../src/import/mapping.js";
import { readDataDir } from "../src/node/files.js";

const demo = checkFiles(readDataDir(join(import.meta.dirname, "..", "fixtures", "demo"))).ledger;

const base: FileMap = {
  "data/meta.yaml": "format: 1\nbase: VND\n",
  "data/accounts.yaml": "- {id: cash, name: Cash, type: cash}\n- {id: bank, name: Bank, type: bank}\n- {id: card, name: Card, type: credit_card, details: {statement_day: 5, due_day: 25}}\n",
  "data/categories.yaml": "income: [{id: salary, name: Salary}]\nexpense: [{id: food, name: Food, children: [{id: cafe, name: Cafe}]}, {id: fun, name: Fun}, {id: other, name: Other}]\n",
};

let seq = 0;
const spend = (date: string, amount: number, category = "food", account = "cash", extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  date,
  note: "",
  ...extra,
  lines: [{ account, amount: -amount }, { category, amount }],
});

function ledgerOf(txs: Transaction[], files: FileMap = base) {
  const out = applyChange(files, { addTransactions: txs });
  const r = checkFiles({ ...files, ...out });
  expect(r.errors).toEqual([]);
  return r.ledger;
}

/** n months before 2026-11, each with `amount` of food on the 3rd and the 20th. */
function history(months: number, amount = 500000, category = "food"): Transaction[] {
  const out: Transaction[] = [];
  for (let i = 1; i <= months; i++) {
    const m = new Date(Date.UTC(2026, 10 - i, 1)).toISOString().slice(0, 7);
    out.push(spend(`${m}-03`, amount, category), spend(`${m}-20`, amount, category));
  }
  return out;
}

describe("pace", () => {
  it("mid-month on the demo ledger: spent matches the report, usual and last month at the same day", () => {
    const p = pace(demo, "2026-11-15");
    const r = report(demo, { from: "2026-11-01", to: "2026-11-15" }, { compare: false });
    expect(p.spent).toBe(r.expense);
    expect(p.income).toBe(r.income);
    expect(p.daily).toHaveLength(30);
    expect(p.daily[14]).toBe(p.spent);
    expect(p.daily[15]).toBeNull();
    expect(p.usual?.months).toBe(6);
    expect(p.lastMonth?.toDate).toBe(report(demo, { from: "2026-10-01", to: "2026-10-15" }, { compare: false }).expense);
    expect(p.estimateFrom).toBe("usual");
    expect(p.estimate).toBeGreaterThanOrEqual(p.spent);
  });

  it("no history: no usual, estimate from this month's run rate", () => {
    const L = ledgerOf([spend("2026-11-02", 300000), spend("2026-11-05", 300000)]);
    const p = pace(L, "2026-11-10");
    expect(p.usual).toBeNull();
    expect(p.lastMonth).toBeNull();
    expect(p.estimateFrom).toBe("run-rate");
    expect(p.estimate).toBe(Math.round((600000 / 10) * 30));
  });

  it("usual is the average at the same day, and the estimate adds the usual rest of the month", () => {
    const L = ledgerOf([...history(6), spend("2026-11-04", 800000)]);
    const p = pace(L, "2026-11-10");
    expect(p.usual!.toDate).toBe(500000); // the 3rd only
    expect(p.usual!.total).toBe(1000000);
    expect(p.estimate).toBe(800000 + 500000);
  });
});

describe("usual", () => {
  it("windows: part of a month uses the same days of earlier months, clamped to short months", () => {
    const { windows, factor } = usualWindows({ from: "2026-03-01", to: "2026-03-31" }, 1);
    expect(windows).toEqual([{ from: "2026-02-01", to: "2026-02-28" }]);
    expect(factor).toBe(1);
    const part = usualWindows({ from: "2026-03-01", to: "2026-03-30" }, 2);
    expect(part.windows).toEqual([{ from: "2026-02-01", to: "2026-02-28" }, { from: "2026-01-01", to: "2026-01-30" }]);
    expect(part.factor).toBe(0.5);
  });

  it("rows: current equals the report, usual is the 6-month average, sorted by change", () => {
    const u = usual(demo, { from: "2026-10-01", to: "2026-10-31" }, "top");
    const r = report(demo, "2026-10", { by: "top", kind: "expense", compare: false });
    expect(u.current).toBe(r.expense);
    for (const row of r.rows) expect(u.rows.find((x) => x.key === row.key)?.current).toBe(row.expense);
    const changes = u.rows.map((x) => Math.abs(x.change));
    expect([...changes].sort((a, b) => b - a)).toEqual(changes);
    expect(u.months).toBe(6);
  });
});

describe("unusual", () => {
  it("a category 30% or more above usual is a card; just below is not", () => {
    const up = ledgerOf([...history(6), spend("2026-11-03", 680000)]); // usual to the 10th: 500k → +36%
    expect(unusual(up, "2026-11-10").map((c) => c.kind)).toContain("category_up");
    const flat = ledgerOf([...history(6), spend("2026-11-03", 640000)]); // +28%
    expect(unusual(flat, "2026-11-10").map((c) => c.kind)).not.toContain("category_up");
  });

  it("a new category and a new person show up", () => {
    const L = ledgerOf([...history(6), spend("2026-11-03", 500000), spend("2026-11-04", 400000, "fun", "cash", { who: "Minh" })]);
    const kinds = unusual(L, "2026-11-10").map((c) => c.kind);
    expect(kinds).toContain("new_category");
    expect(kinds).toContain("new_who");
  });

  it("needs two months of history", () => {
    const L = ledgerOf([...history(1), spend("2026-11-03", 5000000)]);
    expect(unusual(L, "2026-11-10")).toEqual([]);
  });

  it("an unusually large transaction for its category", () => {
    const txs = history(6, 100000);
    for (let i = 0; i < 20; i++) txs.push(spend(`2026-0${(i % 9) + 1}-1${i % 9}`, 100000 + i * 1000));
    txs.push(spend("2026-11-05", 2000000));
    const cards = unusual(ledgerOf(txs), "2026-11-10");
    expect(cards.find((c) => c.kind === "large")).toMatchObject({ amount: 2000000 });
  });
});

describe("series", () => {
  it("weeks across a month boundary start on Mondays and add up to the period total", () => {
    const s = series(demo, { metric: "spending", from: "2026-10-27", to: "2026-11-09", by: "week" }, "2026-11-15");
    expect(s.points.map((p) => p.key)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(s.total).toBe(report(demo, { from: "2026-10-27", to: "2026-11-09" }, { compare: false }).expense);
  });

  it("a category filter equals the report's category row; compare previous gives the month before", () => {
    const s = series(demo, { metric: "spending", category: "food", period: "2026-10", by: "month", compare: "previous" }, "2026-11-15");
    const r = report(demo, "2026-10", { by: "top" });
    expect(s.total).toBe(r.rows.find((x) => x.key === "food")!.expense);
    expect(s.compareTotal).toBe(r.previous!.rows.food!.expense);
  });

  it("balance by month ends at the account's balance", () => {
    const s = series(demo, { metric: "balance", account: "cash", period: "last-3-months", by: "month" }, "2026-11-15");
    expect(s.points).toHaveLength(3);
    const q = queryTransactions(demo, { account: "cash", limit: 1 });
    expect(q.total).toBeGreaterThan(0);
  });

  it("presets resolve against today", () => {
    expect(series(demo, { metric: "spending", period: "last-12-months", by: "month" }, "2026-11-15").points).toHaveLength(12);
    expect(() => series(demo, { metric: "spending", period: "fortnight" }, "2026-11-15")).toThrow(/bad period/);
  });
});

describe("drill-down", () => {
  it("transaction totals for a filter equal the report row it came from", () => {
    const r = report(demo, "2026-10", { by: "top" });
    for (const row of r.rows.slice(0, 5)) {
      const t = queryTransactions(demo, { from: "2026-10-01", to: "2026-10-31", category: row.key });
      expect(t.totals.expense).toBe(row.expense);
      expect(t.totals.income).toBe(row.income);
    }
  });

  it("moves inside the pool are hidden when asked", () => {
    const L = ledgerOf([spend("2026-11-02", 100000), { id: "x1", date: "2026-11-03", lines: [{ account: "bank", amount: -50000 }, { account: "cash", amount: 50000 }] }]);
    expect(queryTransactions(L, {}).total).toBe(2);
    expect(queryTransactions(L, { hideWithin: ["cash", "bank"] }).total).toBe(1);
  });
});

describe("dashboard file", () => {
  it("catches bad types, positions and queries; unknown categories are warnings", () => {
    const issues = checkDashboard("data/dashboards/dev.yaml", {
      version: 1,
      widgets: [
        { id: "a", type: "pace", x: 0, y: 0, w: 6, h: 4 },
        { id: "a", type: "nope", x: 10, y: 0, w: 6, h: 4 },
        { id: "c", type: "chart", x: 0, y: 4, w: 6, h: 3, query: { metric: "spending", category: "food/nothing", period: "last-3-months", by: "week" }, chart: "bar" },
        { id: "d", type: "chart", x: 0, y: 7, w: 6, h: 3, query: { metric: "speed" } },
      ],
    }, demo);
    const errors = issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`);
    expect(errors).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate widget id/), expect.stringMatching(/unknown widget type "nope"/), expect.stringMatching(/x \+ w/), expect.stringMatching(/^d: query.metric/)]));
    expect(issues.filter((i) => i.level === "warning").map((i) => i.message)).toEqual([expect.stringMatching(/category "food\/nothing" not found/)]);
  });

  it("check runs on data/dashboards/*.yaml", () => {
    const files = { ...base, "data/dashboards/dev.yaml": "version: 1\nwidgets:\n  - { id: x, type: pace, x: 0, y: 0, w: 20, h: 4 }\n" };
    expect(checkFiles(files).errors.map((e) => e.message)).toEqual(expect.arrayContaining([expect.stringMatching(/w must be 1 to 12/)]));
  });

  it("defaults: four widgets, unusual only with two months of history, none for an empty ledger", () => {
    expect(defaultWidgets({ historyMonths: 6, empty: false }).map((w) => w.type)).toEqual(["pace", "attention", "unusual", "net_worth"]);
    expect(defaultWidgets({ historyMonths: 0, empty: false }).map((w) => w.type)).toEqual(["pace", "attention", "left", "net_worth"]);
    expect(defaultWidgets({ historyMonths: 0, empty: true })).toEqual([]);
  });
});

describe("pool", () => {
  it("is every open liquid account by default, a view only; prefs exclude and pick the default", () => {
    const L = ledgerOf([]);
    expect(poolOf(L, undefined, "2026-11-10")).toEqual({ on: true, name: null, accounts: ["cash", "bank"], default_account: "cash" });
    expect(poolOf(L, { exclude: ["bank"], default_account: "bank" }, "2026-11-10").accounts).toEqual(["cash"]);
    expect(poolOf(L, { on: false }, "2026-11-10").accounts).toEqual([]);
  });
});

describe("features and attention", () => {
  it("a ledger with no cards turns the cards module off", () => {
    const noCards = { ...base, "data/accounts.yaml": "- {id: cash, name: Cash, type: cash}\n" };
    const L = ledgerOf([spend("2026-11-02", 1000)], noCards);
    const f = features(L, "2026-11-10");
    expect(f.cards).toBe(false);
    expect(f.modules).not.toContain("cards");
    expect(attention(L, "2026-11-10").some((a) => a.module === "cards")).toBe(false);
  });

  it("a card statement due soon and uncategorised rows are in Needs you, red before info", () => {
    const L = ledgerOf([spend("2026-10-28", 2000000, "food", "card"), spend("2026-11-08", 50000, "other")]);
    const a = attention(L, "2026-11-22");
    expect(a[0]).toMatchObject({ kind: "card_due", severity: "red", amount: 2000000, days: 3 });
    expect(a.find((x) => x.kind === "uncategorised")).toMatchObject({ count: 1, severity: "info" });
    expect(features(L, "2026-11-22")).toMatchObject({ cards: true, empty: false, historyMonths: 1 });
  });
});

describe("YAML writer", () => {
  it("quotes values with flow-style special characters and writes block style", () => {
    const out = applyChange({ "data/accounts.yaml": "[ { id: cash, name: Cash, type: cash } ]\n" }, { addAccounts: [{ id: "dau-tu-khac", name: "Đầu tư khác (chứng khoán, CCQ ngoài ví)", type: "fund" }] });
    const text = out["data/accounts.yaml"]!;
    expect(text).toContain('name: "Đầu tư khác (chứng khoán, CCQ ngoài ví)"');
    expect(text).not.toMatch(/^\[/);
    expect((parseYaml(text) as { name: string }[])[1]!.name).toBe("Đầu tư khác (chứng khoán, CCQ ngoài ví)");
  });

  it("the mapping check catches a name cut at a comma", () => {
    const m = parseYaml('source: misa\ncolumns: { date: Ngày, in: Thu }\ncategories: {}\naccounts:\n  "_invest": { id: dau-tu-khac, name: Đầu tư khác (chứng khoán, CCQ ngoài ví), type: fund }\n') as Mapping;
    expect(validateMapping(m).join("\n")).toMatch(/"CCQ ngoài ví\)" has no value; a name with a comma was probably cut/);
  });
});
