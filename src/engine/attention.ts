import { holdingsAt } from "./balances.js";
import { isSystemCategory } from "./categories.js";
import { addMonths, monthStart } from "./dates.js";
import { UNCATEGORISED } from "./insights.js";
import type { FileMap } from "./load.js";
import { typeDef } from "./registry.js";
import { budgets } from "./schedules.js";
import type { ISODate, Ledger } from "./types.js";
import { MODULES, type AttentionItem } from "../modules/index.js";

export type { AttentionItem };

const RANK = { red: 0, amber: 1, info: 2 } as const;

/**
 * "Needs you": what's due (from the modules that are on), then housekeeping. Sorted: red, amber, info;
 * within each, by date. Money items come before housekeeping at the same severity.
 */
export function attention(l: Ledger, asOf: ISODate, o: { files?: FileMap; check?: { errors: number; warnings: number } } = {}): AttentionItem[] {
  const files = o.files ?? {};
  const out: AttentionItem[] = [];
  for (const m of MODULES) if (m.attention && m.on(l, asOf, files)) out.push(...m.attention(l, asOf, files));

  for (const b of budgets(l, asOf).filter((x) => x.over)) {
    out.push({ kind: "over_budget", severity: "amber", date: asOf, title: `Over budget: ${b.category} (${b.spent} of ${b.amount})`, amount: b.spent - b.amount, params: { category: b.category, budget: b.amount, spent: b.spent }, link: `#/transactions?category=${encodeURIComponent(b.category)}` });
  }

  // housekeeping
  const from = addMonths(monthStart(asOf), -1);
  let uncat = 0;
  for (const t of l.transactions) {
    if (t.void || t.date < from) continue;
    if (t.date > asOf) break;
    if (t.lines.some((ln) => ln.category && !isSystemCategory(ln.category) && UNCATEGORISED.has(ln.category.split("/")[0]!))) uncat++;
  }
  if (uncat) out.push({ kind: "uncategorised", severity: "info", date: asOf, title: `${uncat} transaction(s) since ${from} have no real category (other)`, count: uncat, params: { from }, link: `#/transactions?category=other&from=${from}`, ask: true });

  const hs = holdingsAt(l, asOf);
  const unmatched = new Set(["import-unmatched"]);
  for (const [p, text] of Object.entries(files)) {
    if (!/^imports\/[^/]+\.mapping\.yaml$/.test(p)) continue;
    const m = /^unmatched_account:\s*["']?([A-Za-z0-9._-]+)/m.exec(text);
    if (m) unmatched.add(m[1]!);
  }
  for (const a of l.accounts) {
    if (a.closed && a.closed <= asOf) continue;
    const v = hs.get(a.id)?.amount ?? 0;
    if (unmatched.has(a.id)) {
      if (v !== 0) out.push({ kind: "unmatched", severity: "info", date: asOf, title: `Transfers without their other side: ${a.name} holds ${v} (should be 0)`, amount: v, account: a.id, name: a.name, link: `#/transactions?account=${encodeURIComponent(a.id)}`, ask: true });
      continue;
    }
    const def = typeDef(a.type);
    if (v < 0 && def && !def.liability && !def.holdings) out.push({ kind: "negative", severity: "info", date: asOf, title: `${a.name} (${a.id}) is negative: ${v}`, amount: v, account: a.id, name: a.name, link: `#/transactions?account=${encodeURIComponent(a.id)}`, ask: true });
  }

  if (o.check?.errors) out.push({ kind: "check_errors", severity: "red", date: asOf, title: `ownledger check: ${o.check.errors} error(s)`, count: o.check.errors, link: "#/settings", ask: true });
  if (o.check?.warnings) out.push({ kind: "check_warnings", severity: "info", date: asOf, title: `ownledger check: ${o.check.warnings} warning(s)`, count: o.check.warnings, link: "#/settings", ask: true });

  const house = (k: string) => ["uncategorised", "unmatched", "negative", "check_warnings", "unpriced"].includes(k);
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || Number(house(a.kind)) - Number(house(b.kind)) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
