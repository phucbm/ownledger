# ownledger

**Your money, your repo, your server.**

ownledger is a personal finance ledger you use through AI chat (Claude, ChatGPT, any client with custom MCP connectors). Your data lives in your own private GitHub repo, and your own Cloudflare Worker serves your connector and dashboard. Nobody else's server ever sees your data.

- **Every kind of personal finance:** cash, bank accounts, e-wallets, credit cards, instalments, BNPL, term deposits, savings goals, gold, funds, stocks, ETFs, crypto, insurance, loans given and taken. A new kind never breaks old data: unknown account types load as plain accounts.
- **Bring your history from any app:** on the first import, your AI reads the app's export and writes a mapping. Later imports are plain code, safe to re-run, and checked against the app's own balances. MISA Sổ Thu Chi ships as a preset.
- **Every write is previewed, checked and committed:** the AI shows you the change, you say go, it's checked, and it becomes one git commit. Anything can be undone.

## Setup (about 10 minutes)

You need Node 22+, a GitHub account with [`gh`](https://cli.github.com) signed in, and a free Cloudflare account.

```sh
npx ownledger init my-money        # your data repo (private on GitHub), base currency, category language
cd my-money && npm install
npx ownledger import <export.xlsx> # optional: your history (profile → mapping → preview → --yes)
npx ownledger deploy               # your Worker on your Cloudflare; prints your connector URL
```

`deploy` walks you through:

1. Signing in to Cloudflare (browser) and creating a KV namespace.
2. Deploying your Worker to `<name>.<you>.workers.dev`.
3. Creating **your own GitHub App** in one click (permission: *contents* of the repos you choose, nothing else; no webhooks). Install it on **your data repo only**.
4. Storing the app's keys as **Worker secrets** (never in the repo, never printed).

Then add the connector:

- **Claude:** Settings → Connectors → Add custom connector → `https://<name>.<you>.workers.dev/mcp` → Connect → Allow → sign in with GitHub.
- **ChatGPT:** custom MCP connectors with OAuth work on plans that offer them (OpenAI's docs differ on which plans allow write tools; Business/Enterprise/Edu do). Add the same URL under Apps & Connectors.

The dashboard is at `https://<name>.<you>.workers.dev/` (same GitHub sign-in). It can be installed as an app on your phone.

### Redeploy on every push (optional)

Copy `node_modules/ownledger/templates/repo/.github/workflows/deploy.yml` into your repo and add two repo secrets: `CLOUDFLARE_API_TOKEN` (a token from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. Dependabot (set up by `init`) proposes ownledger updates; the `check` workflow runs them against your data before you merge. Major versions are never proposed automatically.

## Use it

Ask in chat:

- "Hôm nay có gì?" / "What's due this week?" → `today`, `plans_due`, `cards`
- "Lunch 85k on my Visa" → a **preview** → you say go → one commit
- "How much did I spend on food this year vs last year?" → `report`
- "Net worth over the last 12 months" → `net_worth`
- "Move category cafe under drinks" → preview of the remap of every line → go
- "Quẹt thẻ nào khi đi siêu thị 1 triệu?" → `best_card` (only with the OpenWallet source on, see below)

Tools: `about`, `rules`, `accounts`, `transactions`, `report`, `net_worth`, `cards`, `plans_due`, `deposits`, `today`; previews `add_transaction`, `edit_transaction`, `void_transaction`, `add_account`, `edit_account`, `add_plan`, `add_price`, `add_category`, `edit_category`; and `apply(preview_id)`, which commits a preview and is refused if the data changed since. With the OpenWallet source on: `best_card`.

## What talks to what

| Part | Talks to | Never |
|---|---|---|
| Your Worker | GitHub's API (your repo, with a 1-hour token scoped to that one repo); and only if you turn it on, OpenWallet (below) | any other server, analytics, telemetry |
| Your AI client | your Worker's `/mcp` with a token your Worker issued (1 h, refreshable 30 days, revocable in the dashboard) | your GitHub credentials |
| GitHub sign-in | proves who you are; your Worker reads your login, then revokes that GitHub token at once | kept anywhere |
| The CLI | GitHub (`gh`), Cloudflare (`wrangler`), npm | sending your data anywhere |
| Bank statement PDFs (optional) | read only by the CLI on your computer; your Worker only streams a filed PDF to your signed-in dashboard | parsed by the Worker; their passwords leave your computer |

Only the GitHub logins in `ALLOWED_LOGINS` (yours, set by `deploy`) can sign in. Writes are refused unless the whole ledger still passes `ownledger check`; your repo's CI runs the same check on every push.

## Your data repo

```
data/meta.yaml          format version, base currency, locale
data/accounts.yaml      accounts: id, name, type, details (card statement/due day, deposit rate/term…)
data/assets.yaml        currencies, gold, funds, stocks…
data/categories.yaml    income and spending tree
data/plans.yaml         instalments, loans, premiums
data/prices.csv         date,asset,price
data/ledger/yyyy/mm.jsonl  one transaction per line; lines sum to 0
imports/                raw exports + one mapping per source app
imports/statements/     optional: your banks' statement PDFs, unlocked, <card>/<YYYY-MM>.pdf
AGENTS.md               the rules any AI follows in this repo
```

Plain text, diffable, yours. See [AGENTS.md](AGENTS.md) for the format.

### OpenWallet (optional, off by default)

[OpenWallet](https://openwallet.vn) is a public catalog of bank cards in Vietnam (fees, cashback rules, caps). With it
on, `best_card` answers "which of my cards pays the most for this purchase", counting what each card already spent
and earned this statement period, next to your available credit, due date and budget.

- **Turn on:** `ownledger deploy --openwallet` (or `--openwallet=<url>`). **Off:** `ownledger deploy --no-openwallet`.
- **What is sent, only when you ask `best_card`:** each card's product name and bank (`details.product`, or the account
  name, and `details.bank`), the purchase (amount, merchant or kind, date), and per card the spend and cashback booked
  this statement period. Never account ids, notes, balances, limits or any other transaction.
- **Nothing is stored:** your data never holds OpenWallet ids or slugs; cards are looked up by name each time.
  Set `details.product` to the bank's own name for the card (e.g. `MSB Visa Online`) so it is found.

## CLI

```
ownledger init [name]      create a data repo
ownledger check [dir]      check the data (CI runs it)
ownledger import <file>    import an export (--profile, --preset misa, --yes)
ownledger deploy           deploy or update your Worker (--openwallet / --no-openwallet)
ownledger dev [dir]        run your Worker locally against the local folder (sign-in skipped; --openwallet[=<url>])
ownledger statements add <card> <file.pdf>…   unlock and file bank statement PDFs (preview; --yes files and commits)
ownledger statements list [<card>]            which months each card has, and which are missing
ownledger statements check <card> <YYYY-MM>   the statement's text next to the ledger's figures for that period
```

### Bank statements (optional)

Keep your cards' statement PDFs in your data repo and open them from the dashboard. Collecting them from Gmail is done by
your own AI agent on your computer (Claude Code or similar, with a Gmail connector), following
[AGENTS.md](AGENTS.md#collect-statements-from-gmail); ownledger never connects to your email. `ownledger statements add`
removes the bank's password (kept in `.env.statements`, git-ignored, on your computer only) and files each PDF under the
month of its statement's close date. `ownledger statements check` lets your agent compare a statement with your ledger.

## Development

```sh
pnpm install
pnpm test                  # engine, import, actions, worker helpers (made-up fixtures only)
pnpm build
node dist/cli/index.js dev fixtures/demo   # Worker + dashboard on localhost:8787
node scripts/smoke-mcp.mjs http://localhost:8787 --write
```

Fixtures are invented. Never put real financial data in this repo.

## License

MIT
