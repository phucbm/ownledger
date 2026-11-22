# 002: cards this period, question evals, and an opt-in OpenWallet source

Written: 2026-11-22. Status: Built locally, waiting for the owner's review

## Goal

Answer "which card should I use for groceries / 1tr on Shopee?" from the owner's own cards: which one pays the most
cashback **given what each card has already spent and earned this statement period**, with the owner's own figures
(available credit, due date, budget left) next to it. ownledger's data never depends on OpenWallet.

## Decisions (owner, 2026-11-22)

| # | Decision |
|---|---|
| 1 | ownledger's data never stores OpenWallet data (no OpenWallet ids, no mappings to its slugs). Naming OpenWallet in code and docs is fine. |
| 2 | Cards are matched to OpenWallet at runtime with its `search_cards`, by a neutral fact in the owner's data: `details.product`, the card's real product name (e.g. "MSB Visa Online"), plus `details.bank`. |
| 3 | The Worker may call OpenWallet itself when the owner turns it on (off by default, like price sources). When on, it sends the card product names, the purchase (amount, merchant or kind, date) and, per card, spend so far and cashback booked this period. |
| 4 | The hard rule in `CLAUDE.md` changes from "only GitHub and price sources" to "GitHub, and outside sources the owner turns on (prices, OpenWallet); each sends only what its question needs". README lists exactly what is sent. |
| 5 | The missing pieces on OpenWallet's side are done in the same plan, as their own changes: the engine ranks one purchase by spending kind (no merchant), and `rank_cards_for_spend` takes per-card `spend_so_far` / `cap_used`. |
| 6 | Question evals (idea from openwallet-mcp-v2, own code: no kit code copied). |
| 7 | Work in clones under `/tmp/owcmp`, on local branches; commit locally. No push, deploy or publish without the owner's go. |

## Phases

**Phase 1: ownledger core (neutral).**
- `details.product` documented for `credit_card` in AGENTS.md (and the account types list in the plan/README where listed).
- `cards()` returns `product`, `bank` and `period`: `{from, to, spent, refunds, byCategory: [{category, amount}], cashback}` for the current statement period (day after the last statement date → as-of date). Spent = expense category lines of transactions that take money from the card; refunds and transfers are not spending; cashback = income `cashback` (and children) lines in transactions that touch the card. No statement day → period is the calendar month, said in `periodBasis`.
- MCP `cards`: `all?: boolean` (default unchanged: only cards with something owed).
- Tests in `test/engine.test.ts`.

**Phase 2: question evals.**
- `evals/questions.md`: `## Qn` per question, `- tool: name {json}`, `- expect: substring` (and `- expect_error:`), against `fixtures/demo` with a fixed date.
- `test/evals.test.ts`: parses the file, builds the MCP server in-process on the demo fixture (dev data source, fixed clock), calls the tools, checks the facts. Runs in `pnpm test`.
- 15–20 questions: cards, today, plans due, deposits, net worth, month report, budgets, transactions search, cards this period; guards: unknown account/category is an error, writes only preview and say to wait for the go, `apply` with an unknown preview id fails.

**Phase 3: OpenWallet side (openwallet-data engine + openwallet-mcp-v2).**
- Engine (`openwallet-data/packages/engine/src/purchase.ts`): `PurchaseRequest.intent?` (a spending kind slug) as a third way besides merchant/MCC; tests.
- MCP (`rank_cards_for_spend`, purchase mode): `purchase.intent?`; `cards?: [{id, spend_so_far?, cap_used?}]` passed to the engine (with `card_ids` kept); the "assuming no earlier spend" note only when no state is given; tests and an eval question.
- Check that the kit's metrics/logging never record tool arguments (amounts).

**Phase 4: ownledger OpenWallet source (opt-in).**
- `OPENWALLET_URL` Worker var (unset = off); `ownledger deploy --openwallet[=<url>]` sets it; `ownledger dev` passes it through when given.
- `src/worker/openwallet.ts`: minimal MCP client over Streamable HTTP (initialize, tools/call, timeout, JSON or SSE response), nothing stored.
- Tool `best_card` (only registered when the source is on): `amount`, `merchant?` or `kind?` (free text: matched with `find_merchants` / `list_spending_categories`), `date?`, `category?` (ownledger category, for budget left). Steps: `cards(all)` → `search_cards` per card by product + bank (one match, else candidates and "set details.product") → `rank_cards_for_spend` with each card's `spend_so_far` (period spent) and `cap_used` (period cashback; lags because banks pay cashback after the statement, said in assumptions) → OpenWallet's ranking plus the owner's available credit, due date, budget left.
- CLAUDE.md hard rule, README "Outside sources" section (what is sent, how to turn it off), CHANGELOG, minor version.
- Tests with a fake OpenWallet (no network).

## Progress

- 2026-11-22 Plan written.
- 2026-11-22 Phase 1 done (cards period, product, `all`). Phase 2 done (18 question evals in `pnpm test`).
- 2026-11-22 Phase 3 done on local branches `purchase-intent-and-card-state`: openwallet-data engine `intent` (738f02d),
  openwallet-mcp-v2 `purchase.intent` + `cards` state (a81e824). The kit records no tool arguments (metrics: tool name,
  status, latency, sizes; logs: route and status; only an internal error's stack could carry input).
- 2026-11-22 Phase 4 done: OpenWallet client, `best_card`, `--openwallet` for deploy/dev, docs. Checked end to end
  against openwallet-mcp-v2 running locally on the real catalog (card found by product + bank, cap_remaining from
  the period's cashback, candidates only from the owner's bank).
- Left for the owner: review, push the three branches, deploy openwallet-mcp-v2 (with the engine published), release
  ownledger (minor), then `ownledger deploy --openwallet` and `details.product` on the real cards.

## Later

- Spend so far per OpenWallet spending kind (for caps per category) instead of the card total.
- Same for debit cards and e-wallets with cashback.
