import { isMap, isPair, isScalar, isSeq, parseDocument, Scalar, stringify, visit, type Document } from "yaml";
import { compareTx, ledgerPath, LEDGER_FILE_RE, parseJsonl, PATHS, type FileMap } from "./load.js";
import type { Account, Issue, Price, Transaction } from "./types.js";

/** A set of edits to a data repo. applyChange turns it into new file contents (only the files that change). */
export interface Change {
  addTransactions?: Transaction[];
  /** Replace by id (the new version may have another date, so it can move between month files). */
  replaceTransactions?: Transaction[];
  addAccounts?: Account[];
  /** Shallow-merge fields into existing accounts by id (null deletes a key). */
  updateAccounts?: { id: string; set: Record<string, unknown> }[];
  /** Append to or update a YAML list file by id (plans.yaml, assets.yaml...). */
  upsertList?: { path: string; items: { id: string; [k: string]: unknown }[] }[];
  addPrices?: Price[];
  /** Replace whole files (e.g. categories.yaml after a remap). */
  putFiles?: FileMap;
}

export function txLine(t: Transaction): string {
  return JSON.stringify(t);
}

/** Characters that change meaning in flow-style YAML ({ a: b, c }). Values with them are always double-quoted. */
const FLOW_SPECIAL = /[,:{}\[\]#&*!|>'"%@`]/;

/**
 * Block style everywhere (one key per line) and quoted values where a hand edit into flow style would
 * split them. Without this, "Đầu tư khác (chứng khoán, CCQ ngoài ví)" is cut at the comma when the file
 * is next read in flow style.
 */
export function tidyYaml(doc: Document): void {
  visit(doc, {
    Map: (_, n) => void (n.flow = false),
    Seq: (_, n) => void (n.flow = false),
    Pair: (_, pair) => {
      if (isPair(pair) && isScalar(pair.value) && typeof pair.value.value === "string" && FLOW_SPECIAL.test(pair.value.value)) pair.value.type = Scalar.QUOTE_DOUBLE;
    },
  });
}

/** stringify for data files: block style, quoted where needed. */
export function yamlText(v: unknown): string {
  const doc = parseDocument(stringify(v, { lineWidth: 0 }));
  tidyYaml(doc);
  return doc.toString({ lineWidth: 0 });
}

function upsertYamlList(text: string | undefined, items: { id: string; [k: string]: unknown }[], mergeOnly = false): string {
  const doc = parseDocument(text ?? "[]\n");
  if (!isSeq(doc.contents)) {
    if (doc.contents === null) doc.contents = doc.createNode([]) as never;
    else throw new Error("expected a YAML list");
  }
  const seq = doc.contents as unknown as import("yaml").YAMLSeq;
  for (const item of items) {
    const existing = seq.items.find((n) => isMap(n) && n.get("id") === item.id);
    if (existing && isMap(existing)) {
      for (const [k, v] of Object.entries(item)) {
        if (k === "id") continue;
        if (v === null && mergeOnly) existing.delete(k);
        else existing.set(k, doc.createNode(v));
      }
    } else if (!mergeOnly) {
      seq.items.push(doc.createNode(item) as never);
    } else {
      throw new Error(`no item with id "${item.id}"`);
    }
  }
  tidyYaml(doc);
  return doc.toString({ lineWidth: 0 });
}

export function applyChange(files: FileMap, ch: Change): FileMap {
  const out: FileMap = {};
  const cur = (p: string) => (p in out ? out[p] : files[p]);

  // transactions
  const add = ch.addTransactions ?? [];
  const rep = ch.replaceTransactions ?? [];
  if (add.length || rep.length) {
    const repIds = new Set(rep.map((t) => t.id));
    const touched = new Map<string, Transaction[]>();
    const load = (p: string) => {
      if (!touched.has(p)) touched.set(p, files[p] !== undefined ? parseJsonl(files[p]!, p, []) : []);
      return touched.get(p)!;
    };
    if (repIds.size) {
      for (const p of Object.keys(files)) {
        if (!LEDGER_FILE_RE.test(p)) continue;
        if (![...repIds].some((id) => files[p]!.includes(`"${id}"`))) continue;
        const arr = load(p);
        touched.set(p, arr.filter((t) => !repIds.has(t.id)));
      }
    }
    for (const t of [...rep, ...add]) load(ledgerPath(t.date)).push(t);
    for (const [p, arr] of touched) {
      arr.sort(compareTx);
      out[p] = arr.map(txLine).join("\n") + (arr.length ? "\n" : "");
    }
  }

  if (ch.addAccounts?.length) out[PATHS.accounts] = upsertYamlList(cur(PATHS.accounts), ch.addAccounts as never);
  if (ch.updateAccounts?.length) {
    out[PATHS.accounts] = upsertYamlList(cur(PATHS.accounts), ch.updateAccounts.map((u) => ({ id: u.id, ...u.set })), true);
  }
  for (const u of ch.upsertList ?? []) out[u.path] = upsertYamlList(cur(u.path), u.items);
  if (ch.addPrices?.length) {
    let text = cur(PATHS.prices) ?? "date,asset,price\n";
    if (!text.endsWith("\n")) text += "\n";
    out[PATHS.prices] = text + ch.addPrices.map((p) => `${p.date},${p.asset},${p.price}`).join("\n") + "\n";
  }
  for (const [p, c] of Object.entries(ch.putFiles ?? {})) out[p] = c;
  return out;
}

/** Short human summary of what a change does (for previews and commit messages). */
export function describeChange(ch: Change): string[] {
  const s: string[] = [];
  if (ch.addTransactions?.length) s.push(`add ${ch.addTransactions.length} transaction(s)`);
  if (ch.replaceTransactions?.length) s.push(`update ${ch.replaceTransactions.length} transaction(s)`);
  if (ch.addAccounts?.length) s.push(`add ${ch.addAccounts.length} account(s)`);
  if (ch.updateAccounts?.length) s.push(`update account(s) ${ch.updateAccounts.map((u) => u.id).join(", ")}`);
  for (const u of ch.upsertList ?? []) s.push(`${u.path}: ${u.items.map((i) => i.id).join(", ")}`);
  if (ch.addPrices?.length) s.push(`add ${ch.addPrices.length} price(s)`);
  for (const p of Object.keys(ch.putFiles ?? {})) s.push(`rewrite ${p}`);
  return s;
}

export type { Issue };
