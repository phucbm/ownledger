# Changelog

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
