# Changelog

## Unreleased

- `cards` shows each card's current statement period: what was spent by category, refunds, and cashback credited
  (`period`), plus `bank` and `product` from the card's details. `all: true` lists every open card, also those
  with nothing owed.
- New optional card detail `product`: the bank's own name for the card.

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
