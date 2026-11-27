# 006: Card spending room and the last safe day

Written: 2026-11-27. Status: Draft
Related: plan 002 (cards period, cashback terms), `src/modules/cards/`

## Goal

For each credit card, know how much more to spend this statement period to get the most cashback, and the last day a purchase is sure to land on this statement. Warn in time to act ("1 day left on the groceries card: 400k still to earn").

## Why (owner, 2026-11-27)

- The owner gives each card a spending budget per statement to get the most cashback. Some cards need a minimum spend to pay any cashback. Others don't, but unused room is cashback lost.
- A purchase made 1–2 days before the statement closes may post after it and land on the next statement. With a close on the 5th, the owner stops on the 2nd (3 days before). Counting to the 5th is too late.

## What exists (keep it)

- Cashback terms per card in `details.cashback`: rates per category, `base`, `cap`, `min_spend`, `spend_max` (`src/modules/cards/terms.ts`). Periods follow `statement_day`.
- `cashback()` per period: `spend`, `expected`, `minMet`, `needForMin`, `capLeft` (`statements.ts`).
- Warnings in `src/modules/cards/index.ts`: `cashback_min` (minimum not met, 10 days or less to the **close**), `cashback_cap` (90% or more used).
- `best_card` weighs cap left and the minimum still missing.
- Category budgets (`data/budgets.yaml`) are calendar-month and per category; not touched by this plan.

## Design

### 1. Margin (data, per card)

- New optional `details.cashback.post_margin_days` (integer 0–10). Default **3** when not set (owner, 2026-11-27).
- Old data needs no change. An unknown or invalid value falls back to the default (`check` warns).
- **Last safe day** = next statement close − margin. If today is past it, the room counts for the next period (said as "next period" in the warning, no alert).

### 2. Room (computed, per open period)

Added to the current period's cashback row (and `cards` output):

- `safe_until`: the last safe day, `days_left` to it (0 = today is the last day).
- `room`: the spend still worth making this period, the first that applies:
  1. `spend_max` set → `spend_max − spend`.
  2. `cap` set and the rates are known → the spend that would fill the cap: `capLeft ÷ rate`, using the card's highest rate for the categories it pays on. Marked `room_estimate: true`.
  3. Neither → no room (no target to fill).
  - Never below 0. `needForMin` stays as it is.

### 3. Warning (replaces `cashback_min`'s countdown)

One kind `card_spend_room`, counted to `safe_until`, not to the close:

| case | when | severity |
| --- | --- | --- |
| minimum not met | `days_left` ≤ 7 | red at ≤ 2 days, else amber |
| room left (no minimum, or minimum met) | `days_left` ≤ 3 and `room` > 0 | info |

Title, e.g. `Card Groceries: spend 400,000 more by 2026-12-02 (1 day left) for cashback` / `… to use the cashback room`. Params give the dashboard text (en + vi in `web/src/i18n/`). Keep `cashback_min` as an alias that reads the same so old dashboards don't break, or retire it once nothing refers to it (check the web app).

### 4. Where it shows

- `today` → `needs_you` (it comes from `attention`).
- `cards` tool and dashboard card panel: `room`, `safe_until`, `days_left` for the open period.
- `best_card`: each row also gives `safe_until`; a card past its safe day says so (the purchase counts for the next period: different minimum and room).
- `set_card_details`: accepts `post_margin_days`.

## Phases

1. Engine: terms field + `room` / `safe_until` in `cashback()`; tests with made-up cards (margin default, margin 0, past the safe day, spend_max, cap-derived room, no target, month-end close like statement_day 31).
2. Warning `card_spend_room` + i18n en/vi; retire or alias `cashback_min`.
3. MCP (`cards`, `best_card`, `set_card_details`) + dashboard card panel + README card terms section.
4. Release (minor) on the owner's go, bump my-money, `ownledger deploy`, check the live connector's version.
5. Owner (separate session, data): set `post_margin_days` on any card where 3 is wrong, and `spend_max` / `min_spend` where the budget isn't written down yet.

## Not in this plan

- Per-card budgets separate from cashback terms (`spend_max` is the budget).
- Push notifications outside the connector/dashboard.
