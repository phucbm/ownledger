# 003: A new dashboard: smart, personal, in Vietnamese and English

Written: 2026-11-22. Status: In progress (run started 2026-11-22; direction approved by the owner on 2026-11-22: React + shadcn, rewrite of 003, widgets with drag-and-drop saved in the data repo, AI-built widgets, a module layer, the full Credit cards module)
Related: plan 001 (Phase 6 built the first dashboard), `assets/`, `src/worker/api.ts`, `src/worker/mcp.ts`

## Goal

1. **Simple first.** A new user sees a small, calm dashboard. Cards, deposits, investments, loans, plans and imports appear only when their ledger has them.
2. **It answers questions instead of listing numbers.** How is this month going? What needs me? Where did the money go, and what's different? Every number opens the transactions behind it.
3. **Personal.** The home page is a grid of widgets: drag, resize, add and remove them, and the layout is saved per person in the data repo. The AI can add a widget too ("put my coffee spending per week on my dashboard").
4. **Vietnamese by default, English on request,** with a switch.
5. **A shadcn/ui look**, using the real shadcn components, good on a phone first (the dashboard is installable as a PWA).
6. **Built on modules.** The core stays small (accounts, transactions, categories, reports, net worth); each complex kind of account is a module with its data, logic, alerts, connector tools, pages and widgets, switched on only when the ledger has it.
7. **Credit cards done properly** (the owner has 13): statements, due dates, limits, cashback, which card to use, annual fee waivers, 0% instalments, card lifecycle and the net value of each card.
8. **No micro-managing by default.** Banks, debit cards and e-wallets show as one balance, "Tiền của tôi" (My money); only credit cards are managed one by one. It's a view, never a lock: the accounts stay separate in the data and can be shown and managed separately at any time.

## Where things stand

- The UI is `assets/index.html` (32 lines), `assets/app.js` (369 lines, every page as template strings, hash router at the end) and `assets/app.css` (61 lines). Plain JS, no build, by plan 001's rule.
- `assets/` is served by the Worker's static assets binding (`src/cli/deploy.ts:102`, `node_modules/ownledger/assets`; `src/cli/dev.ts:81` for `ownledger dev`) and shipped in the npm package (`"files"` in `package.json`).
- CSP (`src/worker/auth.ts:7`): `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`.
- The API (`src/worker/api.ts`): `me`, `meta`, `overview`, `accounts`, `transactions`, `report`, `networth`, `plans`, `cards`, `deposits`, `budgets`, `import/*`, `grants`. Read-only except import and grants.
- Writes from the AI go through `src/worker/mcp.ts`: every write tool returns a preview, and `apply(preview_id)` commits after the owner's go.
- The Worker already has a KV namespace (`OAUTH_KV`) for sign-in. It's not used for dashboard data (see "Where the layout lives").
- Working copy, not committed: PNG icons and a manifest change in `assets/`. They move to `web/public/` in this plan and ship with it.

### Why the current dashboard doesn't help

- **Overview compares the wrong things.** "Spent this month" on the 22nd is compared with the whole of last month, so it always looks good until the month ends. There's no pace and no month-end estimate.
- **Nothing is clickable.** A category bar, an account, a month or a due item leads nowhere.
- **Transactions are hard to read.** A flat table of 100 rows, lines shown as `Cash → Food`, no day grouping or day totals, no totals for the filter, and a Filter button for every change.
- **Accounts lists everything.** All 86 accounts from the MISA import, closed and empty ones among them, in file order.
- **Reports need a form,** and compare only with the period before, never with your usual month.
- **Nothing says what's unusual or broken** (spending far above normal, uncategorised rows, accounts with no price, check warnings), and nothing hands the owner from "I see a problem" to "fix it in chat".
- **Everyone sees everything,** whether they have a credit card or not.
- **Credit cards are one row in Accounts.** The engine already computes each card's last statement, what's left to pay and the due date (`cards()`, `src/engine/schedules.ts:28`), but the dashboard shows it only as small text and one "Due soon" line. No page per card, no statement history, no limits in use, no cashback, nothing on which card to use.

## The stack

React app, built when ownledger is published. The people who use ownledger never build anything: `ownledger deploy` and `ownledger dev` stay the same.

| Piece | Choice | Why |
| --- | --- | --- |
| UI | React 19 + TypeScript | components and state for a widget grid, panels and live language switching; escapes text by default |
| Build | Vite | builds `web/` into `assets/` |
| Styles | Tailwind CSS 4 + shadcn/ui (neutral theme) | the real shadcn components (copied into `web/src/components/ui/`, MIT), Radix for keyboard and screen readers |
| Icons | lucide-react | shadcn's icon set, tree-shaken |
| Charts | shadcn charts (Recharts) | same look as the rest, tooltips, responsive |
| Widget grid | react-grid-layout | drag **and resize** on a grid, a stacked layout on phones (dnd-kit has no resize) |
| Data | TanStack Query | caching, refetch on focus, one request per widget shared between widgets |
| Router | wouter with hash location | 2 KB, keeps `#/transactions?...` links working |
| Languages | our own `t()` (no i18next) | two languages, flat dictionary, nothing to add |

Rules that replace plan 001's "plain JS, no build" rule:

- **Same origin only.** Everything is bundled into `assets/` and served by the owner's Worker. No CDN, no web font, no third-party script at runtime. The CSP stays as it is (`script-src 'self'`); Vite's output is external module files, so it fits.
- **Few, pinned dependencies.** Exact versions, the lockfile, Dependabot already in place. Each new browser dependency is named in this plan or added with a reason in the CHANGELOG.
- **Size budget:** the first load is at most 250 KB of JS gzipped, checked in CI (`pnpm build:web` prints the size, CI fails above the budget). Pages other than Home load on demand.
- **Theme:** shadcn's neutral light theme, the system font stack. Dark mode stays out of scope but costs only a second set of the same CSS variables later.

### Layout of the code

- `web/`: the app source (`web/src/`, `web/public/` for icons and the manifest, `web/index.html`, `web/vite.config.ts`).
- `assets/`: the build output, git-ignored from now on, created by `pnpm build` (which now runs `build:web` too) and shipped in the package as before.
- `pnpm dev:web`: Vite on port 5173 with `/api`, `/auth`, `/mcp` proxied to `ownledger dev` on 8787, for hot reload while building. `ownledger dev` alone serves the built `assets/` as today.
- CI (`ci.yml`) and publish (`publish.yml`) run `pnpm build`, which now builds the web app.
- The old `assets/app.js` and `app.css` are deleted when the new app reaches the same pages.

## "Tiền của tôi": one balance for everyday money

Owner's rule (2026-11-22): "to me they all are cash… I just don't want to micro-manage, that would make us lazy to update." But also: "when I want, we should still be able to manage them separately… not lock! others might use it differently."

So the pool is a **view and a preference, never a data change**:

- **The data stays as it is.** Every wallet (the 80 MISA wallets, banks, MoMo, ZaloPay, cash) stays its own account in `accounts.yaml` with its own history. Nothing is merged or rewritten.
- **By default the app groups liquid accounts** (types `cash`, `bank`, `ewallet`) into one line, **"Tiền của tôi" / "My money"**, with one balance: in Accounts, net worth, filters, widgets and "which account" pickers. Credit cards, deposits, investments and loans are never pooled.
- **Expand any time:** the pool line opens to show each account inside it with its balance, and Transactions can filter one account inside the pool. Nothing is hidden, just grouped.
- **Per person, a setting** (Settings → "Tiền của tôi"): on or off; which accounts are in it (all liquid by default, untick any, e.g. keep a business account separate); its name; the default account for new everyday spending (the owner's: `cash`, decided 2026-11-22). Saved with the person's dashboard in `data/dashboards/<login>.yaml` (`prefs.pool`), so it follows them and another person using ownledger can turn it off and manage every account.
- **Writes through Claude follow it:** with the pool on, "spent 50k on coffee" goes to the default account without asking which wallet; paying a card is one row, default account → card. Naming a wallet ("paid by MoMo") still uses that wallet. The connector's `rules` tool returns the pool so the AI knows.
- **Transfers between accounts inside the pool** are hidden from spending, the feed and "Needs you" by default (they already don't count as spending; now they don't clutter either), and shown when the pool is expanded or turned off.
- **`features()`** treats the pool as "one account" for the simple-first rules (e.g. no account filter needed) when it's on.

## Modules

### Why

A credit card, a term deposit, a fund and an instalment loan each need their own fields, rules, alerts and screens. Put all of that in the core and every user carries every feature; leave it out and the app stays shallow. Modules keep the core small and let ownledger grow into a long-term assistant one area at a time.

A module is **not** a new kind of data. A card stays an account in the ledger: a purchase on the card and the bank payment that settles it must balance, and what's owed counts in net worth. A module adds what's *around* that account type.

### What a module is

One folder per module, `src/modules/<name>/`, with a manifest the core reads:

| Part | What it holds |
| --- | --- |
| `types` | the account types it owns (e.g. `credit_card`), moving their `details` fields out of `src/engine/registry.ts` |
| `schema` | the fields in `details` and their checks, run by `ownledger check` |
| `engine` | pure functions over the ledger (statements, cashback, maturity…), tested like the core |
| `features` | when it's on (the ledger has an open account of its types) |
| `attention` | its items for "Needs you" (due, missing cashback, fee target at risk…) |
| `api` | its endpoints under `/api/m/<name>/…` |
| `mcp` | its connector tools and a short instruction block |
| `web` | its pages, nav entry, account-row extras and widgets, in `web/src/modules/<name>/` |

- The core asks every module that's on for its attention items, widgets and nav entries; a module that's off adds nothing anywhere.
- Modules are built in, not plugins: shipped in the package, no third-party code.

### Modules in this plan

| Module | Types | In 003 |
| --- | --- | --- |
| **Cards** | `credit_card` accounts, plus a light list of debit and ATM cards | **complete, below** |
| Deposits | `deposit`, `savings_goal` | ported at today's level (maturity, interest, countdown) |
| Investments | `fund`, `stock`, `gold`, holdings with `qty` | ported at today's level (value, cost, prices) |
| Loans and instalments | `loan_taken`, `loan_given`, `bnpl`, `plans.yaml` | ported at today's level (plans due, progress) |
| Insurance | `insurance`, `insurance_premium` plans | ported at today's level (premiums due) |

Deepening the other modules is for later plans, one each.

## The Cards module

On when the ledger has an open `credit_card` account or `data/cards.yaml` exists. Built for someone with many cards (the owner has 13 credit cards and several debit cards).

- **Credit cards are managed one by one:** each is its own account in the ledger (purchases on it, payments to it), with statements, due dates, limits, cashback and fees, below.
- **Debit and ATM cards are a light list:** they spend from everyday money (the pool), so they need no balance of their own; only the card facts, lifecycle and fees, for reminders and cost. A debit card with cashback (Lio) may link to the wallet account its spending is recorded on, so its cashback can be computed; that account stays in the pool.

### The cards list (`data/cards.yaml`)

One record per physical or virtual card, credit or not. Learned from the owner's own card tracker (a Notion export, "Cards › Subscriptions › Bank cards", 16 cards):

```yaml
- id: vib-familylink
  kind: credit            # credit | debit | atm
  account: vib-familylink # credit: the card's account; debit: optional, the wallet its spending is on (e.g. Lio)
  bank: VIB
  name: VIB Family Link
  network: visa           # visa | mastercard | amex | jcb | napas
  last4: "3584"
  status: active          # active | locked | inactive | cancelled
  issued: 2025-02-13
  activated: 2025-02-13
  physical: physical      # physical | virtual | both
  apple_pay: false
  annual_fee: 899000
  close_fee: 499000
  benefits: 500000        # value received outside cashback (welcome gifts, vouchers…)
  cancel_plan: { by: 2026-12, note: "gọi huỷ t2/26 để xài thêm 1 năm, huỷ t12/26" }
  keep_for_limit: false
  fees_url: https://…
  note: "Hạn mức 5tr/ngày"
```

- Credit card terms (statement and due days, limit, cashback rules, fee waiver) stay in the card account's `details` (below), so the ledger alone still computes statements; `cards.yaml` adds the card's life and costs.
- Only the last 4 digits are stored, never a full number.
- `check` validates it: a credit card's `account` exists and is a `credit_card`; a `cancelled` card's account is closed (warning if not).

### Lifecycle and cancel plans

- Status and dates on every card's page and in the cards list (filter: active, locked, cancelled).
- **Needs you:** a planned cancel month coming up (30 days and 7 days before): "Call VIB to cancel or ask for a fee waiver"; the annual fee month coming up for a card you're not keeping; a card marked cancelled whose account is still open; a locked card with a balance.
- History: when each card was opened, activated, locked, cancelled, kept for its limit.

### Net value per card

- Per card and in total: **benefits + cashback received − annual fees − close fee**, since it was issued and in the last 12 months.
- The owner's tracker today (2026-11-22): annual fees 6.521.000 ₫, close fees 1.299.000 ₫, benefits 5.134.000 ₫ across the cards, before cashback. The module adds cashback from the ledger to get the real picture.
- **Needs you:** a card whose last 12 months cost more than they gave, with its fee month, so the decision (cancel, call for a waiver, keep for the limit) is made before the fee.
- Widget: "Cards: worth it?" (net value per card, sorted).

### Loading the owner's card tracker

One time, through the importer with the AI, from the CSV in the private `my-money` repo (`imports/raw/20261122-cards-tracker.csv`; never in `ownledger`, which is public):

- Fills `cards.yaml` and the credit card accounts' `limit`.
- Lists mismatches with the ledger for the owner to confirm (seen on 2026-11-22): Tech Spark cancelled 14/1/26 and KBank cancelled 05/26 but both accounts still open; "UOB Cashback" in the tracker vs "UOB One" in the ledger; "Woori VV Hype Point" vs "Woori Gold" and "Woori *1926"; Lio is a debit card in the tracker but a credit card in MISA; Sacom Uniq, Sacom Cashback and Sacombank Amex are not in the tracker; MSB Super Free is not in the ledger; MSB mDigi has no limit.
- Column meanings (confirmed by the owner, 2026-11-22): "Credit balance" = the limit; "Close account" = the fee the bank charges to close the card; "Benefits" = value received outside cashback (welcome gift, vouchers, lounge…).
- Decided by the owner (2026-11-22):
  - **Tech Spark and KBank** are closed at load (`closed:` 2026-01-14 and 2026-05, the exact KBank day asked during the load), previewed with any leftover balance and approved with the rest.
  - **Lio is a debit card with cashback**, not a credit card: `lio-5tr` changes from `credit_card` to `bank` (in the pool), its `statement_day: 1` becomes the start day of its cashback cycle, and its card record (`kind: debit`, `account: lio-5tr`) carries the cashback categories and the 1–5 tr spend band from its name codes. The other mismatches (UOB, Woori names, the Sacombank cards, MSB Super Free) are confirmed one by one during the load.

### New card fields (`details` in `accounts.yaml`)

Existing: `statement_day`, `due_day`, `limit`, `bank`. New, all optional:

```yaml
- id: sacom-cashback
  name: Sacom Cashback *8866
  type: credit_card
  details:
    statement_day: 7
    due_day: 3
    limit: 50000000
    bank: Sacombank
    annual_fee: 499000
    fee_month: 1               # month the annual fee is charged
    fee_waiver: { spend: 50000000, within: year }   # spend to waive it, per card year
    free_days_max: 55          # as the bank states it (informational)
    cashback:
      base: 0.5                # % on everything else
      rules:
        - { categories: [food/groceries, food/eating-out], rate: 5 }
        - { categories: [transport/fuel], rate: 3 }
      cap: { amount: 600000, per: statement }   # or per: month
      min_spend: { amount: 5000000, per: statement }
      spend_max: { amount: 10000000, per: statement }   # spend above this earns nothing
      paid_on: next_statement  # when the bank pays it: next_statement | days_after:<n>
```

- `check` validates them (categories exist, rates 0 to 100, caps positive); unknown keys still load with a warning, as today.
- Statement amounts from the bank: a new optional file `data/cards/statements.yaml` (`{ account, statement_date, amount }`), added through the connector when the owner reads the bank's statement, so the computed and the real amount can be compared.
- Which cashback row belongs to which card: a cashback transaction's money lands on the card itself (the card account is on the line), so it's already linked when entered that way. A cashback paid to another account carries `card: <id>` on the transaction; the connector sets it.

### Codes in MISA wallet names

The owner writes card terms into MISA wallet names, and MISA's export has nothing else. Meanings confirmed by the owner on 2026-11-22. The module's import step reads them on every MISA import and re-import:

| Code | Example | Becomes |
| --- | --- | --- |
| `🗓️<d>` | `🗓️7`, `🗓️01` | `statement_day` (read today already) |
| `💸<d>` | `💸3` | `due_day` (read today already) |
| category emoji before the first `•` | `🛒🏋️🍿📞` | `cashback.rules[].categories`: 🛒 shopping, 🏋️ health & sport › sport, 🍿 fun & travel › entertainment, 📞 phone & subscriptions; the emoji → category map lives in the MISA preset and the owner's mapping, so new emoji can be added there |
| `🎉<MM>/<YY>` | `🎉02/25` | card anniversary: `fee_month: 2`, and the card year starts in February (for fee waivers) |
| `<a>-<b>tr` | `1-5tr` | the cashback spend band: `min_spend` 1,000,000 and `spend_max` 5,000,000 per statement |
| `*<4 digits>` | `*4506` | `number_last4` |

- Values read from a name are marked `source: misa-name` in `details`. A value the owner set through Claude or by hand wins and isn't overwritten by a re-import.
- Codes that can't be read become a warning in the import preview, never a guess.
- Rates aren't in the names: the categories are known, the percentages come from the owner.
- Test: every card name in the owner's export shape (made-up names in the fixture) parses to the expected details.

### Statements and due dates

- `statements(l, card, asOf)`: every statement period from the card's first transaction: opening, purchases, refunds, cashback, fees and interest, payments, closing balance, due date, paid in full on time / late / partly, and the bank's amount when entered.
- **All cards** page (the module's main page): one row per card sorted by due date: to pay, days left, used / limit bar, paid in full or not, cashback this period. Totals at the top: owed on all cards, due this week, due this month.
- **A page per card:** the current period (transactions so far, days to close), the last statement (to pay, due, payments), history of statements as a list, cashback and fee targets on the side. Every amount drills into its transactions.
- **Needs you:** a statement due in ≤ 7 days and not fully paid (≤ 3 days in red), a statement paid late or partly, the computed amount differs from the bank's by more than 1,000 ₫, a card near its limit (≥ 80%).
- **Interest-free date for a purchase:** for any card and day, the date the purchase must be paid by (the due date of the statement it falls into).

### Cashback

- `cashback(l, card, period)`: expected cashback per statement from the rules (per category, base rate, cap, minimum spend) against what was received, cap left, and how much more spend reaches the minimum.
- Shown per card and in total: this period, last 12 months, earned vs expected.
- **Needs you:** expected cashback for a closed statement not received by when the bank pays it (`paid_on`), cap almost used, minimum spend not reached with days left.
- Widget: "Cashback this period" (all cards, cap left per card).

### Which card to use

- `bestCard(l, { category, amount, date })`: ranks open cards by cashback for that category (respecting cap left and minimum spend), then by interest-free days for that date, then by limit left. Each with the reason in one line: "Sacom Cashback: 5% (cap left 240k) · pay by 03/01 (42 days)".
- On the dashboard: a "Which card?" widget with a category picker, and a short ranked list on each category in Reports.
- In the connector: a `best_card` tool, so "which card should I use for groceries today?" gets a real answer in Claude.

### Annual fee waivers

- Per card with `fee_waiver`: spent in the current card year vs the target, the deadline (the fee month), and the spend needed per remaining month.
- **Needs you:** at risk when the pace won't reach the target by the deadline (30 and 7 days before), and when the fee is charged (to ask the bank for a refund if the target was met).

### 0% instalments (trả góp 0%)

- A card purchase converted into instalments becomes a `plans.yaml` plan with `kind: instalment`, `account: <card>`, `count`, `amount`, `fee` (the conversion fee), and `source: <transaction id>` linking the original purchase.
- The card page shows active instalments: paid / count, left, the monthly amount that lands on each statement. Statements count only the instalment amount for that month, not the whole purchase.
- Connector: `add_instalment` (preview → apply) from a transaction id and the bank's terms.

### Connector tools

`cards` (exists) gains statement history, cashback and fee status; new: `card_statement` (one period in detail), `best_card`, `add_statement_amount`, `add_instalment`, `set_card_details` (limits, days, cashback rules, fee waiver: previewed like any edit). All writes preview → owner's go → `apply`.

### Data to fill in before the card features are useful

Checked on 2026-11-22 against the MISA export (`my-money/imports/raw/20261122-Bang_ke_thu_chi_….xlsx`, 80 sheets, one per wallet).

**What the export has.** Only transactions per wallet (date, time, category, note, who, amounts, balance, event). MISA's export has no wallet settings: no limit, no cashback rules, no fee terms. The statement and due days we have came from the owner's own codes in the wallet names (`🗓️7💸3` = statement day 7, due day 3), which the import reads.

**What the history can fill in (the module derives it, the owner confirms):**

- Cashback actually received per card and per statement: the rows in "Hoàn tiền & khuyến mãi" that land on a card (or are linked to one).
- Annual fees charged: "Phí thường niên" rows on a card give the fee amount and its month.
- A lower bound for each card's limit: the highest amount ever owed on it (shown as "at least", never as the limit).

**What only the owner knows:**

| Card (id) | Missing |
| --- | --- |
| All 13 cards | `limit`: not in the MISA export, but in the owner's card tracker for most (UOB 199 tr, VIB 172 tr, HSBC 140 tr, Woori 80 tr, MSB VS 50 tr, Tech Spark 20 tr, KBank 10 tr); MSB mDigi and the 3 Sacombank cards still missing |
| `sacombank-amex` (Sacombank Amex) | `statement_day`, `due_day`: its MISA name has no `🗓️…💸…` code |
| `lio-5tr` (Lio 5tr) | a debit card with cashback (owner, 2026-11-22): no due day needed; only the cashback rates for its categories (categories, anniversary and spend band come from its name codes, below) |
| Every card with cashback | rates per category, cap, minimum spend, when it's paid |
| Every card with an annual fee | waiver spend target (fee amount and month can come from history) |
| Active 0% instalments | the original purchase, count, monthly amount, fee |
| Cards no longer used | `closed: <date>` |

Not card data, but found at the same time: two account names were cut by the import, `dau-tu-khac` ("Đầu tư khác (chứng khoán, CCQ ngoài ví)") and `tich-luy` ("Tích luỹ (VIB, Woori, Tích sẵn)"). The commas inside an unquoted flow-style YAML value split them (`imports/misa.mapping.yaml:828-829`, and the same in `accounts.yaml`). Fix both names in `my-money`, and fix the writer so a value with `,` `:` `{` `}` `[` `]` is always quoted (a test for it).

## Languages

- A `VI | EN` switch (shadcn toggle group) in the sidebar on desktop and in More on phones. Remembered on the device (`localStorage`, `ownledger.lang`). Vietnamese until you pick.
- Switching re-renders in place (a React context) and sets `<html lang>`.
- `web/src/i18n/vi.ts` and `en.ts`: flat dictionaries with dotted keys (`"nav.transactions"`), placeholders as `{n}`, plurals with `Intl.PluralRules` (`{ one, other }`) for the few counted strings English needs. `t()` falls back to English, then to the key.
- Numbers in `vi-VN` / `en-US`; the currency mark from `base` (₫ for VND). Dates through `Intl.DateTimeFormat` in the UI language.
- Transaction type names from `/api/meta` in the UI language.
- **Not translated:** your own data (account and category names, payees, notes), API error text (shown inside a translated wrapper), the connector's text, the server-rendered sign-in, consent and error pages (later: the same switch sets a cookie they read).
- **Vietnamese copy:** natural, not word for word: Tổng quan, Giao dịch, Tài khoản, Kế hoạch, Báo cáo, Nhập dữ liệu, Cài đặt, Tài sản ròng, Thu, Chi, Thu hồi, Đăng xuất. The full list goes to the owner for review before release.
- **Checks:** a test that both dictionaries have the same keys and no empty value; a test that every `t("…")` key used in `web/src` exists; a lint (eslint `react/jsx-no-literals` with an allow-list) so no English is hard-coded in JSX.

## Simple first: the dashboard shapes itself to the ledger

**From the data, automatically.** A new engine function `features(l)` returns what the ledger has; `GET /api/me` gains `features`. The app builds the nav, pages, sections and the widget catalogue from it.

| Shown only when the ledger has… | What appears |
| --- | --- |
| an open credit card account | card rows in Accounts, statements in "Needs you", card widgets |
| a term deposit | maturity rows and countdowns, the deposits widget |
| an account with `qty` (gold, stocks, crypto) | prices, "no price" warnings, holdings columns |
| a loan or anything owed | the "owed" part of net worth, the liabilities group |
| a plan in `plans.yaml` | the Plans page and tab, plans in "Needs you", the plans widget |
| a mapping in `imports/` | the Import page (otherwise one line in Settings on how to import) |
| `who`, `event` or `tags` on any transaction | those report groupings, filters and chips |
| budgets in `budgets.yaml` | over-budget items |
| fewer than 2 months of history | no comparisons with "usual" yet, and a note that they come after a month or two |
| one account only | no account filter or breakdown, just the balance |

**An empty ledger** gets a getting-started home: three steps (add the connector in Claude or ChatGPT, tell the AI your accounts, add your first spending), each with an "Ask AI" prompt to copy.

**From the person, on top:** the widget grid (below). Hiding a widget is the way to hide a topic; the catalogue never offers what the data can't fill.

## Home: a grid of widgets

### Default layout

With no saved layout, Home shows 4 widgets picked from `features`: **This month** (pace), **Needs you**, **What's different**, **Net worth**. That's the simple start; everything else is one "Add widget" away.

### Built-in widgets

| Widget | Shows | Needs |
| --- | --- | --- |
| This month | spent so far against the same day last month and against your 6-month average at that day ("8,4 tr đã chi · thường là 7,1 tr đến hôm nay"), month-end estimate (run rate + plans still due), a cumulative line with the "usual" band behind it | 1 month of history (the average needs 2+) |
| Left this month | income so far minus spending so far, and at month end | — |
| Needs you | one sorted list: overdue plans, card statements (days left), deposits maturing, plans due in 7 days, then housekeeping: uncategorised transactions, unpriced holdings, check errors and warnings, transfers without their other side; each links to where it's fixed or has an "Ask AI" prompt | — |
| What's different | up to 5 cards: a category ≥ 30% and ≥ a minimum amount off its 6-month average, a new payee or category, an unusually large transaction (top 1% for its category) | 2 months |
| Net worth | value, change this month and over 12 months, the 12-month line | — |
| Spending by category | bars for a period you choose, with share and change | — |
| Income vs spending | columns per month, savings rate line | — |
| Recent transactions | the last N, in the feed style | — |
| Account | one account's balance and its line | — |
| Cards | used / limit bars, amount to pay, days to due | cards |
| Deposits | maturity countdowns, interest at maturity | deposits |
| Upcoming | the next 30 days as a strip, amount due per week | plans or cards |

### Custom chart widgets

A **chart widget** is a saved query plus a chart kind. It is what the AI builds, and what "Add widget → Custom chart" builds in the app with a small form.

- **Query:** `metric` (spending, income, net, balance, count), filters (`category`, `account`, `who`, `event`, `tag`, `text`), `period` (preset like `this-month`, `last-3-months`, `this-year`, `last-12-months`, or `from`/`to`), `by` (`day`, `week`, `month`, `category`, `top`, `account`, `who`, `event`, `tag`), optional `compare` (`previous`, `usual`).
- **Chart:** `stat` (one number with change), `line`, `bar`, `hbar`, `table`.
- Served by one new endpoint, `GET /api/series`, on top of the engine's `report()` (which gains `by=day` and `by=week`).

### Editing

- An "Edit" button turns the grid into edit mode: drag to move, drag a corner to resize (12 columns on desktop, snapped sizes), a remove button on each widget, a settings button for widgets with options (period, account, category, chart kind), and "Add widget" opening the catalogue (a shadcn sheet with a preview per widget).
- **Done** saves; **Cancel** throws the changes away. "Reset to default" in the edit bar.
- On phones (below 640px) the grid becomes one column in the same order; editing on a phone is reorder, add and remove only (no resize).

### Where the layout lives

In the owner's data repo, next to the ledger, so it moves, versions and backs up with the data, and the AI can read and change it with the write rules it already has.

- `data/dashboards/<login>.yaml`, one file per GitHub login (several logins in `ALLOWED_LOGINS` each get their own).
- Example:

```yaml
version: 1
widgets:
  - { id: month, type: pace, x: 0, y: 0, w: 6, h: 4 }
  - { id: needs, type: attention, x: 6, y: 0, w: 6, h: 4 }
  - id: coffee
    type: chart
    title: Cà phê mỗi tuần
    query: { metric: spending, category: food/coffee, period: last-3-months, by: week }
    chart: bar
    x: 0
    y: 4
    w: 6
    h: 3
```

- **Saving from the app:** `PUT /api/dashboard` with the whole layout, one commit per Done (`Dashboard: layout (<login>)`). No preview step: it's not money, and pressing Done is the go. The Worker refuses a layout that doesn't validate.
- **No file yet** means the default layout; the file is created on the first Done.
- `ownledger check` validates these files: known widget types, valid query fields, positions inside the grid; an unknown category or account in a query is a warning (the widget shows "category not found" instead of breaking).
- Not KV: KV is tied to one Worker and lost on a redeploy to a new namespace, and it would put the owner's data outside their repo.

### AI-built widgets

New connector tools in `src/worker/mcp.ts`, following the same preview → owner's go → `apply` rule as every other write:

- `dashboard`: read the current layout (widgets with ids, titles and queries) for the signed-in login.
- `add_widget`: a chart widget from a query (or a built-in widget by type), placed at the end of the grid by default. Returns a preview with what the widget will show (the first numbers of the series), so the owner sees it's the right thing before it's saved.
- `edit_widget` and `remove_widget`: by id.
- The instructions and `rules` gain a short note: use the categories and accounts from `rules`; when the owner asks to "track" or "watch" something on the dashboard, offer a widget.

## Pages

### Drill-down everywhere

- Every number that's a sum opens the transactions that make it up: category bars, report rows, month columns, account balances, stat tiles, "What's different" cards, chart points.
- Through the URL (`#/transactions?category=food&from=2026-11-01&to=2026-11-30`), so Back works and links can be shared between devices.
- Transactions shows the filter it was opened with as removable chips.

### Transactions

- **A feed grouped by day,** newest first, the day's net beside the date. Each row: category icon and name (or "Transfer"), note and who underneath, amount on the right: red out, green in, grey for transfers between your own accounts.
- **Totals for the current filter** at the top: in, out, net, count.
- **Instant filters:** search as you type (300 ms), period chips (this month, last month, 3 months, this year, custom range), account and category comboboxes with search. The URL follows the filters.
- **Load more** at the end (`offset` in the API) instead of "Showing 100 of 4,968".
- **A row opens a side panel** (a bottom sheet on a phone): every line with account and category, tags, who, event, the id, and "Ask AI to edit this".
- Opened from an account: a running balance column.

### Accounts

- **Net worth broken down** at the top: a stacked bar by account type with each type's share.
- Groups sorted by value, accounts inside by absolute value. Zero-balance accounts with no activity in 90 days fold into "Inactive (n)"; closed ones stay behind a toggle.
- Cards: used / limit bar, to pay, days to due. Deposits: days to maturity, interest. Holdings: quantity, price date, cost.
- An account opens its transactions with the running balance.

### Reports

- **Period presets** as a segmented control: This month, Last month, 3 months, 6 months, This year, Last year, Custom. No Show button.
- **Compared with your usual:** each row shows this period, the average for a period of the same length over the previous 6 months, and the change, sorted by the biggest change in money. This is the "why is this month different" table.
- Income and spending by month with the savings rate; each column opens that month.
- "Pin to Home" on any chart in Reports makes it a chart widget with the same query.

### Plans

- The next 30 days as a strip with what's due per day and per week.
- Instalment progress bars (paid / count, money left).

### Import and Settings

- Same features as now, in the new components. Settings gains: language, "Reset dashboard", and the connector URL with a copy button.

### "Ask AI" hand-off

- Where the owner would want to act, an "Ask AI" button copies a ready prompt to the clipboard, in the UI language, e.g. "In ownledger, categorise the 12 transactions without a category since 2026-11-01."
- Clipboard only: nothing goes to an outside site, no links with financial data in the URL.

## Layout and look

- **Desktop:** a shadcn sidebar (brand, nav with icons, language switch, the signed-in user and Sign out at the bottom), content up to 1680px (raised from 1280px 2026-11-22, owner: "use the full width"); from 1536px Home shows half-width widgets three to a row (display only), Reports panels side by side, Cards 3-up; from 1280px a transaction's details dock beside the list. **Phone:** a bottom tab bar with Home, Transactions, Accounts, Reports, More (Plans, Import, Settings and the language switch under More). Tap targets at least 44px.
- **One headline per page:** each page opens with its answer in large type, then the detail.
- **Short money for scanning, full money for reading:** widgets and lists use `8,4 tr` / `8.4M`; the side panel and tables show `8.420.000 ₫`. Tabular figures, right-aligned.
- **Colour means one thing:** green money in, red overdue or urgent, amber due soon, grey transfers. Spending stays ink (it is normal, not an alarm). Chart series follow the dataviz palette (validated for contrast); everything else neutral.
- **Minimal look with colour where it means something** (owner, 2026-11-22: "still minimalism pls! make finance easy to manage"): emerald accent (buttons, current page, links, focus), warm off-white page with white cards, a small line icon per widget in its family colour (spend orange, money green, cards violet, time blue, alerts red), status colours as theme tokens (`--positive`, `--warning`, `--critical`) with their own dark steps, severity icons in Needs you.
- **Accounts** (owner, 2026-11-22: "very hard to read"): tabs Tài sản / Nợ / Ngưng dùng; one collapsed row per type with total, share and the allocation bar's colour dot; Nợ sorted by soonest due.
- **Category icons:** lucide icons for the default top categories (food, transport, home, bills, health, shopping, income…), a letter in a tinted circle for the owner's own.
- **Loading and empty states:** skeletons shaped like each widget; every empty state says why and what to do, with an "Ask AI" prompt where it helps.
- **Motion:** only the sheet and panel transitions and widget drag; `prefers-reduced-motion` honoured.
- **Accessibility:** focus rings everywhere (shadcn `ring`), keyboard reordering of widgets in edit mode (move up/down buttons), charts with a "Show as table" option, contrast at least 4.5:1 for text.

### Layout drafts (approved 2026-11-22)

The reference for step 3. Vietnamese UI, numbers made up.

**Desktop: Home, default widgets**

```
┌──────────────────┬──────────────────────────────────────────────────────────────────┐
│ ◉ ownledger      │  Tổng quan                                   [✎ Sửa]  [+ Widget] │
│                  │  8,4 tr đã chi tháng 11 · thường là 7,1 tr đến hôm nay           │
│ ⌂ Tổng quan    ● │ ┌───────────────────────────────┐ ┌────────────────────────────┐ │
│ ⇄ Giao dịch      │ │ Tháng này                     │ │ Cần bạn xử lý           5  │ │
│ ▤ Tài khoản      │ │ 8.420.000 ₫   ▲ 18% so với TB │ │ ● Quá hạn  Trả góp iPhone  │ │
│ ◷ Kế hoạch       │ │ Dự kiến cuối tháng: 11,6 tr   │ │            2,1 tr · 20/11  │ │
│ ▦ Báo cáo        │ │      ___/‾‾ tháng này         │ │ ● 3 ngày   Thẻ VIB 4,3 tr  │ │
│                  │ │   _/‾  ░░░░ vùng thường lệ    │ │ ● 7 ngày   Gửi tiết kiệm   │ │
│                  │ │  /░░░░░░░░                    │ │ ○ 12 giao dịch chưa có     │ │
│                  │ │ 1        11        22      30 │ │   danh mục   [Hỏi AI ⧉]    │ │
│                  │ └───────────────────────────────┘ └────────────────────────────┘ │
│                  │ ┌───────────────────────────────┐ ┌────────────────────────────┐ │
│                  │ │ Có gì khác                    │ │ Tài sản ròng               │ │
│                  │ │ ▲ Ăn uống   3,2 tr  +42% TB → │ │ 1,24 tỷ  ▲ 12 tr tháng này │ │
│                  │ │ ▼ Đi lại    0,4 tr  −35% TB → │ │                   ___/‾    │ │
│                  │ │ ★ Mới: "Gym Fit24"   900k   → │ │        ____/‾‾‾‾‾          │ │
│ ─────────────    │ │ ! Lớn bất thường: Điện máy    │ │ ___/‾‾                     │ │
│ [ VI | EN ]      │ │   XANH 12,5 tr              → │ │ 12/25              11/26   │ │
│ ⚙ Cài đặt        │ └───────────────────────────────┘ └────────────────────────────┘ │
│ ◐ phucbm   ⎋     │                                                                  │
└──────────────────┴──────────────────────────────────────────────────────────────────┘
```

**Desktop: edit mode** (Done = one commit to `data/dashboards/<login>.yaml`; ✦AI marks a widget the AI added)

```
│  Tổng quan · Đang sửa      [↺ Mặc định]  [+ Thêm widget]  [Huỷ]  [ Xong ✓ ]        │
│ ┌ ⠿ Tháng này ─────────── ⚙ ✕ ┐ ┌ ⠿ Cần bạn xử lý ─────── ✕ ┐                      │
│ ┆                              ┆ ┆                            ┆   ⠿ drag to move     │
│ ┆                            ◢ ┆ ┆                          ◢ ┆   ◢ drag to resize    │
│ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                      │
│ ┌ ⠿ Cà phê mỗi tuần ✦AI ── ⚙ ✕ ┐ ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                      │
│ ┆ ▂▅▃▇▄▆▅▃                     ┆ ┆      + Thêm widget         ┆                      │
│ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                      │
```

**Desktop: Transactions with the side panel**

```
│  Giao dịch                                       │ Chi tiết                     ✕ │
│  [🔍 Tìm ghi chú, người, sự kiện…              ] │ Thứ Bảy, 22/11/2026  09:14     │
│  (Tháng này) (Tháng trước) (3 tháng) (Năm nay) ▾ │ Cà phê Highlands               │
│  [Tài khoản ▾] [Danh mục ▾]   Ăn uống ✕         │ − 65.000 ₫                     │
│  Thu 0 · Chi 3,2 tr · Ròng −3,2 tr · 48 giao dịch│ ────────────────────────────── │
│  ── Hôm nay, 22/11 ────────────────── −185k ──── │ Từ      Tiền mặt               │
│  ☕ Cà phê         Highlands          −65.000 ●  │ Vào     Ăn uống › Cà phê       │
│  🍜 Ăn trưa        với Minh          −120.000    │ Người   Minh                   │
│  ── Thứ Sáu, 21/11 ────────────────── −2,1 tr ── │ Thẻ     #cuoi-tuan             │
│  🛒 Siêu thị       Co.opmart         −860.000    │ Mã      tx_8f3a…               │
│  ⇄ Chuyển khoản    VCB → Tiền mặt   1.000.000    │                                │
│            [ Xem thêm ]                          │ [⧉ Hỏi AI sửa giao dịch này]   │
```

**Mobile (375px): Home**

```
┌─────────────────────────────┐
│ ownledger          [✎] [＋] │
│ 8,4 tr đã chi               │
│ thường là 7,1 tr đến hôm nay│
│ ┌─────────────────────────┐ │
│ │ Tháng này     ▲ 18% TB  │ │
│ │ 8.420.000 ₫             │ │
│ │ Dự kiến: 11,6 tr        │ │
│ │   ___/‾‾  ░░░ thường lệ │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Cần bạn xử lý        5  │ │
│ │ ● Quá hạn  iPhone  2,1tr│ │
│ │ ● 3 ngày   Thẻ VIB 4,3tr│ │
│ │ Xem tất cả ›            │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Có gì khác              │ │
│ │ ▲ Ăn uống  +42%       › │ │
│ └─────────────────────────┘ │
│            ⋮                │
├─────────────────────────────┤
│  ⌂     ⇄     ▤     ▦    ≡   │
│Tổng  Giao  Tài   Báo  Thêm  │
│quan  dịch  khoản cáo        │
└─────────────────────────────┘
```

**Mobile: Transactions, and the bottom sheet on a row**

```
┌─────────────────────────────┐   ┌─────────────────────────────┐
│ Giao dịch                   │   │ ░░░░░░ (list dimmed) ░░░░░░ │
│ [🔍 Tìm…                  ] │   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ (Tháng này)(Tháng trước)(…) │   ├────────────  ▬  ────────────┤
│ Chi 3,2 tr · 48 giao dịch   │   │ Cà phê Highlands            │
│ ─ Hôm nay ─────── −185k ─── │   │ − 65.000 ₫                  │
│ ☕ Cà phê          −65.000  │   │ Tiền mặt → Ăn uống › Cà phê │
│    Highlands                │   │ Minh · #cuoi-tuan           │
│ 🍜 Ăn trưa        −120.000  │   │ 22/11/2026 09:14            │
│    với Minh                 │   │                             │
│ ─ Thứ Sáu 21/11 ─ −2,1 tr ─ │   │ [⧉ Hỏi AI sửa giao dịch này]│
├─────────────────────────────┤   ├─────────────────────────────┤
│  ⌂     ⇄●    ▤     ▦    ≡   │   │  ⌂     ⇄●    ▤     ▦    ≡   │
└─────────────────────────────┘   └─────────────────────────────┘
```

- Phone editing: reorder, add, remove (no resize); widgets stack in one column.
- "Thêm" (More) holds Kế hoạch (only with plans), Nhập dữ liệu (only with an import mapping), Cài đặt and the `VI | EN` switch.
- Icons in the drafts stand in for lucide icons; emoji are not used in the real UI.

## Server side (engine, API, connector)

New engine functions, pure and tested like the rest of `src/engine/`:

| Function | Returns |
| --- | --- |
| `features(l)` | what the ledger has (table above), plus `historyMonths` |
| `pace(l, asOf, months = 6)` | spending and income by day this month, the same for last month and the average of the last `months` months, the month-end estimate |
| `usual(l, period, by, months = 6)` | per row: this period, the same-length average over the previous `months` months, change in money and % |
| `attention(l, asOf)` | the "Needs you" list from `today()` plus housekeeping, each with kind, date, amount and a target link |
| `unusual(l, asOf)` | the "What's different" cards; thresholds as constants at the top of the file |
| `series(l, query)` | the data for a chart widget, on top of `report()` (which gains `by=day` and `by=week`) |
| `checkDashboard(file, l)` | issues for `data/dashboards/*.yaml`, used by `ownledger check` and by `PUT /api/dashboard` |

API changes in `src/worker/api.ts`:

- `GET /api/me` gains `features`.
- `GET /api/home`: `pace`, `attention`, `unusual` and the net worth summary in one call.
- `GET /api/series?…`: a chart widget's data.
- `GET /api/report` gains `usual=6`; `GET /api/transactions` gains `offset` and returns `totals` (in, out, net) for the whole filter; `GET /api/accounts` gains `lastActivity`.
- `GET /api/dashboard` and `PUT /api/dashboard` (the signed-in login's layout; the PUT commits through the same GitHub App path as `import/apply`).

Connector (`src/worker/mcp.ts`): `dashboard`, `add_widget`, `edit_widget`, `remove_widget` as above; `about` mentions the dashboard file. Module tools are registered by each module (Credit cards: above).

Module layer: `src/modules/index.ts` lists the built-in modules; the core's `features()`, `attention()`, `check`, the API router, the connector and the web app's nav and widget catalogue all read from it. The card logic in `src/engine/schedules.ts` (`cards()`) moves into `src/modules/cards/`, and deposits, plans and holdings logic into their modules, with their tests, before anything new is added.

## Checks

- Engine tests for every new function on the test fixtures: mid-month pace, no history, a new category, thresholds just below and above, a week series across a month boundary, dashboard files with bad types, positions and unknown categories.
- API test: the `totals` of a drill-down filter equal the report row or widget value it came from.
- Connector test: `add_widget` previews without writing, `apply` writes exactly one dashboard file, a second login's file is untouched.
- i18n tests and the JSX literal lint (above).
- Module tests: a ledger with no cards shows no card nav, widget, attention item or connector tool output; moving `cards()` into the module changes no number (the existing tests pass unchanged).
- Card tests on a fixture with several cards: statement periods across month ends and short months (`statement_day: 31`), payments split over two statements, a refund, a late payment, cashback with category rates, a cap hit mid-period, minimum spend not reached, cashback paid to another account with `card:`, a fee waiver on and off pace, a 0% instalment counted per statement, `bestCard` ranking with cap left and free days.
- The YAML writer quotes values with flow-style special characters (the `dau-tu-khac` case).
- CI: typecheck, tests, web build, bundle size budget.
- Home renders in under 1 s on the `my-money` data (4,968 transactions) with `ownledger dev`, Home's data in one request.
- Manual on `localhost:8787`: every page at 375px and desktop, vi and en; edit mode (drag, resize, add, remove, Cancel, Done, reload keeps it, a second browser sees it after Done); a widget added from Claude appears after `apply`; Back after drill-downs; keyboard only through every page. A browser is used only with the owner's permission; otherwise the owner checks and says so.

## Out of scope

- Editing money data in the dashboard (forms to add or edit transactions). Writes stay in chat through the connector; the dashboard hands off with "Ask AI".
- An AI model inside the Worker. Insights are plain rules in the engine.
- Dark mode, languages other than vi and en, translating your own data and API errors, translating the server-rendered auth pages.
- Separate layouts per device (one layout per person, stacked on phones).
- Sharing a dashboard with someone else, or several named dashboards per person.
- Recurring-payment (subscription) detection: a good next plan once `usual()` exists.
- Budgets UI (`budgets.yaml` is empty in `my-money`; "compared with your usual" covers the need for now).
- Deepening the Deposits, Investments, Loans and Insurance modules (each a later plan; ported as they are here).
- Card interest and late-fee calculation (only flagged as "paid late or partly"; the actual charges are entered from the statement).
- Reading bank statements or bank notifications automatically.
- Third-party modules or plugins.
- Merging accounts in the data: the pool is a view only.
- Cashback by merchant code (MCC), and looking up card terms from an outside card database; cashback here is by category, with rates the owner enters.
- Subscriptions (recurring charges and renewal dates): a later module.

## Release

- Nothing is committed, published or deployed while the work runs: the owner checks it on `localhost:8787` first.
- On the owner's go: commit, **2.0.0** (the dashboard is replaced and the package now ships a built app), CHANGELOG entry explaining the new stack, modules, the pool, the new card fields and the new `data/dashboards/`, `data/cards.yaml` and `data/cards/` files, publish to npm, then `npm i ownledger@latest` and `ownledger deploy` in `my-money`.
- Plan 001's "plain JS, no build step for `assets/`" rule is marked as replaced by this plan in 001 and in `AGENTS.md`.
- The PNG icons and manifest change in the working copy ship in this release (moved to `web/public/`).

## Order and size

1. **Scaffold:** `web/` with Vite, React, TypeScript, Tailwind, shadcn (neutral), the build into `assets/`, `dev:web` with the proxy, CI and publish building it, the size budget. The app shell: sidebar, bottom tabs, router, i18n with the switch, the API client with TanStack Query.
2. **Module layer:** `src/modules/`, moving cards, deposits, plans and holdings logic into their modules with no change in numbers; the YAML quoting fix.
3. **Core server side:** `features()`, `pace()`, `attention()`, `unusual()`, `usual()`, `series()`, `checkDashboard()`, their tests, the API changes.
4. **Home with the default widgets** and **Transactions**, on the `my-money` data. **The owner reviews these two on `localhost:8787` before the rest is built.**
5. **Tiền của tôi and the Cards module:** the pool view and its setting; `cards.yaml`, the card tracker load and its mismatch list; new fields and checks, statements, due dates and limits, cashback, which card to use, fee waivers, 0% instalments, lifecycle and cancel plans, net value per card; its API, connector tools, pages and widgets. Meanwhile the owner fills in the card data checklist (through Claude once `set_card_details` exists). **The owner reviews the card pages with their real cards.**
6. **Accounts, Reports, Plans, Import, Settings** in the new app, with the other modules at today's level; the old `app.js` and `app.css` deleted.
7. **Widget editing:** catalogue, edit mode, chart widget form, "Pin to Home", saving to `data/dashboards/`.
8. **Connector tools:** `dashboard`, `add_widget`, `edit_widget`, `remove_widget`.
9. **The full Vietnamese list** to the owner for review.
10. **Release** on the owner's go.

The biggest pieces are step 3 (seven core engine functions), step 5 (the card module: statements and cashback are the hard part) and step 7 (the grid editor). Steps 4 to 8 each end with something the owner can try on `localhost:8787`.

## Progress

- 2026-11-22 Renumbered 002 → 003: plan 002 is now `002-20261122-cards-period-and-openwallet.md` (merged to main and
  released as 1.2.0/1.2.1 while this branch was open). `main` merged into this branch: the cards module's `cards()`
  gains `bank`, `product` and `period` (spent by category, refunds, cashback booked); the `cards` tool shows them;
  `add_transaction` keeps the pool default and takes main's `reason`; **one `best_card`** (owner, 2026-11-22): the
  owner's own cashback terms first (local), OpenWallet for cards without terms when the source is on, each row with
  its `source`. 122 tests pass, build and size check pass (175.3 KB). Known: `today` still uses the engine's older
  statement maths (to pay 62,000 on the demo card) while `cards` uses the module's statements (137,000: refunds and
  cashback are not payments); align `today` with the module.
- 2026-11-22 Steps 1–9 built in one run (nothing committed, published or deployed). 89 tests pass (engine, cards, connector, API, i18n), typecheck clean, first-load JS 170.7 KB gzipped, MCP smoke with writes passes on a demo copy, `/api/home` 0.09 s on the `my-money` data. UI not yet seen in a browser.
  - Step 1: `web/` (React 19, Vite 8, Tailwind 4, shadcn nova/neutral, TanStack Query, own hash router in `lib/hash.ts` because wouter's broke `#/x?…` links). `assets/` is build output, git-ignored. No eslint (typescript-eslint doesn't run on TypeScript 7): the i18n test fails on literal text in JSX instead.
  - Step 2: `src/modules/` (cards, loans, deposits, investments, insurance) with `ModuleDef` (types, on, load, check, attention) and `/api/m/<module>/…`; `cards()`, plans and deposits moved with no change in numbers. YAML writer: block style, flow-special values quoted; the mapping check refuses a name cut at a comma.
  - Step 3: `features`, `pace` (with a low–high usual band), `usual`, `unusual`, `attention`, `series`, `checkDashboard`, `poolOf`; API `home`, `series`, `dashboard` GET/PUT/DELETE, transactions totals/day totals/running balance/pool filter, `report?usual=6`.
  - Steps 4–7: Home grid with every built-in widget, Transactions, Cards pages and widgets, Accounts, Reports, Plans, Import, Settings (pool settings), edit mode, catalogue, chart form, Pin to Home.
  - Step 5 data: `data/cards.yaml`, `data/cards/statements.yaml`, card terms in `details` (`from_name` marks keys read from wallet names, per key, rather than one `source: misa-name` flag, so an owner-set key is never overwritten), `ownledger cards load <csv>` with `--link`, `--closed`, `--as-debit` for the owner's answers. Codes in MISA names read on every import (8 of the owner's cards).
  - Step 8: connector `dashboard`, `add_widget`, `edit_widget`, `remove_widget`, plus card tools and the pool in `rules` / `add_transaction`.
  - Step 9: `.claude/docs/003-vietnamese-copy.md` for the owner's review.
- Waiting for the owner: review on `localhost:8787`; the `my-money` data changes (the two cut names, the card tracker load and its mismatch answers, KBank's closing day); the Vietnamese list; then step 10 (release 2.0.0) on their go.
- 2026-11-22 Browser check (owner allowed) on `localhost:8787` with the `my-money` data, desktop, vi and en: Home, edit mode and catalogue, Transactions, Accounts, Cards, one card, Reports, Settings. Fixed: 12 untranslated card "Needs you" kinds, "tháng 11" case, chart axis width, "Hôm Qua"/"21-11" day headers, Reports headline number, the default-account label; added a reload when a tab from an old build asks for page files that no longer exist. Phone size not checked (the Chrome window couldn't be resized).
- 2026-11-22 `my-money` (local commits, not pushed): c97ddd8 the two cut names quoted; 6fc3244 card tracker loaded (Woori VV Hype Point = woori-gold, UOB Cashback = uob-one, Lio a debit card, KBank closed 2026-05-31 as an estimate).
- 2026-11-22 Look and layout pass (owner's go per step, browser checks allowed): commits e0ef001 (minimal colour + icons, hero number with pace bar, attention icons, dark-mode tokens), d88f0d4 (spending totals in ink), 39e6fe8 (full width on desktop, docked transaction details, Accounts tabs + collapsible groups). 89 tests pass, typecheck clean, first-load JS 175.3 KB. Checked in Chrome at 1920px light (all routes) and dark (Home, Transactions, Cards, Accounts). Not checked: phone size, Home edit mode at 1536px+, Import with a file, Plans with plans. Branch pushed to origin on the owner's request.
