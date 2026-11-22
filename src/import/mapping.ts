import { parse as parseYaml } from "yaml";

/**
 * A mapping file (imports/<source>.mapping.yaml) tells the generic table importer how to read one
 * app's export. The AI writes it once (on the first import); later imports run it as plain code.
 */
export interface AccountMap {
  id: string;
  name?: string;
  type?: string;
  asset?: string;
  opened?: string;
  closed?: string | null;
  group?: string;
  details?: Record<string, unknown>;
  /** Full names the source uses for this account in notes (sheet names may be truncated). */
  names?: string[];
  [k: string]: unknown;
}

export interface Mapping {
  source: string; // short id stored on each transaction: src.import
  reader?: "table";
  /** Sheets to read: "all" (default) or a list of sheet names. */
  sheets?: "all" | string[];
  skip_sheets?: string[];
  /** 1-based row of the column headers. Default: the first row containing columns.date. */
  header_row?: number;
  /** Where the source account comes from: one account per sheet (default), a column, or one fixed account. */
  account_from?: "sheet" | "column" | "fixed";
  account_column?: string;
  account?: string; // for account_from: fixed, the source account name
  columns: {
    date: string;
    time?: string;
    in?: string; // money in (positive)
    out?: string; // money out (positive)
    amount?: string; // signed amount (instead of in/out)
    balance?: string;
    category?: string;
    subcategory?: string;
    who?: string;
    event?: string;
    note?: string;
    tags?: string;
  };
  date_format?: "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";
  /** Decimal separator in amounts written as text. Default ".". */
  decimal?: "." | ",";
  /** Newest rows first (default: detected from dates). */
  newest_first?: boolean;
  /** Labels of the source's own figures, found above the header row; the value is the next number to the right. */
  totals?: { opening?: string; closing?: string; in?: string; out?: string };
  transfers?: {
    /** Only rows without a category can be transfers (default true). */
    only_without_category?: boolean;
    /** Regex on the note for money leaving to another account; named group "wallet" = the other account's name. */
    out: string;
    in: string;
  };
  /** Source account name (sheet name, column value) → ownledger account. */
  accounts: Record<string, AccountMap>;
  /** Source category "Parent/Child" or "Parent" → ownledger category path. */
  categories: Record<string, string>;
  /** Rows with no category that are not transfers: first matching rule wins (regex on the note). */
  uncategorized?: { match: string; category: string; sign?: "in" | "out" }[];
  uncategorized_in?: string; // fallback category for money in
  uncategorized_out?: string; // fallback category for money out
  /** Account that receives transfers whose other side can't be found. Default "import-unmatched". */
  unmatched_account?: string;
  /** Opening balances (from totals.opening) are booked on this date, or on the account's first row date. */
  opening_date?: string;
  [k: string]: unknown;
}

export function parseMapping(text: string): Mapping {
  const m = parseYaml(text) as Mapping;
  const errs = validateMapping(m);
  if (errs.length) throw new Error(`mapping is not valid:\n- ${errs.join("\n- ")}`);
  return m;
}

export function validateMapping(m: Mapping): string[] {
  const e: string[] = [];
  if (!m || typeof m !== "object") return ["not a YAML map"];
  if (typeof m.source !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(m.source)) e.push("source: short lowercase id (e.g. misa)");
  if (m.reader && m.reader !== "table") e.push(`reader: only "table" is supported`);
  if (!m.columns || typeof m.columns.date !== "string") e.push("columns.date is required");
  if (m.columns && !m.columns.amount && !(m.columns.in || m.columns.out)) e.push("columns: give amount, or in and/or out");
  if (m.account_from === "column" && !m.account_column) e.push("account_column is required when account_from is column");
  if (m.account_from === "fixed" && !m.account) e.push("account is required when account_from is fixed");
  if (!m.accounts || typeof m.accounts !== "object") e.push("accounts: map of source account → {id, name, type}");
  else
    for (const [k, a] of Object.entries(m.accounts)) {
      if (!a || typeof a.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(a.id)) e.push(`accounts["${k}"].id: letters, digits, . _ - only`);
    }
  if (!m.categories || typeof m.categories !== "object") e.push("categories: map of source category → ownledger category");
  for (const key of ["out", "in"] as const) {
    const r = m.transfers?.[key];
    if (r !== undefined) {
      try {
        new RegExp(r, "u");
      } catch (x) {
        e.push(`transfers.${key}: bad regex (${(x as Error).message})`);
      }
    }
  }
  for (const u of m.uncategorized ?? []) {
    try {
      new RegExp(u.match, "iu");
    } catch (x) {
      e.push(`uncategorized "${u.match}": bad regex`);
    }
  }
  return e;
}
