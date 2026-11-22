# OpenWallet as a card-terms source (idea, not planned yet)

Written 2026-11-22. Status: idea. Not in plan 002; decide later whether it becomes its own plan.

## The split

- **OpenWallet** (openwallet.vn, `openwallet-api-v2`) knows each Vietnamese card's **public terms**: cashback rules by intent and MCC, caps, global cap, minimum spend, excluded MCCs, interest-free days, fees, instalment text, a merchant → MCC list.
- **ownledger** knows the owner's **own position**: which cards they hold, cap already used this statement, spend so far against the minimum, limit left, statement and due days, fee-waiver progress.
- "Which card for a 15tr air conditioner at Điện Máy Xanh today?" needs both. The ranking runs **in ownledger**, using terms copied from OpenWallet.

## Constraints

- **Hard rule:** no user data passes through a server the user doesn't own. The Worker never sends the owner's list of cards to OpenWallet. It downloads the whole public catalog (no card ids in the request) and ranks locally. OpenWallet's own "saved cards via OAuth" idea (its plan 001, decision 20) is not the path for this.
- **Licences:** OpenWallet data is proprietary and noncommercial (`DATA_LICENSE.md`); its code is PolyForm Noncommercial. ownledger is MIT, so it must **not bundle the data or copy the engine**. Allowed shape: a source the user switches on (like price sources), fetched at runtime for personal use, stored in their private data repo.

## What ownledger would add

- `details.openwallet_id` on a card account, matched once by name against the catalog (a previewed edit).
- `set_card_details` pre-fills cashback rules, caps, minimum spend, interest-free days and fees from the catalog, as a preview for the owner's go. This replaces most of plan 002's card data checklist.
- `bestCard` takes `merchant` / `mcc` as well as `category` (plan 002 defers MCC to a later plan; OpenWallet already has it).
- Ranking: cashback with the cap left and minimum spend this period → interest-free days from the owner's own statement date → limit left → 0% instalment when available.
- Re-fetch on demand or weekly; show the catalog's `lastChecked` next to each suggestion. If the catalog and the owner's own entries differ, the owner's entries win and the difference is listed.

## What OpenWallet would need (see `openwallet-data/.claude/docs/ownledger-needs.md`)

1. Electronics merchants with their MCC: Điện Máy Xanh, Thế Giới Di Động, Nguyễn Kim, FPT Shop, CellphoneS (none of these are in `merchants.json` as of 2026-11-22).
2. A bulk, versioned public catalog file with a documented rule schema.
3. A single-purchase mode in the engine, taking each card's state (`cap_used`, `spend_so_far`).
4. Structured 0% instalments and time-limited bank × merchant deals.

## Example (made-up card)

OpenWallet's MCC crawls (`openwallet-api-v2/scripts/mcc/raw/`) show Điện Máy Xanh's terminals are mostly **MCC 5732** (electronics stores; 154 of 185), not 5722 (household appliance stores). So a card with a 20% rule on 5722 does **not** pay 20% on a 15tr AC there; a card with a rule on 5732, or a high base rate, wins. A cap of 300k per statement would hold even a 20% rule to 2%, and only if the cap is untouched this statement. ownledger knows the cap used; OpenWallet knows the MCC and the rules.

## Works today, no code

With both connectors in Claude, Claude can read the cards from ownledger's `cards` tool and pass their OpenWallet ids to OpenWallet's `rank_cards_for_spend`. It's the owner's choice through Claude, so the hard rule holds. But it can't see caps used or statement dates, so it's a demo, not the feature.
