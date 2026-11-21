# ownledger

Open-source (MIT) personal finance ledger used through MCP connectors. One npm package (`ownledger`): engine, Worker (MCP + dashboard + API), CLI. Each user's data lives in their own private GitHub repo, deployed to their own Cloudflare Worker.

Start here: `.claude/plans/001-20261121-ownledger-v1.md` (decisions, design, phases).

## Hard rules
- **No user's data ever passes through a server the user doesn't own.** No shared backend, no telemetry, no third-party calls; the Worker talks only to GitHub's API (and price sources the user turns on).
- **Remote-first:** the product is the connector (Claude, ChatGPT…). Local CLI is for setup, first import and development.
- **Nothing breaks on a new kind of finance:** new account types and assets are data, not schema changes; unknown types fall back to a plain account.
- **Imports lose nothing and re-run safely:** raw kept, stable IDs, reconcile against the source app's balances or refuse.
- **Every write: preview → user's go → check → commit.**
- **Never put the owner's real financial data in this repo** (it is public). Real data lives only in the owner's private data repo. Tests use made-up fixtures.
- Standalone: may borrow ideas from `perxel-mcp-kit` (PolyForm Shield), never copy its code.
- Plans: `.claude/plans/NNN-YYYYMMDD-name.md` (perxel-plans).
