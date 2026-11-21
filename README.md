# ownledger

**Your money, your repo, your server.**

ownledger is a personal finance ledger you use through AI chat (Claude, ChatGPT, any client with custom MCP connectors). Your data lives in your own private GitHub repo, and your own Cloudflare Worker serves your connector and dashboard. Nobody else's server ever sees your data.

- Every kind of personal finance: cash, bank accounts, e-wallets, credit cards, instalments, term deposits, savings goals, gold, funds, stocks, ETFs, insurance, loans; a new kind never breaks old data.
- Bring your history from any app: on the first import, your AI reads the app's export and writes a mapping; later imports are plain code, re-runnable, and checked against the app's own balances.
- Every write is previewed, checked and committed, so nothing wrong gets in and anything can be undone.

**Status: planning.** See [plan 001](.claude/plans/001-20261121-ownledger-v1.md).

```
npx ownledger init my-money    # your private data repo
npx ownledger deploy           # your Worker on your Cloudflare; prints your connector URL
```

MIT licensed.
