# 006: Card spending room, last safe day, and the cashback terms real cards use

Written: 2026-11-27. Status: In progress (phases 1–4 done 2026-11-27; phase 5, the data, in its own session)
Related: plan 002 (cards period, cashback terms, OpenWallet), `src/modules/cards/`

## Where it stands

- Phases 1–3 done 2026-11-27 (not released). Built as designed, except:
  - The minimum warning keeps its kind `cashback_min` (old dashboards keep working); it now counts to the safe day, amber at ≤ 7 days and red at ≤ 2. The room warning is the new kind `card_spend_room`.
  - After the safe day, the period is flagged (`daysLeft` < 0, `best_card` says `nextPeriod`). The room shown stays this period's; next period's room is not computed.
  - "Copy OpenWallet's terms" is a read-only tool `card_terms_from_openwallet` (registered only with OpenWallet on). It returns a `details.cashback` suggestion with empty categories for the owner to map, plus notes (one active group, points). Saving goes through `set_card_details` as usual.
  - Rule caps count per statement (a `per: month` on a rule cap is read as its amount).
- Owner's answers 2026-11-27: MSB's chosen group is **dining**. Woori: how points turn into money is unknown, and OpenWallet doesn't say either (its `rewards` is in `no_data_for`). Ask again in the data step.
- Owner, 2026-11-27: "dash should allow to access budgets quickly" → new home widget `card_budgets` ("Card budgets" / "Ngân sách thẻ"). It shows every card with a statement day and cashback terms, the soonest safe day first, a bar per capped group with the room left, minimum still missing, and points ready. Can be added with add_widget or in edit mode.
- Owner, 2026-11-27: MSB cash-ins take up to 3 months to arrive, so a high points balance in the ledger is expected. Don't flag it.
- 2.4.0 released 2026-11-27 on the owner's go, my-money bumped (`4f3299e`) and deployed; the live connector reports 2.4.0, check 0 errors. Card budgets widget added to the owner's home (my-money `6928644`, owner's go).
- Next: phase 5 (data session, local): save `details.cashback` for sacom-uniq, msb-mdigi (dining), woori-gold. Use card_terms_from_openwallet as a start, and get the owner's go on each.

## Goal

For each credit card, know **how much more to spend in each cashback group this statement period** to get the most cashback, and the **last day a purchase is sure to land on this statement**. Warn in time to act ("Woori Gold: groceries 1.2tr left to earn at 5%, last safe day tomorrow").

## Why (owner, 2026-11-27)

- The owner plans spend per card per statement to get the most cashback. Some cards need a minimum, others don't, but room left unused is cashback lost, so the aim is always to fill it.
- A purchase in the last 1–3 days before the close may post after it. With a close on the 5th the owner stops on the 2nd. Counting to the close is too late.
- Real cards (OpenWallet, below) have a cap **per group** and a global cap, merchant groups (Shopee…), points you can only cash in above a threshold, and groups that only count in store. Today's terms (one rate per category, one global cap) can't hold that.

## The owner's three main cards (OpenWallet, catalog 2026-11-26)

Example data only; real terms go into my-money in the data step (5). Rates are OpenWallet fractions shown as %.

| card (my-money id) | statement / due | cashback | to fill the caps | paid out |
| --- | --- | --- | --- | --- |
| Sacombank Visa Uniq (`sacom-uniq`) | 7 / 3 | 20% groceries + transport, cap 300k; 0.5% the rest, cap 300k; global 600k | 1.5tr groceries+transport | Automatically to the card each statement (minimum 10k). **Not checked by OpenWallet (old data, card discontinued): owner confirms.** |
| MSB mDigi (`msb-mdigi`), checked 2026-11-23 | 20 / 4 | 20% on **one** group the owner picks (dining, travel or digital), change once per statement; cap 300k per statement | 1.5tr in the chosen group | Points (1 = 1đ). Cash in through MSB mBank at **≥ 300k points**, by hand. Points expire 12 months after the statement. Annual fee waived at 60tr/year. |
| Woori VV Hype Point Gold (`woori-gold`), checked 2026-11-25 | 31 / 15 | 10% dining, 5% groceries (both **in store only**), 8% Shopee / Lazada / Tiki / TikTok Shop, 5% travel; cap 300k each per month; global 1.2tr | 3tr dining, 6tr groceries, 3.75tr marketplaces, 6tr travel | Points pool (how to cash in: owner to say). Annual fee waived at 50tr/year. |

Today none of the three has `details.cashback` in my-money, so `cards` shows no cashback for them, and `best_card` only gets OpenWallet's rates at run time.

Note on MSB: the cap (300k per statement) equals the cash-in threshold (300k points). Filling the cap every statement lets you cash in every statement. A short period leaves points stuck below the threshold until the next one.

## What exists (keep it)

- `details.cashback`: `base`, `rules[{categories, rate}]`, global `cap`, `min_spend`, `spend_max`, `paid_on` (`terms.ts`). Periods follow `statement_day`.
- `cashback()` per period: `spend`, `expected`, `minMet`, `needForMin`, `capLeft`, `received`, `payBy`.
- Warnings: `cashback_min` (10 days or less to the **close**), `cashback_cap`, `cashback_missing` (expected but not received by `payBy`), `fee_waiver_risk`.
- `best_card` ranks by earn (cap left, minimum). For cards without the owner's own terms it asks OpenWallet at run time.
- Transactions have `merchant`.

## Design

All new fields are optional, so old data reads as before. Nothing comes from OpenWallet into the data except facts the owner confirms (rates, caps), never OpenWallet ids (hard rule).

### 1. Richer cashback terms (owner's data)

```yaml
details:
  cashback:
    post_margin_days: 3          # default 3
    cap: { amount: 1200000, per: statement }   # global, as today
    payout: points               # auto (default) | points
    redeem_min: 300000           # points: cash in only at or above this
    expire_months: 12            # points: earned points expire after N months
    rules:
      - { categories: [food/dining], rate: 10, cap: 300000, in_store: true }
      - { categories: [food/groceries], rate: 5, cap: 300000, in_store: true }
      - { merchants: [shopee, lazada, tiki, tiktok], rate: 8, cap: 300000 }
```

- **Per-rule `cap`**: each group's earnings stop at its cap; the global cap still applies on top.
- **`merchants`**: a rule matches when the transaction's `merchant` (or the words of its note, case- and accent-insensitive) has one of these words. A merchant rule wins over a category rule. These are the owner's own words, not ids.
- **`in_store`**: shown as a reminder ("pay at the till, not online"). The ledger can't tell in-store from online, so it doesn't change the maths.
- **One chosen group (MSB)**: the owner's terms list only the group picked now. Switching = `set_card_details` (one preview). No new field.
- **`payout: points`**: earned cashback is a **points balance** that grows across periods until cashed in (a cashback transaction). `cashback_missing` is not raised for points cards (today it would fire every MSB period). New in `cards`: `points` (earned − cashed in), `points_expiring` (oldest first, with the date).

### 2. Last safe day and room (computed, open period)

- `safe_until` = next close − `post_margin_days`; `days_left` (0 = today is the last day). After `safe_until`, purchases count for the next period, and the room shown is the next period's.
- **Room per group**: `(rule cap − earned in it) ÷ rate`, then trimmed so all groups together can't earn past the global cap. No rule cap → room only from `spend_max` (as today) or the global cap ÷ highest rate, marked `estimate`. No cap at all → no room.
- `cards` gives per card: `safe_until`, `days_left`, `groups[{label, rate, earned, cap, room, in_store}]`, `room_total`, `need_for_min`.

### 3. Warnings (replace `cashback_min`'s countdown)

| kind | when | severity |
| --- | --- | --- |
| `card_spend_room` minimum | minimum not met, `days_left` ≤ 7 | red at ≤ 2, else amber |
| `card_spend_room` room | a group has room > 0, `days_left` ≤ 3 | info, one per card listing its groups |
| `card_points_redeem` | points ≥ `redeem_min` | info: "cash in N points in the bank's app" |
| `card_points_expiring` | points expire within 30 days | amber |

Text in en + vi (`web/src/i18n/`). Keep `cashback_min` working until the web app no longer uses it.

### 4. Where it shows

- `today` → `needs_you`; dashboard card panel: the safe day and a bar per group.
- `best_card`: picks the rule (merchant first), uses the group's room, says when the card's safe day has passed (the purchase counts for the next period) and repeats `in_store`. For cards without the owner's terms it still asks OpenWallet at run time, with source and date as now.
- `set_card_details`: accepts the new fields. A new helper offers **"copy OpenWallet's terms for this card"**: it shows a preview of `details.cashback` built from OpenWallet's rules (fractions → %, OpenWallet's intents → the owner's categories by the owner's choice, merchants as plain words). The owner checks it and gives the go, and after that the data stands alone.

## Phases

1. Engine: parse the new fields; per-rule cap + global cap; merchant rules; points balance and expiry; `safe_until` and room per group. Tests with made-up cards shaped like the three above (margin default and 0, after the safe day, statement_day 31, per-rule caps hitting the global cap, merchant rule beating category, points below and above `redeem_min`, expiry, old terms unchanged).
2. Warnings + i18n; `cashback_missing` skipped for points cards; `cashback_min` alias.
3. MCP (`cards`, `best_card`, `set_card_details`, copy-from-OpenWallet preview) + dashboard card panel + README card terms.
4. Release (minor) on the owner's go, bump my-money, `ownledger deploy`, check the live version.
5. Data (separate session, local, owner's go on each): set `details.cashback` for sacom-uniq, msb-mdigi (with the chosen group), woori-gold using the copy helper. Confirm Sacom Uniq against the bank's page (OpenWallet's data for it is not checked). Set `post_margin_days` where 3 is wrong. Record the MSB points already held.

## Open questions for the owner (ask before phase 5, not blocking 1–4)

- Woori points: how and when do they turn into money (automatic, threshold, by hand)?
- MSB: which group is chosen now (dining, travel or digital)?

## Not in this plan

- Category budgets (`data/budgets.yaml`) stay calendar-month and per category.
- Push notifications outside the connector and dashboard.
