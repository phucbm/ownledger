// Shapes of the server's JSON that the dashboard reads (mirrors src/engine and src/modules; keep in step).

export interface Features {
  empty: boolean;
  historyMonths: number;
  accounts: number;
  modules: string[];
  cards: boolean;
  deposits: boolean;
  holdings: boolean;
  liabilities: boolean;
  plans: boolean;
  imports: boolean;
  who: boolean;
  event: boolean;
  tags: boolean;
  budgets: boolean;
}

export interface Pool {
  on: boolean;
  name: string | null;
  accounts: string[];
  default_account: string | null;
}

export interface SeriesQuery {
  metric: "spending" | "income" | "net" | "balance" | "count";
  category?: string;
  account?: string | string[];
  who?: string;
  event?: string;
  tag?: string;
  text?: string;
  period?: string;
  from?: string;
  to?: string;
  by?: "day" | "week" | "month" | "category" | "top" | "account" | "who" | "event" | "tag";
  compare?: "previous" | "usual";
  limit?: number;
}

export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  query?: SeriesQuery;
  chart?: "stat" | "line" | "bar" | "hbar" | "table";
  period?: string;
  account?: string;
  count?: number;
  months?: number;
  by_ai?: boolean;
}

export interface Pace {
  asOf: string;
  month: string;
  day: number;
  daysInMonth: number;
  spent: number;
  income: number;
  daily: (number | null)[];
  lastMonth: { month: string; toDate: number; total: number; daily: number[] } | null;
  usual: { months: number; toDate: number; total: number; incomeTotal: number; daily: number[]; low: number[]; high: number[] } | null;
  estimate: number;
  incomeEstimate: number;
  estimateFrom: "usual" | "run-rate";
}

export interface AttentionItem {
  kind: string;
  module?: string;
  severity: "red" | "amber" | "info";
  date: string;
  title: string;
  amount?: number;
  account?: string;
  name?: string;
  days?: number;
  count?: number;
  params?: Record<string, string | number | null>;
  link?: string;
  ask?: boolean;
}

export type UnusualCard =
  | { kind: "category_up" | "category_down"; category: string; name: string; current: number; usual: number; changePct: number; link: string }
  | { kind: "new_category"; category: string; name: string; amount: number; link: string }
  | { kind: "new_who"; who: string; amount: number; count: number; link: string }
  | { kind: "large"; tx: string; date: string; note: string; category: string; name: string; amount: number; typical: number; link: string };

export interface HomeData {
  asOf: string;
  pace: Pace;
  left: { income: number; spent: number; now: number; monthEnd: number };
  attention: AttentionItem[];
  unusual: UnusualCard[];
  netWorth: {
    net: number;
    assets: number;
    liabilities: number;
    unpriced: number;
    changeMonth: number | null;
    change12: number | null;
    series: { date: string; net: number }[];
  };
  pool: Pool & { balance: number };
}

export interface SeriesPoint {
  key: string;
  name: string;
  value: number;
  compare?: number;
}

export interface Series {
  query: SeriesQuery;
  period: { from: string; to: string };
  by: string;
  total: number;
  compareTotal?: number;
  points: SeriesPoint[];
}

export interface UsualRow {
  key: string;
  name: string;
  current: number;
  usual: number;
  change: number;
  changePct: number | null;
}

export interface Usual {
  period: { from: string; to: string };
  kind: "income" | "expense";
  months: number;
  current: number;
  usual: number;
  rows: UsualRow[];
}

export interface MonthReport {
  rows: { key: string; name: string; income: number; expense: number; count: number }[];
  income: number;
  expense: number;
}

export interface PlanDue {
  plan: string;
  name: string;
  account: string;
  date: string;
  amount: number;
  overdue: boolean;
}

export interface CardStatus {
  account: string;
  name: string;
  owed: number;
  limit: number | null;
  available: number | null;
  statementDate: string | null;
  statementBalance: number | null;
  paidSinceStatement: number;
  toPay: number | null;
  dueDate: string | null;
  daysToDue: number | null;
}

export interface DepositStatus {
  account: string;
  name: string;
  balance: number;
  principal: number;
  rate: number | null;
  start: string | null;
  maturity: string | null;
  daysToMaturity: number | null;
  interestAtMaturity: number | null;
  rollover: string | null;
}

export interface TxLine {
  account?: string;
  category?: string;
  amount: number;
  asset?: string;
  qty?: number;
  note?: string;
}

export interface Tx {
  id: string;
  date: string;
  time?: string | null;
  note?: string;
  tags?: string[];
  who?: string | null;
  event?: string | null;
  plan?: string | null;
  void?: boolean;
  lines: TxLine[];
  balance?: number | null;
}

export interface TxResult {
  total: number;
  items: Tx[];
  totals: { income: number; expense: number; net: number; count: number };
}

// ---- Accounts, plans, import, settings

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  closed?: string | null;
  group?: string | null;
  note?: string;
  asset?: string;
  value: number;
  cost: number;
  qty: number | null;
  priced: boolean;
  price: { date: string; asset: string; price: number } | null;
  lastActivity: string | null;
  pool: boolean;
}

export interface PlanStatus {
  plan: string;
  name: string;
  kind: string;
  account: string;
  perPayment: number;
  count: number | null;
  paidCount: number;
  paidAmount: number;
  left: number | null;
  leftAmount: number | null;
  next: string | null;
  overdue: string[];
  finished: boolean;
}

export interface PlansResponse {
  status: PlanStatus[];
  due: PlanDue[];
}

export interface ReconcileRow {
  sheet: string;
  ok: boolean;
  problems: string[];
}

export interface ImportReport {
  ok: boolean;
  source: string;
  rows: number;
  new: number;
  skipped: number;
  accounts: string[];
  reconcile: ReconcileRow[];
  rounding: { sheet: string; diff: number }[];
  zeroed: { account: string; date: string; amount: number }[];
  unpaired: { sheet: string; row: number; date: string; amount: number; note: string }[];
  unresolvedCategories: { key: string; rows: number; example: string }[];
  unresolvedRows: { sheet: string; row: number; date: string; amount: number; note: string }[];
  changed: unknown[];
  gone: unknown[];
  replace: number;
  errors: string[];
  cardTerms: string[];
  nameWarnings: string[];
  sample: Tx[];
}

export interface ImportPreview {
  report: ImportReport;
  preview_id?: string;
  message?: string;
}

export interface Grant {
  id: string;
  client: string;
  scope: string[] | string;
  created: number | string;
}

// ---- Cards module (src/modules/cards)

export interface CardStatement {
  from: string;
  close: string;
  open: boolean;
  opening: number;
  purchases: number;
  refunds: number;
  cashback: number;
  fees: number;
  charges: number;
  payments: number;
  adjust: number;
  closing: number;
  deferred: number;
  amountDue: number;
  bank: number | null;
  bankDiff: number | null;
  due: string | null;
  paidByDue: number;
  paid: number;
  toPay: number;
  status: "none" | "paid" | "due" | "late" | "partly" | "unpaid" | "open";
}

export interface CashbackPeriod {
  from: string;
  close: string;
  open: boolean;
  spend: number;
  byRate: { rate: number | null; spend: number; categories: string[] }[];
  expected: number;
  incomplete: boolean;
  minSpend: number | null;
  minMet: boolean;
  needForMin: number;
  cap: number | null;
  capLeft: number | null;
  received: number;
  payBy: string;
}

export interface CardSummary {
  account: string;
  name: string;
  bank: string | null;
  last4: string | null;
  status: string;
  owed: number;
  limit: number | null;
  limitAtLeast: number | null;
  used: number | null;
  last: CardStatement | null;
  current: CardStatement | null;
  toPay: number;
  due: string | null;
  daysToDue: number | null;
  cashback: CashbackPeriod | null;
  missing: string[];
}

export interface CardRecord {
  id: string;
  kind: "credit" | "debit" | "atm";
  account?: string;
  bank?: string;
  name?: string;
  network?: string;
  last4?: string;
  status?: "active" | "locked" | "inactive" | "cancelled";
  issued?: string;
  activated?: string;
  cancelled?: string;
  locked?: string;
  physical?: "physical" | "virtual" | "both";
  apple_pay?: boolean;
  annual_fee?: number;
  close_fee?: number;
  benefits?: number;
  cancel_plan?: { by?: string; note?: string };
  keep_for_limit?: boolean;
  fees_url?: string;
  note?: string;
}

export interface CardValue {
  card: string;
  account: string | null;
  name: string;
  kind: "credit" | "debit" | "atm";
  status: string;
  benefits: number;
  cashback: number;
  fees: number;
  feesFrom: "ledger" | "record" | "none";
  closeFee: number;
  net: number;
  last12: { benefits: number; cashback: number; fees: number; net: number };
  feeMonth: number | null;
}

export interface CardsModule {
  asOf: string;
  cards: CardSummary[];
  totals: { owed: number; dueWeek: number; dueMonth: number; limit: number };
  records: CardRecord[];
  values: CardValue[];
}

export interface FeeWaiverStatus {
  account: string;
  name: string;
  target: number;
  yearFrom: string;
  deadline: string;
  spent: number;
  needed: number;
  perMonth: number;
  daysLeft: number;
  onTrack: boolean;
  met: boolean;
}

export interface CardTerms {
  statementDay: number | null;
  dueDay: number | null;
  limit: number | null;
  bank: string | null;
  last4: string | null;
  annualFee: number | null;
  feeMonth: number | null;
  feeWaiver: { spend: number; within: string } | null;
  freeDaysMax: number | null;
  cashback: { base: number; rules: { categories: string[]; rate: number | null }[]; cap: unknown; min_spend: unknown; spend_max: unknown } | null;
}

export interface CardDetail {
  asOf: string;
  account: { id: string; name: string; type: string; closed?: string | null };
  record: CardRecord | null;
  terms: CardTerms;
  summary: CardSummary | null;
  statements: CardStatement[];
  cashback: CashbackPeriod[];
  feeWaiver: FeeWaiverStatus | null;
  instalments: PlanStatus[];
  value: CardValue | null;
  payByToday: string | null;
}

export type CardTxKind = "purchase" | "fee" | "charge" | "payment" | "refund" | "cashback" | "adjust";

export interface StatementDetail {
  statement: CardStatement;
  transactions: (Tx & { kind: CardTxKind | null })[];
}

export interface BestCard {
  account: string;
  name: string;
  rate: number | null;
  earn: number | null;
  capLeft: number | null;
  minSpendShort: number;
  payBy: string | null;
  freeDays: number | null;
  limitLeft: number | null;
  reason: string;
}
