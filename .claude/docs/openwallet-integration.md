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

A card with a 20% rule on MCC 5722 (household appliance stores) capped at 300k per statement: a 15tr AC charged as 5722 earns 300k (2%), and only if the cap is untouched this statement. ownledger knows that; OpenWallet doesn't. Without Điện Máy Xanh's real MCC the whole answer is a guess, which is why need 1 comes first.

## Works today, no code

With both connectors in Claude, Claude can read the cards from ownledger's `cards` tool and pass their OpenWallet ids to OpenWallet's `rank_cards_for_spend`. It's the owner's choice through Claude, so the hard rule holds. But it can't see caps used or statement dates, so it's a demo, not the feature.
