# {{name}}

My personal finance ledger, kept with [ownledger](https://github.com/phucbm/ownledger). Private.

- `data/`: the ledger (YAML, monthly JSONL, prices CSV). Every change is a commit.
- `imports/`: raw exports and the mapping per source app.
- `npx ownledger check`: must pass after every change (CI runs it too).
- `npx ownledger import <file>`: import an export (profile → mapping → preview → `--yes`).
- `npx ownledger deploy`: (re)deploy my Worker; prints the connector URL.
- `npx ownledger dev`: run the Worker locally against this folder.
