# Changelog

## 2.0.0 (unreleased)

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
