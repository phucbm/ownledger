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
| `imports/statements/<account-id>/<YYYY-MM>.pdf` | Optional: the bank's statement PDFs, unlocked (see Bank statements) |
| `imports/statements/sources.yaml` | Optional: how to find each card's statements in email |
| `.env.statements` | The statement passwords, on the owner's computer only (git-ignored; never commit, never print) |

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
- `trail: [{op, at, via, client?, reason?}]` records each add/edit/void made through a connector (who, when, why). Append only; never edit or remove entries.

## Account types

`cash`, `bank`, `ewallet`, `credit_card` (details: `statement_day`, `due_day`, `limit`, optionally `bank` and `product`: the bank's own name for the card, e.g. "MSB Visa Online", used to look the card up in a card catalog such as OpenWallet; and the card terms below), `bnpl`, `deposit`
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

## Bank statements

The bank's own statement PDFs can be kept in the repo, one per card per statement:
`imports/statements/<account-id>/<YYYY-MM>.pdf`. `YYYY-MM` is the month of the statement's **close date** (the
period's last day), not the month the bank sent it: a period 01–31/10 sent on 05/11 is `2026-10.pdf`. They are stored
**unlocked**. Only the owner's computer reads them (this CLI); the Worker only hands a filed PDF to the signed-in
dashboard ("Statement PDF" on a statement) and never reads it. Optional: a repo without statements works the same.

`imports/statements/sources.yaml`, per account id: `from` (the bank's sender address), `subject` (words in the subject),
`password` (the name of the variable in `.env.statements`, e.g. `PW_WOORI`), `password_hint` (what the password is made
of, e.g. "date of birth ddmmyy"; never the password itself). The bank's own email facts, nothing else. Optional, how to
read the statement when the general rules don't fit (data, never code): `closing_label` (the label of the bank's
closing figure, e.g. "Payable amount"; a string or a list), `credit_words` (words that mark a row as money back on the
card: payment, refund, cashback…), `skip_words` (lines that are never rows), `amount_column` (which amount on a row is
its amount when there are several, zeros and other currencies not counted: `1` = first, `-1` = last, the default).

Passwords live in `.env.statements` at the repo root (`PW_<ACCOUNT_ID>=…` or `PW_<BANK>=…`, the first word of the id;
or the variable `sources.yaml` names). It is git-ignored. Never commit it, print it, or send it anywhere.

### Collect statements from Gmail

Needs an agent that can save files on the owner's computer (Claude Code, Codex…) with a Gmail connector. ownledger
itself never connects to email.

1. For each card (or the one asked for): search Gmail with `sources.yaml`'s `from`/`subject` if it has the card;
   otherwise find the bank's statement emails and propose a `sources.yaml` entry for the owner's go.
2. Download the PDF attachments to a temporary folder **outside** the repo.
3. If the password variable is missing from `.env.statements`, ask the owner for the password once and write it
   there (never echo it, never commit it).
4. `npx ownledger statements add <account-id> <files…>`: it unlocks each file, reads its statement period from the
   text (or refuses and asks for `--month YYYY-MM`) and shows card, month and period. Already-filed statements are
   skipped; a different file for a month already filed is refused. Show the owner the list, get their go, then run it
   again with `--yes` (files and commits).
5. `npx ownledger statements list` shows which months are missing between the first and the last; report them.

### Check a card's statements against the ledger

**To check a card's statements, run `npx ownledger statements reconcile <account-id>`** (`--from`/`--to YYYY-MM` to
narrow it, `--json` for data). Don't write your own PDF parsing or matching. For every filed statement it shows the
bank's closing figure next to ownledger's (gap = ownledger − bank, the change from the month before, and the part of
the gap that is only timing: rows the bank and the ledger put on opposite sides of a close date). Then it lists rows on
a statement but not on the ledger, ledger rows on no statement, amounts that differ (typos, FX), rows probably booked
on another account, and balance adjustments (`_adjust`) covering a gap. Fees booked with their VAT as one row, and
purchases refunded in full, are matched and shown apart; they need no fix.

Propose the fixes to the owner as **one batch** (the connector's `batch` tool: one preview, one go, one commit; the
`hint` of each item in `--json` is the op to start from: fill in the category). **Never add a balance adjustment to
cover a gap**: find the real rows. If the closing figure isn't found or rows look wrong, add the layout fields to
`sources.yaml` (above) rather than working around it. `--save-bank-amounts` saves each month's bank figure in
`data/cards/statements.yaml` (preview; `--yes` after the owner's go) so `cards` / `card_statement` show the gap
without the PDFs. When a bank prints its closing figure without a label (reconcile says "no closing figure found"),
read the figures off the PDFs and save them as `statement_amount` ops in the same `batch` (`account`,
`statement_date` = the close date, `amount`); reconcile then compares those months too.

`npx ownledger statements check <account-id> <YYYY-MM>` shows one statement: ownledger's figures and transactions for
the period, the rows read from the PDF, and its text with columns kept.

`npx ownledger check` warns about statement files that don't fit (a folder that isn't an account, a name that isn't
`YYYY-MM.pdf`, a PDF still locked).

## Rules for writes

1. Show the owner exactly what will change (the transactions, with amounts and accounts) and wait for their go.
2. Never invent an amount, date or account. Ask if anything is missing.
3. Run `npx ownledger check`; it must pass.
4. One commit per change, with a readable message. Many related transaction fixes are one change: use `batch`.

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
