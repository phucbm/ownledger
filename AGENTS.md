# AGENTS.md: rules for any AI working in an ownledger data repo

This repo is a personal finance ledger. The owner's money is in these files: be exact, never guess
amounts, and never write without the owner's go. `npx ownledger check` must pass after every change.

## Files

| Path | What |
|---|---|
| `data/meta.yaml` | `format` (data format version), `base` (base currency, e.g. VND), `locale` (vi/en), `owner` (GitHub login) |
| `data/assets.yaml` | List of assets: the base currency, plus gold, funds, stocks, ETFs, crypto, foreign currency (`id`, `name`, `kind`, `unit`) |
| `data/accounts.yaml` | List of accounts: `id`, `name`, `type`, `asset` (default base), `opened`, `closed`, `group`, `details` |
| `data/categories.yaml` | `income:` and `expense:` trees of `{id, name, children}`; a category is referred to by its path, `food/eating-out` |
| `data/plans.yaml` | Instalments, loans, insurance premiums, deposit schedules: `{id, kind, account, principal?, count?, every, start, amount?, fee?, rate?}` |
| `data/budgets.yaml` | Optional: `{category, amount, every: month|year}` |
| `data/prices.csv` | `date,asset,price`: price of 1 unit in base currency |
| `data/cards.yaml` | Optional: every physical or virtual card, credit or not (see Cards) |
| `data/cards/statements.yaml` | Optional: the bank's amount per card statement `{account, statement_date, amount}` |
| `data/dashboards/<login>.yaml` | One person's dashboard: widgets and preferences (see Dashboard) |
| `data/ledger/yyyy/mm.jsonl` | One transaction per line, in the month file of its date |
| `imports/raw/` | Original exports, kept as received |
| `imports/<source>.mapping.yaml` | How to read one app's export (see below) |

## Transactions

```json
{"id":"t_8f3a…","date":"2026-11-18","time":"18:40","note":"Lunch","who":null,"event":null,"tags":[],
 "lines":[{"account":"card-visa","amount":-168500},{"category":"food/eating-out","amount":168500}]}
```

- Each line has **either** `account` **or** `category`. `amount` is a signed whole number in the base currency's
  smallest unit (VND: đồng). **The lines of a transaction sum to 0.**
- Money leaving an account is negative on the account line. Spending: positive on the expense category line.
  Income: negative on the income category line.
- Moves between the owner's own accounts (transfers, card payments, deposits opened or closed, investments
  bought, loans given or repaid, borrowing) have **only account lines**, so they never count as income or spending.
- Non-base assets: the account line adds `asset` and `qty`. 2 chỉ of gold for 17,200,000:
  `{"account":"cash","amount":-17200000}`, `{"account":"gold","asset":"GOLD_CHI","qty":2,"amount":17200000}`.
- System categories: `_opening` (opening balances) and `_adjust` (rounding or corrections). They never count as income or spending.
- `void: true` hides a transaction but keeps it in history. Don't delete lines from ledger files.
- `plan: "<plan id>"` marks a payment of an instalment, loan or premium.
- `src: {import, key}` ties an imported transaction to its source row. Never change it.

## Account types

`cash`, `bank`, `ewallet`, `credit_card` (details: `statement_day`, `due_day`, `limit`, and the card terms below), `bnpl`, `deposit`
(details: `principal`, `rate` (annual %), `term_months`, `start`, `maturity`, `rollover`), `savings_goal` (`target`, `by`),
`gold`, `fund`, `stock`, `etf`, `crypto`, `insurance`, `loan_given`, `loan_taken`, `other`.
A type not on this list is still fine: it loads as a plain account with a warning. Extra keys are kept.

## Cards

A credit card is an account (`type: credit_card`): purchases on it, payments to it. Its terms are in `details`, all optional:
`statement_day`, `due_day`, `limit`, `bank`, `number_last4`, `annual_fee`, `fee_month` (1-12, also the start of the card year),
`fee_waiver: {spend, within: year}`, `free_days_max`, and
`cashback: {base, rules: [{categories: [paths], rate}], cap: {amount, per}, min_spend: {amount, per}, spend_max: {amount, per}, paid_on: next_statement | days_after:<n>}`
(`per` is `statement` or `month`; rates are %; a rule's `rate: null` means not known yet).
`from_name: [keys]` lists the keys read from codes in an import's wallet names (🗓️ statement day, 💸 due day, category emoji,
🎉MM/YY anniversary, `1-5tr` spend band, `*1234`); a re-import updates only those, never a key the owner set.

`data/cards.yaml` lists cards: `id`, `kind` (credit, debit, atm), `account` (credit: its account; debit: optionally the wallet
its spending is on), `bank`, `name`, `network`, `last4` (quoted, never a full number), `status` (active, locked, inactive,
cancelled), `issued`, `activated`, `cancelled`, `physical`, `apple_pay`, `annual_fee`, `close_fee`, `benefits` (value received
outside cashback), `cancel_plan: {by: yyyy-mm, note}`, `keep_for_limit`, `fees_url`, `note`. A debit card with cashback carries
`statement_day` (cycle start) and `cashback` here. A cashback paid to another account carries `card: <account id>` on the transaction.
A 0% instalment is a plan `{kind: instalment, account: <card>, principal, count, every: month, start: <first statement>, source: <purchase id>}`.

## Dashboard

`data/dashboards/<login>.yaml`: `version: 1`, `widgets` (each `{id, type, x, y, w, h}` on a 12-column grid, plus `title`,
`query` and `chart` for `type: chart`, options like `period`, `account`), and `prefs.pool` (the "My money" pool: `on`, `name`,
`exclude: [ids]`, `default_account`). The pool is a view only: accounts stay separate in the data. With the pool on, spending with
no account named goes to `default_account`. Change widgets through the connector's `add_widget` / `edit_widget` / `remove_widget`.

## Rules for writes

1. Show the owner exactly what will change (the transactions, with amounts and accounts) and wait for their go.
2. Never invent an amount, date or account. Ask if anything is missing.
3. Run `npx ownledger check`; it must pass.
4. One commit per change, with a readable message.

## First import of a new app

The importer is generic: it reads any table-shaped export (xlsx, csv, json) through a mapping file, and
the mapping is written once, by you, on the first import. Later imports run it as plain code.

1. `npx ownledger import <file>` prints a profile of the file: its sheets, header rows, the figures above
   the header (opening and closing balances, totals), sample rows, distinct values (categories, wallets), and the
   notes of rows with an empty category, which are often transfers. If the profile names a preset
   (e.g. MISA), run `npx ownledger import <file> --preset <name>` to start from it.
2. Write `imports/<source>.mapping.yaml`:
   - **How to read:** `header_row`, `account_from` (`sheet`, `column` or `fixed`), `columns`
     (date, time, in/out or amount, category, subcategory, who, event, note), `date_format`, `decimal`, and
     `totals` (labels of the source's own figures, used for reconciling).
   - **`transfers`:** regexes on the note for money going out and coming in, with a named group `wallet`
     for the other account's name. The importer pairs the two sides by date, time and amount.
   - **`accounts`:** every source account becomes an ownledger account: `id` (short, kebab-case), `name`, `type`,
     and `details`. Users often write facts into wallet names (a card's statement and due day as
     emoji + number, a deposit's term and start date): lift them into `details`, and list the full names
     from transfer notes in `names` when sheet names are cut.
   - **`categories`:** `"Parent/Child"` or `"Parent"` → an ownledger category path (see `data/categories.yaml`).
     Don't map savings and investments to spending: they are transfers to an account (fund, gold, deposit),
     so map the wallet as an account of that type.
   - **`uncategorized`:** rules (regex on the note, optional `sign: in|out`) for rows with no category that
     are not transfers. Don't assume every uncategorised row is a transfer.
   - Any category target can be `account:<id>` instead: the row becomes a move to that account (loans given,
     gold bought, savings and investments with no wallet of their own). Declare such accounts in `accounts` under
     a key starting with `_`.
   - **`rules`:** checked first on every non-transfer row, whatever its source category (e.g. the app's own
     balance corrections → `_adjust`, so they never count as income or spending).
   - **`skip_sheets`** leaves accounts out (e.g. a business account in a personal ledger); **`unpaired`**
     (regex on the other wallet's name → category or `account:<id>`) says where transfers to it go.
   - **`zero_closed: true`** books an `_adjust` on each closed account's closing date so it ends at 0, which clears the
     source app's rounding leftovers. Only with the owner's go; they are listed in the report.
3. Show the owner the account list (types, details) and the category map, and get their go.
4. Run `npx ownledger import <file>`. It refuses unless every source account reconciles: opening + in − out
   must equal the source's closing balance, and every row must be imported, paired or listed. Amounts
   are rounded to whole units; the rounding is booked as `_adjust` and reported. Fix the mapping until it passes.
5. `npx ownledger import <file> --yes` writes, checks and commits. Re-running with a newer export adds only new
   rows, and reports rows that changed or disappeared in the source. The owner decides about those.
