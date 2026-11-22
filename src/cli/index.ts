#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pkgVersion } from "../node/scaffold.js";
import { cmdCheck } from "./check.js";
import { cmdDeploy } from "./deploy.js";
import { cmdDev } from "./dev.js";
import { cmdImport } from "./import.js";
import { cmdInit } from "./init.js";

const pkg = { version: pkgVersion() };

const HELP = `ownledger ${pkg.version}

Usage: ownledger <command> [options]

  init [name]          Create a data repo (asks base currency, category language; private GitHub repo via gh)
  check [dir]          Check the data repo (default: current folder)
  import <file>        Import an export (profile first; preview; --yes writes, checks and commits)
  deploy               Deploy your Worker to your Cloudflare (GitHub App, secrets, KV); prints the connector URL
  dev [dir]            Run your Worker locally against the local data/ (fake sign-in)
  --version            Print the version
`;

const commands: Record<string, (args: string[]) => Promise<number>> = {
  init: cmdInit,
  check: cmdCheck,
  import: cmdImport,
  dev: cmdDev,
  deploy: cmdDeploy,
};

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return 0;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(pkg.version);
    return 0;
  }
  const run = commands[cmd];
  if (!run) {
    console.error(`Unknown command "${cmd}".\n\n${HELP}`);
    return 2;
  }
  return run(rest);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
