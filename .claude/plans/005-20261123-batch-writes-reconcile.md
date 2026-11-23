# 005: Batch writes, and checking every statement of a card in one run

Written: 2026-11-23. Status: Done 2026-11-23 (2.3.0 deployed to my-money; data fixes left for a separate session)
Related: plan 004 (statement PDFs, `ownledger statements check`), plan 002 (card statements, bank's amount)

## Where it stands

- Done: all infra. 2.2.0 (batch, statements reconcile) and 2.3.0 (batch op `statement_amount`) are released and deployed to my-money. The live connector reports 2.3.0, check has 0 errors.
- Open: data fixes in my-money, in their own session (owner, 2026-11-23: "not the job here, get the infra ready! we will run those in other session"):
  1. KBank: done 2026-11-23. Card cancelled (owner), closes at 0. my-money `65ba766` + the closing batch (pushed): 35 fees, 6 purchases, 2 cashbacks, amounts set to the statement, rows moved to/from kbank, Google One refund (CR on the PDF), final 276,003 payment from cash, MISA adjustment −480,828 voided (owner's go on each). Reconcile: 0 missing, 0 not on statement, every month's diff is timing only. Batches ran locally through the engine's `batch()` (script kept outside the repos).
     Engine bug found: editing only `amount` on a 0-amount row read it as income (`kind` from the sign of 0), so the account got +amount. Fixed in 2.3.1: the kind comes from the category's side; a 0 transfer keeps its lines' order. Test in `test/actions.test.ts`.
  2. MSB (`msb-mdigi`): bank amounts done 2026-11-23 (owner's go). my-money `05173eb`: 18 `statement_amount` ops, 2025-06 … 2026-11, each on the 20th. MSB's page 1 prints six unlabelled figures: opening, debits, fees, interest, credits, closing. The last one is saved, and each month's closing equals the next month's opening. 2026-05 closed at −1 (overpaid). `scripts/batch.mjs` now creates a missing folder (`8a064aa`).
     Gaps fixed 2026-11-23, my-money `9cd97a5` (16 adds, 9 edits, 2 voids; owner's go on each choice). Missing purchases, 5 refunds of 300,000 (cashback), the 2026-05 annual fee of 399,000 and amount typos were fixed. "Di nhau" 120,000 moved from cash to the card. The loan for CGV was 25,000 → 250,000. The 2026-01-22 loan to Hưng of 60,000 was voided (owner: void). A 5,508 charge with no row of its own was added as bank-fees on 2026-01-20: the statement's closing is 5,508 more than its rows, probably late interest. The old `_adjust` (−326,945) was voided. Reconcile now: every month is timing only, except 1 đồng of bank rounding in 2026-05 and 2026-10/11 (left as is).
     Parser bug found (ownledger): on MSB, the period line "21/06/2025 - 20/07/2025   100,000" was read as a row (the date + the minimum due), giving a false "missing" row with description `-` on the 21st of each month, sometimes matched to a row on another account. Fixed in 2.3.1: lines holding a date range are skipped. On my-money's real statements: MSB 12 false missing → 0, 5 false other-account → 0; woori-gold, kbank, hsbc-travelone unchanged.
  3. Woori: one account, two cards over time (Platinum ****1926, then downgraded to Gold ****1435; owner, 2026-11-23). The 2026-01 file stays. Reconcile lists the 2026-01-06 payment of 1,244,648 from cash as on no statement: check the old card's statement before changing anything. The Platinum statement for that period is not filed (no 2025-11 file; the 2026-01 file is the Gold card's, no rows). Skipped for now (owner, 2026-11-23: "Skip Woori for now").
- 2.3.1 (both fixes) released 2026-11-23 on the owner's go, my-money bumped (`0a91871`, pushed) and deployed; the live connector reports 2.3.1, check 0 errors.
- Next step: Woori (3), once the old Platinum ****1926 statement for 2025-11/2026-01 is filed in my-money. my-money pushed 2026-11-23. Data fixes run locally in my-money with `node scripts/batch.mjs temp/<ops>.json` (preview; `--yes` writes; then check and commit), never through the connector (owner, 2026-11-23: "i dont expect this to run remotely anywhere!").

## Goal

Make checking a card's statements and fixing what they show a short job.

1. **Batch writes:** many adds, edits and voids in **one** preview, one go from the owner, one commit.
2. **Check every statement in one run:** one CLI command compares all of a card's filed statements with the ledger. It shows each statement's closing balance next to the ledger's, the statement rows the ledger doesn't have and the ledger rows no statement has. A local agent can turn that straight into one batch.

## Why (owner's Woori check, 2026-11-23)

17 Woori statements against the ledger. It took a long session:
- The agent didn't know about `ownledger statements check`. It wrote its own scripts to parse the PDFs, match rows and compare balances at each period's end. The existing command does only one month, gives the PDF text without a layout, and matches nothing.
- The balance comparison found the problems: 16 missing fees, 7 missing purchases and cashbacks, 2 missing payments, 2 typos, a purchase on the wrong account, and 4 balance adjustments covering the gaps. Row matching alone was noisy: fee pairs like 9,091 + 909 VAT were booked as one 10,000 row, and purchases fully refunded as cashback looked like a gap.
- The fix took **36 previews and 36 applies** (72 tool calls). Each preview is tied to the repo's head commit (`applyPending` refuses when `head !== baseSha`), so previews can't be made in advance and applied in a row.

## Decisions

- **Reading statements stays on the user's computer** (plan 004's decision holds: 13–26 ms CPU per PDF, over the free plan's 10 ms). So the reconcile step is a CLI command, not a connector tool. The connector gets batch writes. A local agent (Claude Code) runs the check and applies the fixes through the connector or the CLI.
  - *Differs from what was suggested in chat (a `reconcile_statement` connector tool); this plan follows plan 004's CPU decision.* A later plan could let the CLI save the parsed rows as text in the repo for the connector to read, if the owner wants the check from claude.ai.
- **No bank-specific code in the core.** Rows are pulled out with general rules (a date, a description, an amount, the debit/credit hints a statement prints). Each bank's quirks, such as Woori's "Payment(", "cashback" and "(VAT)" rows, live in `imports/statements/sources.yaml` next to the bank's email facts, as data. This follows "nothing breaks on a new kind of finance".
- **The bank's closing balance becomes data.** Every statement's "Payable amount" is saved with the existing `add_statement_amount`, so `cards` / `card_statement` show `bankDiff` for every month from then on, without the PDFs.

## Design

### 1. Batch writes (engine + Worker + API)

- Engine: `A.batch(files, ops, meta)`: applies the ops one after another on the evolving `FileMap`, each op through the existing `addTransaction` / `editTransaction` / `voidTransaction` (and later the other actions). It merges into one `Planned` with one `plan()` check on the final files, a combined summary, and one commit message ("Batch: 28 adds, 4 edits, 4 voids" plus the reason). If any op fails, the whole batch is refused and the reply says which op failed and why.
- MCP: a `batch` preview tool. Input: `ops: [{op: "add" | "edit" | "void", ...same fields as the single tools}]` (max ~200) and one `reason`. The reply works like `preview` but shows every transaction (no 20 cap for batches; cap the shown list at 200) plus the balance change per account the batch touches. Then `apply(preview_id)` as now: one commit.
- API route `POST /api/batch` for the dashboard later (not in the UI in this plan).
- Each transaction's trail gets the batch's reason, and the op's own `reason` if one is given.

### 2. `ownledger statements reconcile <account-id> [--from YYYY-MM] [--to YYYY-MM] [--json]`

For every filed statement of the card, in order:
- **Header:** the period and the bank's closing figure. A general rule finds the "payable/closing/amount due" figure, and `sources.yaml` can name the label (`closing_label: "Payable amount"`).
- **Rows:** pdftotext-style layout extraction (keep columns; `unpdf` with positions, or rows rebuilt from x/y). A row is a date + description + amount. Credit rows are recognised from `sources.yaml` `credit_words` (default: payment, refund, cashback, hoàn, thanh toán).
- **Match:** the same signed amount within ±7 days, nearest date first. Then a second pass joins rows that add up: a fee plus its VAT on the same day matches one ledger row, and a purchase plus a cashback that cancel out is shown as "net 0".
- **Balance:** the ledger's balance on the card at the period's close against the bank's figure, per month, with the change from the month before. Gaps that fix themselves the next month (timing) are labelled as such.
- **Output:** a table per month plus one summary: missing on the ledger, on the ledger but not on any statement (inside the statements' dates only), amount differences (same date, close amount, e.g. digits swapped), the same amount found on another account (probably booked on the wrong account), and balance adjustments (`_adjust`) that cover a gap. `--json` gives the same as data, shaped so an agent can turn it into one `batch` call. It never writes.
- **Bank's amounts:** `--save-bank-amounts` previews `add_statement_amount` for every month it read, after the usual go.

### 3. Agent guidance

- The data repo's `AGENTS.md` (and the README's statements section): "To check a card's statements, run `ownledger statements reconcile <card>`. Propose fixes as one batch. Never add balance adjustments to cover a gap."
- The connector's instructions: mention `batch` for more than ~3 writes.

## Hard rules

Statement text is read only on the user's computer; the Worker still talks only to GitHub. No outside ids. Every write: preview, go, check, commit (a batch is one preview and one commit). Tests use made-up statements (generated PDFs whose layout is like a real bank's), never the owner's.

## Steps

1. Engine `batch` + tests (mixed ops, an op failing in the middle refuses everything, check runs once on the final files, trail and message).
2. MCP `batch` tool + `/api/batch` + tests; smoke-mcp covers a 3-op batch.
3. Layout-keeping text extraction in the CLI + row parser + `sources.yaml` fields (`closing_label`, `credit_words`) + tests with generated PDFs.
4. `statements reconcile`: matching, joining pairs, balance per month, output, `--json`, `--save-bank-amounts` + tests.
5. AGENTS.md / README / connector instructions; CHANGELOG; release 2.2.0 (GitHub release → publish Action), bump and deploy `my-money`.
6. Try on the owner's repo: `statements reconcile woori-gold` should give no gaps except the three known ones (2025-05 timing, 2026-04 timing, the 29,821 Woori credit). Run it on one more bank (MSB or KBank) and fix what it finds with one batch.

## Not in this plan

- Reading statements in the Worker or from claude.ai (see Decisions).
- Batch for account, plan and card-term writes (the engine is ready for it; add the ops when needed).
- Fixing things automatically: reconcile only reports; the owner still says go.

## Progress (run 2026-11-23)

- Steps 1–4 done: engine `batch()` (ops on the evolving files, check once, one message, balance change per account), MCP `batch` tool + `POST /api/batch` + `/api/batch/apply`, smoke-mcp batch (3 adds, then one batch voiding them), layout-keeping extraction (`src/node/statement-rows.ts`), `statements reconcile` (`src/node/reconcile.ts`), tests with generated bank-like PDFs.
- Step 5: AGENTS.md, README, CHANGELOG, connector instructions; PR #6, release v2.2.0 (npm), my-money bumped and deployed (`about` says 2.2.0).
- Step 6 on the owner's repo (read only; nothing committed there):
  - `woori-gold` (needs `amount_column: 1` in `sources.yaml`: the transaction amount comes first, the last column is points): 116 rows matched, 17 fee+VAT pairs joined. The only gaps are the three known ones: 2025-05 (+10,000, timing), 2026-04 (+500,000, timing), the 29,821 credit (2026-09/10). One ledger row on no statement: the 2026-01-06 payment of 1,244,648 from cash. The 2026-01 PDF filed for woori-gold is for another card (Visa Gold ****1435, not the Platinum ****1926 of the other months) and has no rows.
  - `kbank`: the closing figures read, gaps are real (mostly DCC VAT and FX markup VAT rows not on the ledger). Fixes prepared for the owner as one batch (needs categories and the owner's go).
  - `msb-mdigi`: rows read (CR before the amount, descriptions wrapped onto the lines around the row); MSB prints its closing figures without text labels, so no closing figure is found. Use `add_statement_amount` or a later layout field.

- Follow-up the same day: 2.3.0 adds the `batch` op `statement_amount`, for MSB's unlabelled closing figures (one batch, not 18 previews). Deployed to my-money. The data fixes (KBank rows, MSB figures) are left for a separate session, as the owner asked.

## Decisions made during the run

- **Timing is computed, not guessed:** per month, the part of the gap from matched rows that the bank and the ledger put on different sides of a close date ("of which timing"). A month is "timing only" when that explains the whole gap.
- **Default credit words leave out plain "thanh toán":** on Vietnamese statements "Thanh toán …" often marks a purchase. Defaults: payment, refund, cashback, reversal, hoàn tiền, hoàn trả, thanh toán thẻ, thanh toán dư nợ, trả nợ.
- **"tổng dư nợ" is not a default closing label:** on MSB it is the total debit of the period.
- Joins take 2 or 3 same-day rows (KBank: purchase + DCC fee + DCC VAT booked as one row).
- `amount_column` counts only non-zero amounts in the base currency (zero discount columns and foreign original amounts skipped). Added to the `sources.yaml` layout fields.
- `withBankAmounts()` (cards module) is shared by `add_statement_amount` and `--save-bank-amounts`.
