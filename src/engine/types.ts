/** Data format version this package reads and writes. Bump only in a major release, with a migration. */
export const FORMAT = 1;

export type ISODate = string; // yyyy-mm-dd

export interface Meta {
  format: number;
  base: string; // asset id of the base currency, e.g. VND
  locale?: string; // vi | en
  owner?: string; // GitHub login
  name?: string;
  [k: string]: unknown;
}

export interface Asset {
  id: string;
  name?: string;
  kind?: string; // currency | gold | fund | stock | etf | crypto | other (free text, unknown kinds are fine)
  unit?: string; // e.g. "chỉ", "ccq", "share"
  decimals?: number; // base currency minor-unit decimals (VND 0, USD 2). Amounts are integers in base minor units.
  [k: string]: unknown;
}

export interface Account {
  id: string;
  name: string;
  type: string; // see registry; unknown types load as plain accounts
  asset?: string; // defaults to meta.base
  opened?: ISODate;
  closed?: ISODate | null;
  group?: string;
  note?: string;
  details?: Record<string, unknown>;
  [k: string]: unknown;
}

export type CategoryKind = "income" | "expense";

export interface CategoryNode {
  id: string;
  name: string;
  children?: CategoryNode[];
  [k: string]: unknown;
}

export interface CategoriesFile {
  income: CategoryNode[];
  expense: CategoryNode[];
}

export interface Category {
  path: string; // "food/eating-out"
  name: string;
  kind: CategoryKind;
  parent: string | null;
}

export interface Line {
  account?: string;
  category?: string;
  amount: number; // signed integer, base currency minor units
  asset?: string;
  qty?: number;
  note?: string;
  [k: string]: unknown;
}

export interface Transaction {
  id: string;
  date: ISODate;
  time?: string | null;
  note?: string;
  tags?: string[];
  who?: string | null;
  event?: string | null;
  plan?: string | null;
  void?: boolean;
  lines: Line[];
  src?: { import: string; key: string; [k: string]: unknown };
  [k: string]: unknown;
}

export type PlanKind = "instalment" | "bnpl" | "loan_taken" | "loan_given" | "insurance_premium" | "deposit" | string;

export interface Plan {
  id: string;
  kind: PlanKind;
  account: string;
  name?: string;
  principal?: number;
  count?: number; // number of payments; omit for open-ended (e.g. premiums)
  every: "month" | "quarter" | "year";
  start: ISODate; // first due date
  amount?: number; // per payment; default principal / count (+ fee)
  fee?: number; // per payment
  rate?: number; // annual %, informational
  end?: ISODate | null;
  note?: string;
  [k: string]: unknown;
}

export interface Budget {
  category: string;
  amount: number;
  every?: "month" | "year";
  [k: string]: unknown;
}

export interface Price {
  date: ISODate;
  asset: string;
  price: number; // in base minor units per 1 unit of asset
}

export interface Ledger {
  meta: Meta;
  assets: Asset[];
  accounts: Account[];
  categories: CategoriesFile;
  plans: Plan[];
  budgets: Budget[];
  prices: Price[];
  /** All transactions, sorted by date, time, then file order. Includes void ones. */
  transactions: Transaction[];
  /** Which file each transaction came from (for check messages). */
  txFile: Map<string, string>;
  /** Modules' own files, keyed by module name (e.g. cards: data/cards.yaml). */
  ext?: Record<string, unknown>;
}

export interface Issue {
  level: "error" | "warning";
  file?: string;
  where?: string;
  message: string;
}
