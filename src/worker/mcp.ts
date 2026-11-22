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

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const out = (v: unknown): Result => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v) }] });
const fail = (msg: string): Result => ({ content: [{ type: "text", text: msg }], isError: true });

const INSTRUCTIONS = `ownledger: the owner's personal finance ledger, kept in their private GitHub repo.
Amounts are whole numbers in the base currency (see about). Answers are computed here; never add up raw rows yourself when a tool computes it.
Writes: the add_/edit_/void_ tools only PREVIEW. Show the owner the preview (what, amounts, accounts), wait for their explicit go, then call apply with the preview_id. Never invent an amount, date, account or category: ask. Call rules once before the first write.`;

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
  account: z.string().optional().describe("expense: paid from; income: received into; transfer: from"),
  to_account: z.string().optional().describe("transfer: to"),
  category: z.string().optional().describe("category path, e.g. food/eating-out"),
  lines: z.array(lineSchema).optional().describe("full form: balanced lines (sum 0); for splits, assets with qty, etc."),
  who: z.string().optional(),
  event: z.string().optional(),
  tags: z.array(z.string()).optional(),
  plan: z.string().optional().describe("plan id this pays (instalment, loan, premium)"),
};

export function buildServer(env: Env, props: Props, src: DataSource = sourceFor(env)): McpServer {
  const server = new McpServer({ name: "ownledger", version: VERSION }, { instructions: INSTRUCTIONS });
  const tz = env.TIMEZONE || "Asia/Ho_Chi_Minh";
  const now = () => todayIn(tz);
  const snap = () => snapshot(env, src);
  const ro = { readOnlyHint: true, openWorldHint: false } as const;

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
      ],
      base: s.ledger.meta.base,
      categories: {
        income: [...map.values()].filter((c) => c.kind === "income").map((c) => `${c.path}: ${c.name}`),
        expense: [...map.values()].filter((c) => c.kind === "expense").map((c) => `${c.path}: ${c.name}`),
        system: Object.entries(SYSTEM_CATEGORIES).map(([k, v]) => `${k}: ${v.en}`),
      },
      accounts: s.ledger.accounts.filter((a) => !a.closed).map((a) => `${a.id}: ${a.name} (${a.type})`),
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

  server.registerTool("cards", { description: "Credit cards: owed, last statement, what to pay, due date, available credit.", inputSchema: z.object({ date: z.string().optional() }), annotations: ro }, wrap(async ({ date }) => {
    const s = await snap();
    return cards(s.ledger, date ?? now()).filter((c) => c.owed !== 0 || (c.toPay ?? 0) > 0);
  }));

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
    return { ...t, this_month: { income: m.income, expense: m.expense } };
  }));

  /* ---------------------------------------------------------------- write (preview) */

  const pv = { readOnlyHint: true, openWorldHint: false } as const; // previews change nothing

  server.registerTool(
    "add_transaction",
    {
      description: "PREVIEW a new transaction (writes nothing). Simple form: kind + amount + account (+ category or to_account). Full form: lines.",
      inputSchema: z.object(txFields),
      annotations: pv,
    },
    wrap(async (a) => preview((f) => A.addTransaction(f, a))),
  );

  server.registerTool(
    "edit_transaction",
    { description: "PREVIEW changes to a transaction by id (only the fields given change).", inputSchema: z.object({ id: z.string(), ...txFields, date: z.string().optional() }), annotations: pv },
    wrap(async ({ id, ...patch }) => preview((f) => A.editTransaction(f, id, patch))),
  );

  server.registerTool(
    "void_transaction",
    { description: "PREVIEW voiding a transaction (kept in history, excluded everywhere).", inputSchema: z.object({ id: z.string(), reason: z.string().optional() }), annotations: pv },
    wrap(async ({ id, reason }) => preview((f) => A.voidTransaction(f, id, reason))),
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
