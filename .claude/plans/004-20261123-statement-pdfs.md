# 004: Bank statements: collect from Gmail, open in the dashboard, check transactions

Written: 2026-11-23. Status: Done 2026-11-23
Related: plan 002 (cards, statement periods), plan 003 (dashboard)

## Goal

Any ownledger user can keep their cards' statements, as the bank's PDFs, in their data repo, then:
1. **Collect** them from Gmail with their AI agent (Claude Code or similar, with a Gmail connector) and one
   ownledger command that unlocks and files them.
2. **Open** a statement's PDF from the dashboard.
3. **Check** a statement against the ledger: a CLI command on the user's computer gives the statement's text next
   to the ledger's transactions for the same period, so their local agent can say what's missing or different.

Everything is optional. A repo without statements works as it does now. No data format change.

## Decisions (owner, 2026-11-23)

- **Collection: an agent on the user's computer only.** The Worker never connects to Gmail. (In a claude.ai
  chat the assistant can read a Gmail PDF but can't hand the file to ownledger, so collection needs a tool
  that can save files: Claude Code, Codex, etc.)
- **Read on the user's computer only (2026-11-23, after step 1).** The PDFs are committed to the data repo as
  planned, but only the CLI on the user's computer reads their text. The Worker never parses a statement: it only
  streams a PDF's bytes to the signed-in dashboard. (Step 1 measured 13–26 ms CPU per real 2-page statement for text
  extraction, over the free plan's 10 ms; the owner chose machine-only reading over a paid-plan dependency.)
  So section 4 becomes the CLI command `ownledger statements check`; no connector tool reads statements.
- **Stored unlocked.** The command removes the bank's password before saving. Passwords stay on the user's
  computer (`.env.statements`, git-ignored), never in the repo or the Worker.

## Convention

```
imports/statements/<account-id>/<YYYY-MM>.pdf     the bank's statement, unlocked
imports/statements/sources.yaml                   optional: how to find each card's statements in email
```

- `<account-id>`: the card's id in `data/accounts.yaml`.
- `<YYYY-MM>`: the month of the statement's **close** date (the period's last day), as ownledger computes it
  (`statements()` → `close`). One statement closes per card per month. Not the month the bank sent it, which can
  be the next month (Woori: period 01–31/10, sent 05/11 → `2026-10.pdf`).
- `sources.yaml` (written by the agent on the first collection for a bank, like an import mapping), per account:
  `from` (sender address), `subject` (words in the subject), `password` (the name of the variable in
  `.env.statements`, and what the password is made of, e.g. "date of birth ddmmyy"; never the password itself).
  These are the bank's own email facts, not ids of any outside service; nothing depends on them at run time.

## Design

### 1. CLI: `ownledger statements`

- `ownledger statements add <account-id> <file.pdf> [--month YYYY-MM]`
  - Unlocks with the password from `.env.statements` (`PW_<ACCOUNT_ID>`, else `PW_<FIRST WORD>`), using a
    WebAssembly build of qpdf bundled as a dependency, so users don't install anything. (Step 1 confirms the
    package works in Node and decides between it and a pure-JS option; system `qpdf` is not required.)
  - Without `--month`, reads the PDF's text and picks the card's statement whose close date or period dates
    appear in it; if it can't tell, it says so and asks for `--month`. Never guesses silently.
  - Saves to `imports/statements/<id>/<YYYY-MM>.pdf`. Same file already there: does nothing. A different
    file already there: refuses (the user deletes the old one if they mean to replace it).
  - Commits in a git repo with one commit per run (`Statements: <id> 2026-10, 2026-09`), after the user's go
    like every write.
- `ownledger statements list [<account-id>]`: which months each card has, and which are missing between the
  first and last.
- `ownledger check` warns (never errors) on files that don't fit: a folder that isn't an account, a name that
  isn't `YYYY-MM.pdf`, or a PDF that is still locked.
- `ownledger init` / templates: `.env.statements` covered by `.gitignore` (`.env*` already is).

### 2. Agent instructions (`templates/AGENTS.md`, new section "Collect statements from Gmail")

The steps an agent follows, the way it does a first import:
1. For each card (or the one asked for), search Gmail: `sources.yaml` if it has the card, else find the bank's
   statement emails and propose a `sources.yaml` entry for the user's go.
2. Download the attachments to a temporary folder outside the repo.
3. If the password variable is missing, ask the user for the password once and write it to `.env.statements`
   (never echo it, never commit it).
4. `ownledger statements add` each file; show the list (card, month, period) and get the go before the commit.
5. Report missing months.

### 3. Worker and dashboard: open the PDF

- **Which PDFs exist.** `filesAt` already walks the commit's tarball; it also records the **paths** (not
  contents) under `imports/statements/` as `snapshot.paths`. In dev, the CLI's data server lists them.
- **One PDF's bytes.** `DataSource.blob(sha, path)`: GitHub `GET /repos/{repo}/contents/{path}?ref={sha}` with
  `Accept: application/vnd.github.raw`, streamed through; dev: `GET /blob?path=…` from the local folder, limited to
  `imports/statements/`.
- **API.** Statements in `/api/m/cards/<id>` and `…/statement` get `pdf: true` when the file exists. New
  `GET /api/m/cards/statement-pdf?account=<id>&close=<YYYY-MM-DD>`: same sign-in as every `/api` route; account
  must be a card in the ledger and `close` one of its close dates (the path is built from those, never taken from
  the request); 404 if no file; `Content-Type: application/pdf`, `Content-Disposition: inline`,
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- **Dashboard.** `StatementSheet`: a plain "PDF" link ("Sao kê PDF") next to the period line when `pdf`, opening
  in a new tab. No colour, no badge; the statement list stays as it is.

### 4. CLI: check a statement (on the user's computer)

- `ownledger statements check <account-id> <YYYY-MM> [--json]`: prints the period, ownledger's statement figures,
  its transactions on the card in that period, and the PDF's text (unpdf, in Node). The user's local agent compares
  them and reports what's missing, extra or different. Read-only; fixes go through the usual preview → go → apply.
- No bank-specific parsing in ownledger: the text goes to the agent as it is. The Worker and connector don't read
  statements (superseded: the planned `statement_check` connector tool).

## Hard rules

The Worker still talks only to GitHub. Gmail is used only by the user's own agent, on their computer. Passwords
never leave the user's computer. No outside ids in the data. Tests use made-up fixtures (generated tiny PDFs, one
locked with a made-up password), never real statements.

## Steps

1. ✓ Spike: `@neslinesli93/qpdf-wasm` unlocks AES-256/AES-128/RC4 in Node, clean error on a wrong password
   (`@pdfsmaller/pdf-decrypt` failed all four). `unpdf` works in Workers (+577 KiB gzip) but needs 13–26 ms CPU per
   real statement: text reading moved to the CLI (decision above).
2. CLI `statements add` / `list`, check warnings, `sources.yaml` loading, tests.
3. `filesAt` paths, `DataSource.blob` (GitHub + dev), `statement-pdf` route, `pdf` flag, tests (200/401/404/400,
   dev path limit).
4. Dashboard link, types, en/vi strings.
5. `ownledger statements check`, tests.
6. `templates/AGENTS.md` section, README (data layout, the agent flow, the Gmail note), CHANGELOG; release 2.1.0.
7. Try it on the owner's private data repo with `ownledger dev` (statements already filed there by hand), collect
   one more bank end to end with an agent, then deploy.

## Not in this plan

- ownledger connecting to Gmail itself (a "Collect statements" button). Decided against for now.
- Filling the bank's statement amount (`add_statement_amount`) from the PDF automatically.
- Bank account (non-card) statements; the same convention can cover them later.

## Progress

- 2026-11-23 Steps 1–6 done on `plan-004-statement-pdfs`; released as 2.1.0 on the owner's go ("cut new release").
  Statements are read on the user's computer only (decision above); step 5 became `ownledger statements check`
  (built in step 2). Tried on the owner's data repo: `statements list` (17 Woori statements, 2025-11 missing), month
  detection 17/17 from the PDFs' text (Woori writes `yyyy.mm.dd`), `add` preview says "already filed",
  `statements check` lines up 2026-10, and through `ownledger dev` the PDF route returns the filed bytes with the
  right headers (404 for a missing month). The dashboard link was not seen in a browser.
- Open (step 7): collect one more bank end to end with an agent (new folders kbank, msb-mdigi, msb-vs, vib-familylink
  are in the owner's working copy, untracked, made outside this run), deploy `my-money` on 2.1.0, look at the link
  in the dashboard.
- 2026-11-23 Step 7: `my-money` on ownledger 2.1.0 (`npm i`, `check` ok), deployed (`ownledger deploy`, Worker answers;
  the live PDF route answers 401 without sign-in). The owner filed KBank, MSB, VIB, HSBC and Techcombank statements
  themselves, already pushed. Left to the owner: look at the "Sao kê PDF" link in the dashboard; commit the
  `package.json`/`package-lock.json` bump in `my-money` (left uncommitted).

