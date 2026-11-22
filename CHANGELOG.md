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
- **Connector:** `cards` (statements, cashback, fee waiver), `card_statement`, `best_card`, `set_card_details`,
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
