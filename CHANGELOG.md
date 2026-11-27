# Changelog

## 2.4.1 (2026-11-27)

- **Card budgets shows every card with a statement day:** the last safe day no longer needs cashback terms (3 days
  before the statement date, or the card's own `post_margin_days`). Cards without terms say so. `cards` gives
  `safe_until` for every card.

## 2.4.0 (2026-11-27)

Card spending room and the last safe day (plan 006). Data format stays 1; every new field is optional.

- **Cashback terms like real cards:** a rule can have its own `cap` (on top of the card's), `merchants` (words looked
  for in the merchant or note, e.g. `[shopee, lazada]`; a merchant rule wins over a category rule), `in_store` (a
  reminder: the bank pays it only in store) and a `label`. The card takes `post_margin_days` (default 3), and
  `payout: points` with `redeem_min` and `expire_months`.
- **Room and the last safe day:** for the open statement, each rule's earnings against its cap and the room left (more
  spending that still earns cashback, trimmed by the card's cap), and the last safe day to spend (statement date −
  `post_margin_days`).
- **Warnings:** the cashback minimum is counted to the safe day (amber, red in the last 2 days). New: room left in the
  last 3 days (`card_spend_room`), points ready to cash in (`card_points_redeem`), points expiring within 30 days
  (`card_points_expiring`). Points cards no longer raise "cashback not received".
- **Connector:** `cards` gives groups, room, safe day and points. `best_card` uses merchant rules and the group's cap
  left, and says "in store only" or "may post on the next statement". `set_card_details` takes the new fields. New
  `card_terms_from_openwallet` (only with OpenWallet on) shows OpenWallet's rules for a card shaped like your terms, to
  check and save with `set_card_details`. It writes nothing itself.
- **Dashboard:** a new home widget **Card budgets** (each card's room per group, the soonest safe day first). The card
  page shows the safe day, a bar per group and the points.

## 2.3.1 (2026-11-23)

- **Fix: editing only the amount of a 0-amount row** booked it as income (the kind came from the sign of 0), so the
  account went up instead of down. The kind now comes from the category's side (income or expense; expense for system
  categories), and a 0 transfer keeps its lines' order.
- **Fix: `statements reconcile` read a statement's period line as a row** ("21/06/2025 - 20/07/2025   100,000", the
  dates and the minimum due on MSB), giving a false "missing" row each month, sometimes matched to another account.
  Lines holding a date range are skipped.

## 2.3.0 (2026-11-23)

- **`batch` saves bank statement amounts too:** op `statement_amount` (`account`, `statement_date`, `amount`; 0
  allowed), the same as `add_statement_amount`, so a whole statement check (the transaction fixes and every month's bank
  figure) is one preview and one commit. For banks whose PDFs print the closing figure without a label.

## 2.2.0 (2026-11-23)

Batch writes, and checking every statement of a card in one run (plan 005). Data format stays 1.

- **Batch writes:** the connector's `batch` tool previews many adds, edits and voids as **one** change: one preview,
  one go from the owner, one commit ("Batch: 28 adds, 4 edits, 4 voids"). Ops run in order on the evolving data, check
  runs once on the result, and if any op fails the whole batch is refused, naming the op. The preview shows every
  transaction (up to 200) and the balance change per account. Each row's trail gets the batch's reason plus the op's
  own. Also `POST /api/batch` + `/api/batch/apply` for the dashboard (no UI yet).
- **`ownledger statements reconcile <card>`** (`--from`/`--to`, `--json`): every filed statement against the ledger.
  Per month the bank's closing figure next to ownledger's (gap, change from the month before, and the part that is
  only timing), then the rows missing on the ledger, ledger rows on no statement, amounts that differ, rows probably on
  another account, and balance adjustments covering a gap. Fee + VAT (or purchase + DCC fee + VAT) booked as one row,
  and purchases refunded in full, are matched and shown apart. `--json` carries a `batch` op hint per item.
  `--save-bank-amounts` saves each month's bank figure in `data/cards/statements.yaml` (preview; `--yes`). Reads the
  PDFs on your computer only, as before.
- **Statement rows by general rules**, no bank-specific code: the PDF's text with its columns kept, a row is a date +
  a description + an amount (with CR/DR, minus, brackets, currency marks; foreign-currency amounts skipped; debit and
  credit columns when the statement has them; a description wrapped onto the lines around the row). What a bank does
  differently is data in `imports/statements/sources.yaml`: `closing_label`, `credit_words`, `skip_words`,
  `amount_column`.
- `ownledger statements check` now shows the rows it read and the text with columns kept.
- Connector instructions: use `batch` for more than ~3 writes.

## 2.1.1 (2026-11-23)

- **Fix: the dashboard failed to load ("Could not load data:" with no reason) once statement PDFs were filed.** The
  Worker read each new commit from the repo's whole tarball, PDFs included, and ran past Cloudflare's CPU limit. It now
  lists the repo's files (one call) and reads only `data/` and `imports/*.mapping.yaml` (one GraphQL call per 100
  files); statement PDFs and raw exports are never downloaded. Same GitHub App permissions.
- **Clear errors:** when the data repo can't be loaded, `/api/*` answers JSON with the reason (502) instead of a bare
  500, and the dashboard shows the HTTP status when an answer isn't JSON (e.g. Cloudflare's own 503 page).

## 2.1.0 (2026-11-23)

Bank statements, optional. Data format stays 1: a repo without statements works as it does now.

- **Convention:** the bank's statement PDFs, unlocked, at `imports/statements/<account-id>/<YYYY-MM>.pdf` (`YYYY-MM` =
  the month of the statement's close date); optional `imports/statements/sources.yaml` (how to find each card's
  statements in email: sender, subject, the name of the password variable and what the password is made of). Passwords
  stay in `.env.statements` on your computer (git-ignored).
- **CLI:** `ownledger statements add <card> <file.pdf>…` unlocks (qpdf compiled to WebAssembly, nothing to install),
  reads the statement period from the PDF's text (or asks for `--month`), skips what's already filed, refuses a
  different file for a filed month, and commits once per run (preview; `--yes`). `ownledger statements list` shows the
  months each card has and the ones missing. `ownledger statements check <card> <YYYY-MM>` prints the statement's text
  next to ownledger's figures and transactions for that period, for your agent to compare. `ownledger check` warns on
  statement files that don't fit (unknown account folder, bad name, still locked).
- **Dashboard:** a filed statement shows a "Statement PDF" link (`GET /api/m/cards/statement-pdf?account=&close=`,
  same sign-in, built from the ledger's own card and close date). Card statements in `/api/m/cards/<id>` and
  `…/statement` carry `pdf: true` when the file exists.
- **Statements are read on your computer only.** The Worker lists the PDFs' paths (their bytes are skipped in the
  tarball) and streams one to your signed-in dashboard; it never parses them. No connector tool reads statements.
- **AGENTS.md:** "Bank statements": collect from Gmail with your own agent, file, check against the ledger.

## 2.0.0 (2026-11-22)

A new dashboard, modules, and credit cards done properly. Data format stays 1: existing data repos work as they are.

- **New dashboard stack.** The dashboard is now a React 19 app (Vite, Tailwind CSS 4, shadcn/ui, Recharts,
  react-grid-layout, TanStack Query, wouter), built when ownledger is published and shipped in `assets/`. Nothing to
  build for users: `ownledger deploy` and `ownledger dev` are unchanged. Same origin only, same CSP, no CDN, no fonts.
  This replaces the plain-JS dashboard of 1.x (and its "no build step" rule). First load stays under 250 KB gzipped
  (checked in CI).
- **Vietnamese by default, English on request** (a VI | EN switch, remembered on the device).
- **Home is a grid of widgets** you can drag, resize, add and remove; the layout is saved per person in the data repo,
  `data/dashboards/<login>.yaml` (one commit per Done). Default: This month (pace against your usual), Needs you,
  What's different, Net worth. Chart widgets are a saved query (`GET /api/series`).
- **Simple first:** the nav, pages and widget catalogue follow what the ledger has (`features` in `/api/me`).
- **Insights:** month pace and month-end estimate, "compared with your usual" (6-month average for a period of the
  same length), "What's different" (categories far from usual, new categories and people, unusually large
  transactions), "Needs you" (dues, cards, deposits, housekeeping). Every number drills into its transactions.
- **"Tiền của tôi" (My money):** everyday accounts (cash, bank, e-wallet) show as one balance by default. A view
  and a per-person setting (`prefs.pool`), never a change to the data; with it on, spending with no account named goes
  to the pool's default account.
- **Modules:** cards, loans and instalments, deposits, investments and insurance each own their account types,
  checks, "Needs you" items and endpoints (`/api/m/<module>/…`); a module that's off adds nothing.
- **Cards module:** statements (periods, payments, paid on time / late / partly, the bank's amount vs computed),
  limits (or "at least" the most ever owed), cashback (rules per category, cap, minimum spend, spend band, when it's
  paid; expected vs received), which card to use, annual fee waivers, 0% instalments counted per statement, card
  lifecycle and cancel plans, net value per card. New optional files `data/cards.yaml` and `data/cards/statements.yaml`,
  new card fields in `details` (see AGENTS.md). Card codes in MISA wallet names (🗓️ 💸 🎉 `1-5tr` `*1234`, category
  emoji) are read on every import; the owner's own values are never overwritten (`from_name`).
- **One `best_card`:** cards with your own cashback terms are ranked locally (nothing sent anywhere); with the
  OpenWallet source on (1.2), cards without terms are looked up there. Each row says its `source` (`yours`,
  `openwallet`, `none`); it takes your `category` and, for OpenWallet, a `merchant` or `kind`.
- **Connector:** `cards` (statements, cashback, fee waiver, this period by category, product), `card_statement`, `best_card`, `set_card_details`,
  `add_statement_amount`, `add_instalment`, `dashboard`, `add_widget`, `edit_widget`, `remove_widget` (writes preview →
  the owner's go → `apply`, as always); `today` adds "needs_you"; `rules` returns the pool.
- **CLI:** `ownledger cards load <tracker.csv>` loads a card tracker into `data/cards.yaml` and the cards' limits
  (preview; `--link`, `--closed`, `--as-debit` for the owner's answers; `--yes` writes).
- **API:** `/api/home`, `/api/series`, `/api/dashboard` (GET, PUT, DELETE), `/api/report?usual=6`,
  `/api/transactions` gains `offset`, `who`/`event`/`tag`/`tx` filters, totals for the filter, day totals and a running
  balance for one account; `/api/accounts` gains `lastActivity`.
- **Fixes:** YAML data files are written in block style and values with `, : { } [ ]` are quoted (a name with a comma
  was cut when the file was read back in flow style); a mapping with a name cut at a comma is now refused with a clear
  message.

## 1.2.1 (2026-11-22)

- `best_card` is sturdier with many cards: at most 4 requests to OpenWallet at a time, one retry after a timeout or
  a 429, and card lookups kept in the Worker's memory for an hour (never written anywhere).

## 1.2.0 (2026-11-22)

- `cards` shows each card's current statement period: what was spent by category, refunds, and cashback credited
  (`period`), plus `bank` and `product` from the card's details. `all: true` lists every open card, also those
  with nothing owed.
- New optional card detail `product`: the bank's own name for the card.
- Optional OpenWallet source (off by default; `ownledger deploy --openwallet`): `best_card` ranks your own cards
  for one purchase (merchant or kind) by cashback, using each card's spend and cashback this statement period, with
  available credit, due date and budget left. Cards are looked up by `details.product` and `details.bank` each time;
  nothing from OpenWallet is stored. README "OpenWallet" lists exactly what is sent.
- Question evals (`evals/questions.md`): the owner's questions, the tool calls that answer them and the facts that
  must come back, plus guards (no invented account, category, date or amount; writes only preview). Run in `pnpm test`.

## 1.1.0 (2026-11-22)

- Transactions record where they came from: `trail` gets one entry per add/edit/void made through the MCP
  connector (`op`, `at`, `via`, `client`, `reason`). Imports keep `src`; rows without a trail are unchanged.
- `add_transaction`, `edit_transaction` and `void_transaction` now require `reason`: one line saying what the
  owner asked for. It is shown in the preview, kept on the trail and added to the commit message
  (`Reason: …` / `Via: mcp (<app>)`).
- The connected app's name is saved at sign-in and recorded on writes. Reconnect an app once to get it.
- `check` refuses a malformed `trail`.

## 1.0.0 (2026-11-22)

First release.

- Data format 1: YAML for accounts, assets, categories, plans, budgets; monthly JSONL ledger; prices CSV.
  Unknown account types and detail keys load with a warning, never an error.
- Engine: check, balances, net worth (with monthly series), reports by category/account/who/event/tag/month
  vs the previous period, search (accents ignored), cards (statement, to pay, due), plans and dues,
  deposits (maturity, interest), budgets, today.
- Write actions with preview → check → commit: add/edit/void transaction, add/edit/close account,
  add plan, add price, add/rename/move category (remaps every line).
- Generic import of xlsx/csv/json through a mapping file: stable keys, transfer pairing, reconcile against
  the source's own figures, rounding and closed-account leftovers booked as `_adjust`, re-import adds only
  new rows. MISA Sổ Thu Chi preset.
- Worker: MCP (Streamable HTTP, stateless), OAuth (DCR, PKCE) with GitHub sign-in and a login allowlist,
  GitHub App access to one repo, atomic commits refused if `main` moved, ledger cached by commit.
- Dashboard: overview, transactions, accounts, plans, reports, import, connected apps.
- CLI: init, check, import, deploy, dev.
