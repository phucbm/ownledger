// Prints the gzipped size of the first-load JS (index.html's entry module plus its static imports)
// and fails above the budget. Lazy page chunks and CSS are not counted.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 250;
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const html = readFileSync(join(assets, "index.html"), "utf8");
const seen = new Set();

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(join(assets, file), "utf8");
  // Static imports only: `import ... from "./x.js"` and `import "./x.js"`, minified or not. Dynamic import() is skipped.
  for (const m of src.matchAll(/(?:^|[;}\s,])(?:import|export)\s*(?:[^"'();]*?\sfrom\s*)?["'](\.\/[^"']+\.js)["']/g)) visit(m[1].slice(2));
}

const entries = [...html.matchAll(/<(?:script[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="\/([^"]+\.js)"/g)].map((m) => m[1]);
if (!entries.length) throw new Error("no entry script found in assets/index.html");
for (const e of entries) visit(e);

let total = 0;
for (const f of [...seen].sort()) {
  const gz = gzipSync(readFileSync(join(assets, f))).length;
  total += gz;
  console.log(`  ${(gz / 1024).toFixed(1).padStart(7)} KB  ${f}`);
}
const kb = total / 1024;
console.log(`first-load JS: ${kb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`);
if (kb > BUDGET_KB) {
  console.error(`over the budget by ${(kb - BUDGET_KB).toFixed(1)} KB`);
  process.exit(1);
}
