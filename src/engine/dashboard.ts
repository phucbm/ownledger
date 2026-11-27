import { parse as parseYaml } from "yaml";
import { yamlText } from "./write.js";
import { flattenCategories } from "./categories.js";
import { typeDef } from "./registry.js";
import { PERIOD_PRESETS, type SeriesQuery } from "./insights.js";
import type { Account, Issue, Ledger } from "./types.js";

/**
 * A person's dashboard: data/dashboards/<login>.yaml in the data repo. Widgets on a 12-column grid,
 * and personal preferences (the "My money" pool). One file per GitHub login; no file = the defaults.
 */
export const GRID_COLS = 12;
export const DASHBOARD_DIR = "data/dashboards/";
export const dashboardPath = (login: string) => `${DASHBOARD_DIR}${login.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.yaml`;

/** Built-in widget types and the module they need (none = core). */
export const WIDGET_TYPES: Record<string, { module?: string; options?: string[] }> = {
  pace: {},
  left: {},
  attention: {},
  unusual: {},
  net_worth: {},
  by_category: { options: ["period"] },
  income_spending: { options: ["months"] },
  recent: { options: ["count"] },
  account: { options: ["account"] },
  upcoming: {},
  chart: { options: ["query", "chart", "title"] },
  cards: { module: "cards" },
  cashback: { module: "cards" },
  card_budgets: { module: "cards" },
  which_card: { module: "cards" },
  cards_value: { module: "cards" },
  deposits: { module: "deposits" },
};

export const CHART_KINDS = ["stat", "line", "bar", "hbar", "table"] as const;
const METRICS = ["spending", "income", "net", "balance", "count"];
const BYS = ["day", "week", "month", "category", "top", "account", "who", "event", "tag"];

export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  query?: SeriesQuery;
  chart?: (typeof CHART_KINDS)[number];
  /** Options of built-in widgets (period, account, count, months). */
  period?: string;
  account?: string;
  count?: number;
  months?: number;
  /** Added by the AI through the connector (the dashboard marks it). */
  by_ai?: boolean;
  [k: string]: unknown;
}

export interface PoolPrefs {
  /** Group everyday accounts (cash, bank, e-wallet) into one balance. Default on. */
  on?: boolean;
  /** Its name (default "Tiền của tôi" / "My money", translated by the dashboard). */
  name?: string;
  /** Liquid accounts kept out of the pool (all liquid accounts are in it by default, new ones too). */
  exclude?: string[];
  /** Where everyday spending goes when no account is named. */
  default_account?: string;
}

export interface Dashboard {
  version: 1;
  widgets?: Widget[];
  prefs?: { pool?: PoolPrefs; [k: string]: unknown };
  [k: string]: unknown;
}

/** The default Home: what fits the ledger (features), four widgets. */
export function defaultWidgets(f: { historyMonths: number; empty: boolean }): Widget[] {
  if (f.empty) return [];
  const w: Widget[] = [
    { id: "month", type: "pace", x: 0, y: 0, w: 6, h: 4 },
    { id: "needs", type: "attention", x: 6, y: 0, w: 6, h: 4 },
  ];
  if (f.historyMonths >= 2) w.push({ id: "different", type: "unusual", x: 0, y: 4, w: 6, h: 4 });
  else w.push({ id: "left", type: "left", x: 0, y: 4, w: 6, h: 4 });
  w.push({ id: "worth", type: "net_worth", x: 6, y: 4, w: 6, h: 4 });
  return w;
}

export function parseDashboard(text: string | undefined): Dashboard | null {
  if (text === undefined) return null;
  const v = parseYaml(text) as Dashboard | null;
  return v && typeof v === "object" ? v : null;
}

export function writeDashboard(d: Dashboard): string {
  return yamlText(d);
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Issues in one dashboard file. Errors make PUT /api/dashboard refuse it; unknown categories/accounts are warnings. */
export function checkDashboard(file: string, d: unknown, l: Ledger): Issue[] {
  const out: Issue[] = [];
  const err = (where: string | undefined, message: string) => out.push({ level: "error", file, where, message });
  const warn = (where: string | undefined, message: string) => out.push({ level: "warning", file, where, message });
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    err(undefined, "must be a YAML map with version and widgets");
    return out;
  }
  const dash = d as Dashboard;
  if (dash.version !== 1) err("version", "version must be 1");
  const { map: cats } = flattenCategories(l.categories);
  const accounts = new Map<string, Account>(l.accounts.map((a) => [a.id, a]));
  if (dash.widgets !== undefined && !Array.isArray(dash.widgets)) err("widgets", "widgets must be a list");
  const ids = new Set<string>();
  for (const [i, w] of (Array.isArray(dash.widgets) ? dash.widgets : []).entries()) {
    const where = w && typeof w.id === "string" ? w.id : `#${i + 1}`;
    if (!w || typeof w !== "object") {
      err(where, "not a map");
      continue;
    }
    if (typeof w.id !== "string" || !ID_RE.test(w.id)) err(where, "id must be letters, digits, . _ - (no spaces)");
    else if (ids.has(w.id)) err(where, "duplicate widget id");
    ids.add(w.id);
    if (!Object.prototype.hasOwnProperty.call(WIDGET_TYPES, w.type)) err(where, `unknown widget type "${w.type}"`);
    for (const k of ["x", "y", "w", "h"] as const) if (!Number.isInteger(w[k]) || w[k] < 0) err(where, `${k} must be a whole number ≥ 0`);
    if (Number.isInteger(w.w) && (w.w < 1 || w.w > GRID_COLS)) err(where, `w must be 1 to ${GRID_COLS}`);
    if (Number.isInteger(w.h) && (w.h < 1 || w.h > 24)) err(where, "h must be 1 to 24");
    if (Number.isInteger(w.x) && Number.isInteger(w.w) && w.x + w.w > GRID_COLS) err(where, `x + w must be at most ${GRID_COLS}`);
    if (w.title !== undefined && (typeof w.title !== "string" || w.title.length > 80)) err(where, "title: text up to 80 characters");
    if (w.account !== undefined && w.account !== "pool" && !accounts.has(String(w.account))) warn(where, `account "${w.account}" not found`);
    if (w.type === "chart") {
      const q = w.query;
      if (!q || typeof q !== "object") {
        err(where, "a chart widget needs a query");
        continue;
      }
      if (!METRICS.includes(q.metric)) err(where, `query.metric: one of ${METRICS.join(", ")}`);
      if (q.by !== undefined && !BYS.includes(q.by)) err(where, `query.by: one of ${BYS.join(", ")}`);
      if (q.metric === "balance" && q.by && !["day", "week", "month"].includes(q.by)) err(where, "query: balance goes by day, week or month");
      if (q.period !== undefined && !(PERIOD_PRESETS as readonly string[]).includes(q.period) && !/^\d{4}(-\d{2})?$/.test(q.period)) err(where, `query.period: ${PERIOD_PRESETS.join(", ")}, yyyy-mm or yyyy`);
      if (q.compare !== undefined && !["previous", "usual"].includes(q.compare)) err(where, "query.compare: previous or usual");
      if (w.chart !== undefined && !(CHART_KINDS as readonly string[]).includes(w.chart)) err(where, `chart: one of ${CHART_KINDS.join(", ")}`);
      if (q.category && !cats.has(q.category)) warn(where, `category "${q.category}" not found (the widget shows "category not found")`);
      for (const a of q.account === undefined ? [] : Array.isArray(q.account) ? q.account : [q.account]) if (a !== "pool" && !accounts.has(a)) warn(where, `account "${a}" not found`);
    }
  }
  const pool = dash.prefs?.pool;
  if (pool !== undefined) {
    if (typeof pool !== "object" || pool === null) err("prefs.pool", "must be a map");
    else {
      if (pool.on !== undefined && typeof pool.on !== "boolean") err("prefs.pool.on", "true or false");
      if (pool.name !== undefined && typeof pool.name !== "string") err("prefs.pool.name", "text");
      for (const a of pool.exclude ?? []) if (!accounts.has(a)) warn("prefs.pool.exclude", `account "${a}" not found`);
      if (pool.default_account !== undefined) {
        const a = accounts.get(pool.default_account);
        if (!a) warn("prefs.pool.default_account", `account "${pool.default_account}" not found`);
        else if (!typeDef(a.type)?.liquid) warn("prefs.pool.default_account", `${a.id} is not an everyday account (cash, bank, e-wallet)`);
      }
    }
  }
  return out;
}

/** Every dashboard file in the repo, checked. */
export function checkDashboards(files: Record<string, string>, l: Ledger): Issue[] {
  const out: Issue[] = [];
  for (const [p, text] of Object.entries(files)) {
    if (!p.startsWith(DASHBOARD_DIR)) continue;
    if (!/^data\/dashboards\/[a-z0-9-]+\.yaml$/.test(p)) {
      out.push({ level: "warning", file: p, message: "not a dashboard file name (data/dashboards/<login>.yaml); ignored" });
      continue;
    }
    let d: unknown;
    try {
      d = parseYaml(text);
    } catch (e) {
      out.push({ level: "error", file: p, message: `YAML parse error: ${(e as Error).message.split("\n")[0]}` });
      continue;
    }
    out.push(...checkDashboard(p, d, l));
  }
  return out;
}

/* ------------------------------------------------------------------ the pool ("Tiền của tôi") */

export interface Pool {
  on: boolean;
  name: string | null; // null = the translated default
  accounts: string[]; // ids in the pool (open, liquid, not excluded)
  default_account: string | null;
}

/** The pool for a person's prefs: a view over the accounts, never a change to them. */
export function poolOf(l: Ledger, prefs: PoolPrefs | undefined, asOf: string): Pool {
  const on = prefs?.on ?? true;
  const exclude = new Set(prefs?.exclude ?? []);
  const accounts = l.accounts.filter((a) => typeDef(a.type)?.liquid && !exclude.has(a.id) && !(a.closed && a.closed <= asOf)).map((a) => a.id);
  const def = prefs?.default_account && accounts.includes(prefs.default_account) ? prefs.default_account : (accounts.find((id) => l.accounts.find((a) => a.id === id)?.type === "cash") ?? accounts[0] ?? null);
  return { on, name: prefs?.name ?? null, accounts: on ? accounts : [], default_account: on ? def : null };
}
