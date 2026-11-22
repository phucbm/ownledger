import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as A from "../engine/actions.js";
import { accountValues } from "../engine/balances.js";
import { flattenCategories, SYSTEM_CATEGORIES } from "../engine/categories.js";
import { addMonths, todayIn } from "../engine/dates.js";
import { netWorth, netWorthSeries } from "../engine/networth.js";
import { typeDef } from "../engine/registry.js";
import { queryTransactions, report, type GroupBy } from "../engine/reports.js";
import { cards, deposits, planStatus, plansDue, today } from "../engine/schedules.js";
import type { Transaction } from "../engine/types.js";
import type { Env, Props } from "./env.js";
import { MainMovedError } from "./github.js";
import { applyPending, savePending, snapshot, sourceFor, type DataSource } from "./store.js";
import { VERSION } from "./version.js";
import { attention } from "../engine/attention.js";
import { dashboardPath, defaultWidgets, GRID_COLS, poolOf, writeDashboard, type Dashboard, type Widget } from "../engine/dashboard.js";
import { features } from "../engine/features.js";
import { series, type SeriesQuery } from "../engine/insights.js";
import { yamlText } from "../engine/write.js";
import { dashboardOf } from "./api.js";
import { cardList } from "../modules/cards/index.js";
import { cashback, closeOnOrAfter, feeWaiver, lineKind, nextClose, statements } from "../modules/cards/statements.js";
import { cardsData, STATEMENTS_FILE, termsOf, recordFor } from "../modules/cards/terms.js";
import { parse as parseYaml } from "yaml";
import { bestCard } from "./bestcard.js";
import { openWalletClient, type OpenWallet } from "./openwallet.js";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const out = (v: unknown): Result => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v) }] });
const fail = (msg: string): Result => ({ content: [{ type: "text", text: msg }], isError: true });

const INSTRUCTIONS = `ownledger: the owner's personal finance ledger, kept in their private GitHub repo.
Amounts are whole numbers in the base currency (see about). Answers are computed here; never add up raw rows yourself when a tool computes it.
Writes: the add_/edit_/void_/set_/remove_ tools only PREVIEW. Show the owner the preview (what, amounts, accounts), wait for their explicit go, then call apply with the preview_id. Never invent an amount, date, account or category: ask. Call rules once before the first write.
Dashboard: when the owner asks to "track", "watch" or "put on my dashboard" something, offer a widget (add_widget), using the categories and accounts from rules.
Cards: for "which card should I use", call best_card; statements, cashback and fee waivers come from cards and card_statement.`;
const OPENWALLET_LINE = `
best_card also asks OpenWallet (an outside card catalog the owner turned on) for cards without the owner's own cashback terms: give it the amount and a merchant or kind. It gets those cards' product names, the purchase and their spend this period. Quote OpenWallet's figures with its date and link (source: openwallet); unknown is not 0. If a card is in not_matched, say so and how to fix it.`;

function compactTx(t: Transaction) {
  return {
    id: t.id,
    date: t.date,
    ...(t.time ? { time: t.time } : {}),
    note: t.note ?? "",
    ...(t.who ? { who: t.who } : {}),
    ...(t.event ? { event: t.event } : {}),
    ...(t.tags?.length ? { tags: t.tags } : {}),
    ...(t.plan ? { plan: t.plan } : {}),
    ...(t.void ? { void: true } : {}),
    ...(t.trail?.length ? { reason: t.trail[t.trail.length - 1]!.reason } : {}),
    lines: t.lines.map((l) => [l.account ?? l.category, l.amount, ...(l.qty !== undefined ? [`${l.qty} ${l.asset ?? ""}`.trim()] : [])]),
  };
}

const lineSchema = z.object({
  account: z.string().optional(),
  category: z.string().optional(),
  amount: z.number().int(),
  asset: z.string().optional(),
  qty: z.number().optional(),
});

const txFields = {
  date: z.string().describe("yyyy-mm-dd"),
  time: z.string().optional().describe("HH:MM"),
  note: z.string().optional(),
  kind: z.enum(["expense", "income", "transfer"]).optional().describe("simple form; or give lines"),
  amount: z.number().int().positive().optional().describe("simple form: positive, whole base-currency units"),
  account: z.string().optional().describe("expense: paid from; income: received into; transfer: from. Omit to use the pool's default account (see rules)"),
  to_account: z.string().optional().describe("transfer: to"),
  category: z.string().optional().describe("category path, e.g. food/eating-out"),
  lines: z.array(lineSchema).optional().describe("full form: balanced lines (sum 0); for splits, assets with qty, etc."),
  who: z.string().optional(),
  event: z.string().optional(),
  tags: z.array(z.string()).optional(),
  plan: z.string().optional().describe("plan id this pays (instalment, loan, premium)"),
};

const reason = z
  .string()
  .trim()
  .min(3)
  .max(A.REASON_MAX)
  .describe("Required. One line: what the owner asked for, close to their own words (kept on the transaction's trail and in the commit).");

export interface Deps {
  /** OpenWallet client; by default made from env.OPENWALLET_URL (unset = off) */
  openwallet?: OpenWallet | null;
}

export function buildServer(env: Env, props: Props, src: DataSource = sourceFor(env), deps: Deps = {}): McpServer {
  const ow = deps.openwallet !== undefined ? deps.openwallet : env.OPENWALLET_URL ? openWalletClient(env.OPENWALLET_URL) : null;
  const server = new McpServer({ name: "ownledger", version: VERSION }, { instructions: INSTRUCTIONS + (ow ? OPENWALLET_LINE : "") });
  const tz = env.TIMEZONE || "Asia/Ho_Chi_Minh";
  const now = () => todayIn(tz);
  const snap = () => snapshot(env, src);
  const ro = { readOnlyHint: true, openWorldHint: false } as const;
  const meta = (reason: string): A.WriteMeta => ({ via: "mcp", ...(props.client ? { client: props.client } : {}), reason });

  const wrap =
    <T,>(fn: (args: T) => Promise<unknown>) =>
    async (args: T): Promise<Result> => {
      try {
        return out(await fn(args));
      } catch (e) {
        if (e instanceof A.ActionError || e instanceof MainMovedError) return fail(e.message);
        return fail(`error: ${(e as Error).message}`);
      }
    };

  const preview = async (build: (files: Record<string, string>) => A.Planned) => {
    const s = await snap();
    const p = build(s.files);
    const id = await savePending(env, { baseSha: s.sha, files: p.files, message: p.message, summary: p.summary, created: new Date().toISOString() });
    const shown: unknown[] = [];
    for (const t of [...(p.change.addTransactions ?? []), ...(p.change.replaceTransactions ?? [])].slice(0, 20)) shown.push(compactTx(t));
    return {
      preview_id: id,
      will: p.summary,
      commit_message: p.message,
      ...(shown.length ? { transactions: shown } : {}),
      ...(p.warnings.length ? { warnings: p.warnings.map((w) => w.message) } : {}),
      next: "Show this to the owner. Only after their explicit go, call apply with this preview_id.",
    };
  };

  /** The signed-in person's "My money" pool: how writes pick an account when none is named. */
  const poolRule = (files: Record<string, string>, L: import("../engine/types.js").Ledger) => {
    const p = poolOf(L, dashboardOf(files, props.login)?.prefs?.pool, now());
    return p.on
      ? { on: true, accounts: p.accounts, default_account: p.default_account, rule: `Everyday money (${p.accounts.join(", ")}) is one pool: when the owner doesn't name a wallet, spending and income go to ${p.default_account} and paying a card is one transfer ${p.default_account} → card. A named wallet ("paid by MoMo") is used as named.` }
      : { on: false, rule: "Ask which account when it isn't named." };
  };

  /* ---------------------------------------------------------------- read */

  server.registerTool("about", { description: "Version, data repo, last commit, base currency, counts, today's date.", annotations: ro }, wrap(async () => {
    const s = await snap();
    return {
      ownledger: VERSION,
      format: s.ledger.meta.format,
      data: src.label,
      commit: s.sha.slice(0, 12),
      base: s.ledger.meta.base,
      locale: s.ledger.meta.locale,
      signed_in: props.login,
      today: now(),
      accounts: s.ledger.accounts.length,
      transactions: s.ledger.transactions.filter((t) => !t.void).length,
      check: { errors: s.errors, warnings: s.warnings },
      dashboard: `data/dashboards/${props.login.toLowerCase()}.yaml (dashboard / add_widget tools)`,
    };
  }));

  server.registerTool("rules", { description: "What to follow before writing, plus the category list and the accounts (ids). Call once before the first write.", annotations: ro }, wrap(async () => {
    const s = await snap();
    const { map } = flattenCategories(s.ledger.categories);
    return {
      rules: [
        "Every write: preview (add_/edit_/void_ tools) → show the owner → their explicit go → apply(preview_id).",
        "Never invent amounts, dates, accounts or categories; ask when unsure.",
        "Amounts are positive whole numbers in the base currency in the simple form; lines are signed and sum to 0.",
        "Moves between the owner's accounts (card payments, savings, investments, loans) are transfers, never expense or income.",
        "Correct a mistake with edit_transaction or void_transaction; never add a reversing entry unless asked.",
        "Every add_/edit_/void_transaction needs reason: one line saying what the owner asked, close to their own words (it is kept on the transaction and in the commit).",
      ],
      base: s.ledger.meta.base,
      categories: {
        income: [...map.values()].filter((c) => c.kind === "income").map((c) => `${c.path}: ${c.name}`),
        expense: [...map.values()].filter((c) => c.kind === "expense").map((c) => `${c.path}: ${c.name}`),
        system: Object.entries(SYSTEM_CATEGORIES).map(([k, v]) => `${k}: ${v.en}`),
      },
      accounts: s.ledger.accounts.filter((a) => !a.closed).map((a) => `${a.id}: ${a.name} (${a.type})`),
      pool: poolRule(s.files, s.ledger),
    };
  }));

  server.registerTool(
    "accounts",
    {
      description: "Accounts with balances (value for holdings), grouped by type. Closed accounts only when asked.",
      inputSchema: z.object({ type: z.string().optional(), include_closed: z.boolean().optional(), date: z.string().optional() }),
      annotations: ro,
    },
    wrap(async ({ type, include_closed, date }) => {
      const s = await snap();
      const asOf = date ?? now();
      const vals = accountValues(s.ledger, asOf).filter((v) => (include_closed || !v.account.closed) && (!type || v.account.type === type));
      const groups: Record<string, { total: number; accounts: unknown[] }> = {};
      for (const v of vals) {
        const g = (groups[v.account.type] ??= { total: 0, accounts: [] });
        g.total += v.value;
        g.accounts.push({
          id: v.account.id,
          name: v.account.name,
          value: v.value,
          ...(v.qty !== null ? { qty: v.qty, asset: v.asset, cost: v.cost, ...(v.priced ? {} : { unpriced: true }) } : {}),
          ...(v.account.closed ? { closed: v.account.closed } : {}),
          ...(typeDef(v.account.type) ? {} : { unknown_type: true }),
        });
      }
      return { date: asOf, base: s.ledger.meta.base, by_type: groups };
    }),
  );

  server.registerTool(
    "transactions",
    {
      description: "Search transactions (newest first, paginated). Lines are [account or category, signed amount].",
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        account: z.string().optional(),
        category: z.string().optional().describe("path prefix, e.g. food"),
        text: z.string().optional().describe("in note, who, event, tags; accents ignored"),
        min: z.number().optional(),
        max: z.number().optional(),
        plan: z.string().optional(),
        include_void: z.boolean().optional(),
        offset: z.number().int().optional(),
        limit: z.number().int().max(200).optional(),
      }),
      annotations: ro,
    },
    wrap(async (q) => {
      const s = await snap();
      const r = queryTransactions(s.ledger, { ...q, includeVoid: q.include_void, limit: q.limit ?? 30 });
      return { total: r.total, offset: q.offset ?? 0, items: r.items.map(compactTx) };
    }),
  );

  server.registerTool(
    "report",
    {
      description: "Income and spending for a period, grouped, compared with the previous period. Transfers never count.",
      inputSchema: z.object({
        period: z.string().optional().describe("yyyy-mm or yyyy; default this month"),
        from: z.string().optional(),
        to: z.string().optional(),
        by: z.enum(["category", "top", "account", "who", "event", "tag", "month"]).optional().describe("default top (top-level category)"),
        kind: z.enum(["income", "expense"]).optional(),
        category: z.string().optional(),
        account: z.string().optional(),
        compare: z.boolean().optional(),
        limit: z.number().int().optional(),
      }),
      annotations: ro,
    },
    wrap(async (o) => {
      const s = await snap();
      const period = o.from && o.to ? { from: o.from, to: o.to } : (o.period ?? now().slice(0, 7));
      const r = report(s.ledger, period, { by: (o.by ?? "top") as GroupBy, kind: o.kind, category: o.category, account: o.account, compare: o.compare });
      const rows = r.rows.slice(0, o.limit ?? 25).map((x) => ({
        key: x.key,
        name: x.name,
        ...(x.income ? { income: x.income } : {}),
        ...(x.expense ? { expense: x.expense } : {}),
        count: x.count,
        ...(r.previous ? { prev: r.previous.rows[x.key] ? (x.income ? r.previous.rows[x.key]!.income : r.previous.rows[x.key]!.expense) : 0 } : {}),
      }));
      return {
        period: r.period,
        base: s.ledger.meta.base,
        income: r.income,
        expense: r.expense,
        net: r.net,
        ...(r.previous ? { previous: { period: r.previous.period, income: r.previous.income, expense: r.previous.expense, net: r.previous.net } } : {}),
        rows,
        ...(r.rows.length > rows.length ? { more_rows: r.rows.length - rows.length } : {}),
      };
    }),
  );

  server.registerTool(
    "net_worth",
    {
      description: "Net worth now (or at a date), by account type; optionally a monthly series.",
      inputSchema: z.object({ date: z.string().optional(), months: z.number().int().max(240).optional().describe("monthly series length, e.g. 12") }),
      annotations: ro,
    },
    wrap(async ({ date, months }) => {
      const s = await snap();
      const asOf = date ?? now();
      const nw = netWorth(s.ledger, asOf);
      return {
        ...nw,
        ...(months ? { series: netWorthSeries(s.ledger, addMonths(asOf.slice(0, 7) + "-01", -(months - 1)), asOf).map((x) => ({ date: x.date, net: x.net, assets: x.assets, liabilities: x.liabilities })) } : {}),
      };
    }),
  );

  server.registerTool("cards", { description: "Credit cards: owed, limit, last statement (to pay, due, paid or not), cashback this period, this statement period (spent by category, refunds, cashback booked), product name, annual fee waiver, terms still missing.", inputSchema: z.object({ date: z.string().optional(), include_closed: z.boolean().optional() }), annotations: ro }, wrap(async ({ date, include_closed }) => {
    const s = await snap();
    const asOf = date ?? now();
    const per = new Map(cards(s.ledger, asOf).map((x) => [x.account, x]));
    return cardList(s.ledger, asOf, { includeClosed: include_closed }).map((c) => ({
      account: c.account,
      name: c.name,
      owed: c.owed,
      limit: c.limit ?? (c.limitAtLeast ? `at least ${c.limitAtLeast} (most ever owed; limit not set)` : null),
      last_statement: c.last ? { date: c.last.close, amount_due: c.last.amountDue, paid: c.last.paid, to_pay: c.last.toPay, due: c.last.due, status: c.last.status, ...(c.last.bank !== null ? { bank: c.last.bank, diff: c.last.bankDiff } : {}) } : null,
      this_period: c.current ? { from: c.current.from, purchases: c.current.purchases } : null,
      cashback: c.cashback ? { spend: c.cashback.spend, expected: c.cashback.expected, cap_left: c.cashback.capLeft, min_met: c.cashback.minMet, need_for_min: c.cashback.needForMin, ...(c.cashback.incomplete ? { note: "some rates not set" } : {}) } : null,
      ...(c.bank ? { bank: c.bank } : {}),
      ...(per.get(c.account)?.product ? { product: per.get(c.account)!.product } : {}),
      ...(per.get(c.account) ? { period: (({ from, to, spent, refunds, byCategory, cashback }) => ({ from, to, spent, refunds, by_category: byCategory, cashback_booked: cashback }))(per.get(c.account)!.period) } : {}),
      fee_waiver: feeWaiver(s.ledger, c.account, asOf),
      ...(c.missing.length ? { missing: c.missing } : {}),
    }));
  }));

  server.registerTool(
    "card_statement",
    { description: "One card statement in detail (default: the last closed one): opening, purchases, refunds, cashback, fees, payments, closing, due, paid, and its transactions.", inputSchema: z.object({ account: z.string(), statement_date: z.string().optional().describe("yyyy-mm-dd") }), annotations: ro },
    wrap(async ({ account, statement_date }) => {
      const s = await snap();
      const all = statements(s.ledger, account, now());
      const st = statement_date ? all.find((x) => x.close === statement_date) : [...all].reverse().find((x) => !x.open);
      if (!st) throw new A.ActionError(`no statement${statement_date ? ` on ${statement_date}` : ""} for ${account} (statement dates: ${all.slice(-6).map((x) => x.close).join(", ")})`);
      const { map } = flattenCategories(s.ledger.categories);
      const txs = s.ledger.transactions.filter((t) => !t.void && t.date >= st.from && t.date <= st.close && t.lines.some((l) => l.account === account));
      return { statement: st, transactions: txs.map((t) => ({ ...compactTx(t), kind: lineKind(t, account, map)?.kind })), cashback: cashback(s.ledger, account, now()).find((p) => p.close === st.close) ?? null };
    }),
  );

  server.registerTool(
    "best_card",
    {
      description:
        "Which card to use for one purchase: open cards ranked by cashback (cap left, minimum spend), then interest-free days, then limit left, each with its source. Cards with the owner's own cashback terms are ranked here; with OpenWallet on, cards without terms are looked up there (needs amount and merchant or kind; sends those cards' product names and banks, the purchase, and their spend and cashback this period).",
      inputSchema: z.object({
        category: z.string().optional().describe("the owner's category path, e.g. food/groceries: picks the rate from the owner's terms, adds the budget left"),
        amount: z.number().int().positive().optional().describe("the purchase, whole base-currency units"),
        merchant: z.string().optional().describe("OpenWallet: where, e.g. Shopee, Co.opmart, Grab"),
        kind: z.string().optional().describe("OpenWallet: what kind when no merchant, e.g. groceries, dining, fuel, travel"),
        date: z.string().optional().describe("yyyy-mm-dd, default today"),
        accounts: z.array(z.string()).optional().describe("only these card account ids"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: Boolean(ow) },
    },
    wrap(async (a) => {
      const s = await snap();
      return bestCard(s.ledger, now(), ow, a);
    }),
  );

  server.registerTool("plans_due", { description: "Instalments, loan payments and premiums due in the next N days (and overdue), plus what's left per plan.", inputSchema: z.object({ days: z.number().int().max(366).optional() }), annotations: ro }, wrap(async ({ days }) => {
    const s = await snap();
    const asOf = now();
    return { due: plansDue(s.ledger, asOf, days ?? 30), plans: planStatus(s.ledger, asOf).filter((p) => !p.finished) };
  }));

  server.registerTool("deposits", { description: "Open term deposits: maturity, days left, expected interest.", inputSchema: z.object({ date: z.string().optional() }), annotations: ro }, wrap(async ({ date }) => {
    const s = await snap();
    return deposits(s.ledger, date ?? now());
  }));

  server.registerTool("today", { description: "One short block: due soon, cards to pay, deposits maturing, budgets over, anything odd.", annotations: ro }, wrap(async () => {
    const s = await snap();
    const t = today(s.ledger, now());
    const m = report(s.ledger, now().slice(0, 7), { compare: false });
    const needs = attention(s.ledger, now(), { files: s.files, check: { errors: s.errors, warnings: s.warnings } }).map((a) => ({ severity: a.severity, kind: a.kind, title: a.title, ...(a.amount !== undefined ? { amount: a.amount } : {}), date: a.date }));
    return { ...t, needs_you: needs, this_month: { income: m.income, expense: m.expense } };
  }));

  /* ---------------------------------------------------------------- write (preview) */

  const pv = { readOnlyHint: true, openWorldHint: false } as const; // previews change nothing

  server.registerTool(
    "add_transaction",
    {
      description: "PREVIEW a new transaction (writes nothing). Simple form: kind + amount + account (+ category or to_account). Full form: lines.",
      inputSchema: z.object({ ...txFields, reason }),
      annotations: pv,
    },
    wrap(async ({ reason, ...a }) => {
      // with the pool on, an unnamed account is the pool's default account
      if (!a.lines?.length && !a.account) {
        const s = await snap();
        const p = poolOf(s.ledger, dashboardOf(s.files, props.login)?.prefs?.pool, now());
        if (p.on && p.default_account) a = { ...a, account: p.default_account };
      }
      return preview((f) => A.addTransaction(f, a, meta(reason)));
    }),
  );

  server.registerTool(
    "edit_transaction",
    { description: "PREVIEW changes to a transaction by id (only the fields given change).", inputSchema: z.object({ id: z.string(), ...txFields, date: z.string().optional(), reason }), annotations: pv },
    wrap(async ({ id, reason, ...patch }) => preview((f) => A.editTransaction(f, id, patch, meta(reason)))),
  );

  server.registerTool(
    "void_transaction",
    { description: "PREVIEW voiding a transaction (kept in history, excluded everywhere).", inputSchema: z.object({ id: z.string(), reason }), annotations: pv },
    wrap(async ({ id, reason }) => preview((f) => A.voidTransaction(f, id, reason, meta(reason)))),
  );

  const accountFields = {
    name: z.string(),
    type: z.string().describe("cash, bank, ewallet, credit_card, bnpl, deposit, savings_goal, gold, fund, stock, etf, crypto, insurance, loan_given, loan_taken, other (or a new one)"),
    asset: z.string().optional().describe("non-base asset id for holdings (gold, fund...)"),
    opened: z.string().optional(),
    group: z.string().optional(),
    note: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional().describe("credit_card: statement_day, due_day, limit; deposit: principal, rate, term_months, start, maturity"),
  };

  server.registerTool(
    "add_account",
    { description: "PREVIEW a new account.", inputSchema: z.object({ id: z.string().describe("short, kebab-case"), ...accountFields }), annotations: pv },
    wrap(async (a) => preview((f) => A.addAccount(f, a))),
  );

  server.registerTool(
    "edit_account",
    {
      description: "PREVIEW changes to an account (name, type, details, group, note), or close it (closed: yyyy-mm-dd).",
      inputSchema: z.object({ id: z.string(), ...Object.fromEntries(Object.entries(accountFields).map(([k, v]) => [k, (v as z.ZodType).optional()])), closed: z.string().optional() }),
      annotations: pv,
    },
    wrap(async ({ id, ...set }) => preview((f) => A.editAccount(f, id, Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined))))),
  );

  server.registerTool(
    "add_plan",
    {
      description: "PREVIEW a schedule: instalment, bnpl, loan_taken, loan_given, insurance_premium or deposit. Payments name it with plan: <id>.",
      inputSchema: z.object({
        id: z.string(),
        kind: z.string(),
        account: z.string(),
        name: z.string().optional(),
        principal: z.number().int().optional(),
        count: z.number().int().optional(),
        every: z.enum(["month", "quarter", "year"]),
        start: z.string().describe("first due date"),
        amount: z.number().int().optional().describe("per payment; default principal / count"),
        fee: z.number().int().optional(),
        rate: z.number().optional(),
        note: z.string().optional(),
      }),
      annotations: pv,
    },
    wrap(async (p) => preview((f) => A.addPlan(f, p))),
  );

  server.registerTool(
    "add_price",
    { description: "PREVIEW a price for an asset (base currency per unit) on a date.", inputSchema: z.object({ date: z.string(), asset: z.string(), price: z.number() }), annotations: pv },
    wrap(async (p) => preview((f) => A.addPrice(f, p))),
  );

  server.registerTool(
    "add_category",
    { description: "PREVIEW a new category.", inputSchema: z.object({ kind: z.enum(["income", "expense"]), parent: z.string().optional(), id: z.string(), name: z.string() }), annotations: pv },
    wrap(async (c) => preview((f) => A.addCategory(f, c))),
  );

  server.registerTool(
    "edit_category",
    { description: "PREVIEW renaming a category, or moving it to a new path (every line using it is remapped).", inputSchema: z.object({ path: z.string(), name: z.string().optional(), new_path: z.string().optional() }), annotations: pv },
    wrap(async ({ path, ...set }) => preview((f) => A.editCategory(f, path, set))),
  );

  /* ---------------------------------------------------------------- cards (preview) */

  server.registerTool(
    "set_card_details",
    {
      description: "PREVIEW card terms on a credit card account: statement and due days, limit, annual fee and its month, fee waiver target, cashback rules. Only the fields given change; they're kept over codes read from wallet names.",
      inputSchema: z.object({
        account: z.string(),
        statement_day: z.number().int().min(1).max(31).optional(),
        due_day: z.number().int().min(1).max(31).optional(),
        limit: z.number().int().positive().optional(),
        annual_fee: z.number().int().min(0).optional(),
        fee_month: z.number().int().min(1).max(12).optional(),
        fee_waiver_spend: z.number().int().positive().optional().describe("spend per card year that waives the annual fee"),
        free_days_max: z.number().int().optional(),
        cashback: z.object({
          base: z.number().min(0).max(100).optional(),
          rules: z.array(z.object({ categories: z.array(z.string()), rate: z.number().min(0).max(100) })).optional(),
          cap: z.object({ amount: z.number().int().positive(), per: z.enum(["statement", "month"]) }).optional(),
          min_spend: z.object({ amount: z.number().int().positive(), per: z.enum(["statement", "month"]) }).optional(),
          spend_max: z.object({ amount: z.number().int().positive(), per: z.enum(["statement", "month"]) }).optional(),
          paid_on: z.string().optional().describe("next_statement or days_after:<n>"),
        }).optional().describe("merged into the card's cashback terms"),
      }),
      annotations: pv,
    },
    wrap(async ({ account, fee_waiver_spend, cashback: cb, ...rest }) =>
      preview((f) => {
        const { ledger } = A.loadForAction(f);
        const a = ledger.accounts.find((x) => x.id === account);
        if (!a) throw new A.ActionError(`no account ${account}`);
        const details: Record<string, unknown> = { ...(a.details ?? {}) };
        const set: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        if (fee_waiver_spend !== undefined) set.fee_waiver = { spend: fee_waiver_spend, within: "year" };
        if (cb) set.cashback = { ...((details.cashback as object) ?? {}), ...Object.fromEntries(Object.entries(cb).filter(([, v]) => v !== undefined)) };
        if (!Object.keys(set).length) throw new A.ActionError("nothing to change");
        Object.assign(details, set);
        const fromName = Array.isArray(details.from_name) ? (details.from_name as string[]).filter((k) => !(k in set)) : undefined;
        if (fromName) details.from_name = fromName.length ? fromName : undefined;
        if (details.from_name === undefined) delete details.from_name;
        return A.editAccount(f, account, { details });
      }),
    ),
  );

  server.registerTool(
    "add_statement_amount",
    { description: "PREVIEW the bank's amount for a card statement (from the bank's statement), to compare with the computed one.", inputSchema: z.object({ account: z.string(), statement_date: z.string().describe("yyyy-mm-dd, the statement's closing date"), amount: z.number().int() }), annotations: pv },
    wrap(async ({ account, statement_date, amount }) =>
      preview((f) => {
        const { ledger } = A.loadForAction(f);
        if (!ledger.accounts.some((a) => a.id === account)) throw new A.ActionError(`no account ${account}`);
        const list = cardsData(ledger).statements.filter((x) => !(x.account === account && x.statement_date === statement_date));
        list.push({ account, statement_date, amount });
        list.sort((x, y) => (x.statement_date < y.statement_date ? -1 : x.statement_date > y.statement_date ? 1 : x.account < y.account ? -1 : 1));
        return A.plan(f, { putFiles: { [STATEMENTS_FILE]: yamlText(list) } }, `Card statement: ${account} ${statement_date}`);
      }),
    ),
  );

  server.registerTool(
    "add_instalment",
    { description: "PREVIEW turning a card purchase into a 0% instalment plan (trả góp 0%): each statement then counts only the monthly amount.", inputSchema: z.object({ transaction: z.string().describe("id of the purchase on the card"), count: z.number().int().min(2).max(60), fee: z.number().int().min(0).optional().describe("conversion fee per month, if any"), id: z.string().optional(), name: z.string().optional(), first_statement: z.string().optional().describe("yyyy-mm-dd; default the first statement after the purchase") }), annotations: pv },
    wrap(async ({ transaction, count, fee, id, name, first_statement }) =>
      preview((f) => {
        const { ledger } = A.loadForAction(f);
        const t = ledger.transactions.find((x) => x.id === transaction);
        if (!t) throw new A.ActionError(`no transaction ${transaction}`);
        const line = t.lines.find((l) => l.account && ledger.accounts.find((a) => a.id === l.account)?.type === "credit_card" && l.amount < 0);
        if (!line) throw new A.ActionError("that transaction isn't a purchase on a credit card");
        const acc = ledger.accounts.find((a) => a.id === line.account)!;
        const sd = termsOf(acc, recordFor(ledger, acc.id)).statementDay;
        if (!sd && !first_statement) throw new A.ActionError(`${acc.id} has no statement_day: give first_statement`);
        const start = first_statement ?? closeOnOrAfter(t.date, sd!);
        const principal = -line.amount;
        return A.addPlan(f, { id: id ?? `${acc.id}-${t.date.replace(/-/g, "")}-0pct`, kind: "instalment", account: acc.id, name: name ?? (t.note || `Trả góp ${acc.name}`), principal, count, every: "month", start, ...(fee ? { fee } : {}), rate: 0, source: t.id });
      }),
    ),
  );

  /* ---------------------------------------------------------------- dashboard (preview) */

  const queryShape = z.object({
    metric: z.enum(["spending", "income", "net", "balance", "count"]),
    category: z.string().optional(),
    account: z.string().optional(),
    who: z.string().optional(),
    event: z.string().optional(),
    tag: z.string().optional(),
    text: z.string().optional(),
    period: z.string().optional().describe("this-month, last-month, last-3-months, last-6-months, this-year, last-year, last-12-months, all, yyyy-mm or yyyy"),
    by: z.enum(["day", "week", "month", "category", "top", "account", "who", "event", "tag"]).optional(),
    compare: z.enum(["previous", "usual"]).optional(),
  });

  const myDashboard = async () => {
    const s = await snap();
    const d = dashboardOf(s.files, props.login);
    const widgets: Widget[] = d?.widgets ?? defaultWidgets(features(s.ledger, now(), s.files));
    return { s, d: { version: 1, ...(d ?? {}), widgets } as Dashboard & { widgets: Widget[] } };
  };
  const saveLayout = (d: Dashboard, message: string) => (f: Record<string, string>) => A.plan(f, { putFiles: { [dashboardPath(props.login)]: writeDashboard(d) } }, message);
  const firstNumbers = async (q: SeriesQuery) => {
    const s = await snap();
    const pool = poolOf(s.ledger, dashboardOf(s.files, props.login)?.prefs?.pool, now());
    const r = series(s.ledger, q.account === "pool" ? { ...q, account: pool.accounts } : q, now());
    return { period: r.period, total: r.total, ...(r.compareTotal !== undefined ? { compare: r.compareTotal } : {}), first: r.points.slice(0, 8).map((p) => [p.name, p.value]) };
  };

  server.registerTool("dashboard", { description: "The signed-in owner's dashboard layout: widgets with ids, types, titles, queries and positions (12-column grid), from data/dashboards/<login>.yaml (defaults when there is no file yet).", annotations: ro }, wrap(async () => {
    const { s, d } = await myDashboard();
    return { file: dashboardPath(props.login), saved: Boolean(dashboardOf(s.files, props.login)), grid_columns: GRID_COLS, widgets: d.widgets };
  }));

  server.registerTool(
    "add_widget",
    {
      description: "PREVIEW adding a widget to the owner's dashboard: a chart from a query (type chart), or a built-in widget by type (pace, left, attention, unusual, net_worth, by_category, income_spending, recent, account, upcoming, cards, cashback, which_card, cards_value, deposits). Shows the first numbers so the owner can see it's right.",
      inputSchema: z.object({ type: z.string().default("chart"), title: z.string().max(80).optional(), query: queryShape.optional(), chart: z.enum(["stat", "line", "bar", "hbar", "table"]).optional(), account: z.string().optional(), period: z.string().optional(), w: z.number().int().min(1).max(12).optional(), h: z.number().int().min(1).max(24).optional(), id: z.string().optional() }),
      annotations: pv,
    },
    wrap(async ({ type, title, query, chart, account, period, w, h, id }) => {
      const { d } = await myDashboard();
      if (type === "chart" && !query) throw new A.ActionError("a chart widget needs a query");
      const y = d.widgets.reduce((m, x) => Math.max(m, x.y + x.h), 0);
      const base = (id ?? title ?? type).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "widget";
      let wid = base;
      for (let i = 2; d.widgets.some((x) => x.id === wid); i++) wid = `${base}-${i}`;
      const widget: Widget = { id: wid, type, x: 0, y, w: w ?? 6, h: h ?? 3, ...(title ? { title } : {}), ...(query ? { query: query as SeriesQuery, chart: chart ?? "bar" } : {}), ...(account ? { account } : {}), ...(period ? { period } : {}), by_ai: true };
      const next: Dashboard = { ...d, widgets: [...d.widgets, widget] };
      const shows = query ? await firstNumbers(query as SeriesQuery) : undefined;
      return { ...(await preview(saveLayout(next, `Dashboard: add widget ${title ?? type} (${props.login})`))), widget, ...(shows ? { shows } : {}) };
    }),
  );

  server.registerTool(
    "edit_widget",
    { description: "PREVIEW changing a dashboard widget by id (title, query, chart kind, size, options).", inputSchema: z.object({ id: z.string(), title: z.string().max(80).optional(), query: queryShape.optional(), chart: z.enum(["stat", "line", "bar", "hbar", "table"]).optional(), account: z.string().optional(), period: z.string().optional(), w: z.number().int().min(1).max(12).optional(), h: z.number().int().min(1).max(24).optional() }), annotations: pv },
    wrap(async ({ id, ...set }) => {
      const { d } = await myDashboard();
      const w = d.widgets.find((x) => x.id === id);
      if (!w) throw new A.ActionError(`no widget ${id} (ids: ${d.widgets.map((x) => x.id).join(", ")})`);
      const changed = { ...w, ...Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined)) } as Widget;
      if (changed.x + changed.w > GRID_COLS) changed.x = GRID_COLS - changed.w;
      const next: Dashboard = { ...d, widgets: d.widgets.map((x) => (x.id === id ? changed : x)) };
      const shows = changed.query ? await firstNumbers(changed.query) : undefined;
      return { ...(await preview(saveLayout(next, `Dashboard: edit widget ${id} (${props.login})`))), widget: changed, ...(shows ? { shows } : {}) };
    }),
  );

  server.registerTool(
    "remove_widget",
    { description: "PREVIEW removing a dashboard widget by id.", inputSchema: z.object({ id: z.string() }), annotations: pv },
    wrap(async ({ id }) => {
      const { d } = await myDashboard();
      if (!d.widgets.some((x) => x.id === id)) throw new A.ActionError(`no widget ${id} (ids: ${d.widgets.map((x) => x.id).join(", ")})`);
      return preview(saveLayout({ ...d, widgets: d.widgets.filter((x) => x.id !== id) }, `Dashboard: remove widget ${id} (${props.login})`));
    }),
  );

  /* ---------------------------------------------------------------- apply */

  server.registerTool(
    "apply",
    {
      description: "Commit a preview, ONLY after the owner explicitly said go. Refused if the data changed since the preview.",
      inputSchema: z.object({ preview_id: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    wrap(async ({ preview_id }) => {
      const r = await applyPending(env, src, preview_id);
      return { done: true, commit: r.sha.slice(0, 12), message: r.message, changed: r.summary };
    }),
  );

  return server;
}
