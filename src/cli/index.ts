#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { cmdCheck } from "./check.js";
import { cmdImport } from "./import.js";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };

const HELP = `ownledger ${pkg.version}

Usage: ownledger <command> [options]

  check [dir]          Check the data repo (default: current folder)
  import <file>        Import an export (profile first; preview; --yes writes, checks and commits)
  --version            Print the version
`;

const commands: Record<string, (args: string[]) => Promise<number>> = {
  check: cmdCheck,
  import: cmdImport,
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
