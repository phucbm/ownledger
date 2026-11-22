import { flattenCategories, isSystemCategory, SYSTEM_CATEGORIES } from "./categories.js";
import { isDate } from "./dates.js";
import { ledgerPath, loadLedger, PATHS, type FileMap } from "./load.js";
import { typeDef } from "./registry.js";
import { FORMAT, type Issue, type Ledger } from "./types.js";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EVERY = new Set(["month", "quarter", "year"]);

export interface CheckResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  ledger: Ledger;
}

/** Load + check. `ok` is false when there is any error. Warnings never fail. */
export function checkFiles(files: FileMap): CheckResult {
  const { ledger, issues } = loadLedger(files);
  const all = [...issues, ...checkLedger(ledger)];
  const errors = all.filter((i) => i.level === "error");
  const warnings = all.filter((i) => i.level === "warning");
  return { ok: errors.length === 0, errors, warnings, ledger };
}

export function checkLedger(l: Ledger): Issue[] {
  const out: Issue[] = [];
  const err = (file: string, where: string | undefined, message: string) => out.push({ level: "error", file, where, message });
  const warn = (file: string, where: string | undefined, message: string) => out.push({ level: "warning", file, where, message });

  // meta
  const fmt = l.meta.format;
  if (typeof fmt !== "number" || fmt < 1) err(PATHS.meta, "format", "missing or invalid format version");
  else if (fmt > FORMAT) err(PATHS.meta, "format", `data is format ${fmt}; this ownledger reads format ${FORMAT}. Update ownledger.`);
  else if (fmt < FORMAT) err(PATHS.meta, "format", `data is format ${fmt}; this ownledger needs format ${FORMAT}. Run \`npx ownledger migrate\`.`);
  const base = l.meta.base;
  if (typeof base !== "string" || !base) err(PATHS.meta, "base", "missing base currency");

  // assets
  const assets = new Set<string>([String(base)]);
  const seenAsset = new Set<string>();
  l.assets.forEach((a, i) => {
    const w = `#${i + 1}`;
    if (!a || typeof a.id !== "string" || !a.id) return err(PATHS.assets, w, "asset without id");
    if (seenAsset.has(a.id)) err(PATHS.assets, a.id, "duplicate asset id");
    seenAsset.add(a.id);
    assets.add(a.id);
  });

  // accounts
  const accounts = new Map<string, (typeof l.accounts)[number]>();
  l.accounts.forEach((a, i) => {
    const w = a && typeof a.id === "string" ? a.id : `#${i + 1}`;
    if (!a || typeof a !== "object") return err(PATHS.accounts, w, "not an object");
    if (typeof a.id !== "string" || !ID_RE.test(a.id)) return err(PATHS.accounts, w, "id must be letters, digits, . _ - (no spaces)");
    if (accounts.has(a.id)) err(PATHS.accounts, w, "duplicate account id");
    accounts.set(a.id, a);
    if (typeof a.name !== "string" || !a.name) err(PATHS.accounts, w, "missing name");
    if (typeof a.type !== "string" || !a.type) err(PATHS.accounts, w, "missing type");
    else if (!typeDef(a.type)) warn(PATHS.accounts, w, `unknown type "${a.type}": treated as a plain account (balance only)`);
    if (a.asset !== undefined && !assets.has(String(a.asset))) err(PATHS.accounts, w, `unknown asset "${a.asset}"`);
    if (a.opened !== undefined && a.opened !== null && !isDate(a.opened)) err(PATHS.accounts, w, `opened is not a date (yyyy-mm-dd)`);
    if (a.closed !== undefined && a.closed !== null && !isDate(a.closed)) err(PATHS.accounts, w, `closed is not a date (yyyy-mm-dd)`);
    if (isDate(a.opened) && isDate(a.closed) && a.closed < a.opened) err(PATHS.accounts, w, "closed before opened");
    const def = typeDef(String(a.type));
    if (a.details !== undefined && (typeof a.details !== "object" || a.details === null || Array.isArray(a.details))) {
      err(PATHS.accounts, w, "details must be a map");
    } else if (def?.details && a.details) {
      for (const [k, spec] of Object.entries(def.details)) {
        const v = (a.details as Record<string, unknown>)[k];
        if (v === undefined || v === null) continue;
        const ok =
          spec.kind === "int" ? Number.isInteger(v)
          : spec.kind === "number" ? typeof v === "number" && Number.isFinite(v)
          : spec.kind === "day" ? Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31
          : spec.kind === "date" ? isDate(v)
          : spec.kind === "boolean" ? typeof v === "boolean"
          : typeof v === "string";
        if (!ok) warn(PATHS.accounts, w, `details.${k} should be ${spec.kind}; ignored by computations`);
      }
    }
  });

  // categories
  const { map: cats, dupes } = flattenCategories(l.categories);
  for (const d of dupes) err(PATHS.categories, d, "duplicate category path");
  for (const p of cats.keys()) {
    const leaf = p.split("/").pop()!;
    if (!ID_RE.test(leaf)) err(PATHS.categories, p, "category id must be letters, digits, . _ - (no spaces or /)");
    if (isSystemCategory(p)) err(PATHS.categories, p, "ids starting with _ are reserved for system categories");
  }
  const catOk = (c: string) => cats.has(c) || Object.prototype.hasOwnProperty.call(SYSTEM_CATEGORIES, c);

  // plans
  const plans = new Set<string>();
  l.plans.forEach((p, i) => {
    const w = p && typeof p.id === "string" ? p.id : `#${i + 1}`;
    if (!p || typeof p.id !== "string" || !ID_RE.test(p.id)) return err(PATHS.plans, w, "missing or bad id");
    if (plans.has(p.id)) err(PATHS.plans, w, "duplicate plan id");
    plans.add(p.id);
    if (!accounts.has(p.account)) err(PATHS.plans, w, `unknown account "${p.account}"`);
    if (!EVERY.has(p.every)) err(PATHS.plans, w, `every must be month, quarter or year`);
    if (!isDate(p.start)) err(PATHS.plans, w, "start is not a date");
    if (p.end != null && !isDate(p.end)) err(PATHS.plans, w, "end is not a date");
    if (p.count !== undefined && (!Number.isInteger(p.count) || p.count < 1)) err(PATHS.plans, w, "count must be a positive integer");
    for (const k of ["amount", "principal", "fee"] as const) {
      if (p[k] !== undefined && !Number.isInteger(p[k])) err(PATHS.plans, w, `${k} must be an integer amount`);
    }
    if (p.amount === undefined && !(p.principal !== undefined && p.count)) err(PATHS.plans, w, "needs amount, or principal and count");
  });

  // budgets
  l.budgets.forEach((b, i) => {
    if (!b || !catOk(String(b.category))) err(PATHS.budgets, `#${i + 1}`, `unknown category "${b?.category}"`);
    if (!b || !Number.isInteger(b.amount)) err(PATHS.budgets, `#${i + 1}`, "amount must be an integer");
  });

  // prices
  l.prices.forEach((p, i) => {
    const w = `row ${i + 1}`;
    if (!isDate(p.date)) err(PATHS.prices, w, `bad date "${p.date}"`);
    if (!assets.has(p.asset)) err(PATHS.prices, w, `unknown asset "${p.asset}"`);
    if (p.asset === base) warn(PATHS.prices, w, "price for the base currency is ignored");
  });

  // transactions
  const ids = new Set<string>();
  const srcKeys = new Map<string, string>();
  for (const t of l.transactions) {
    const file = (typeof t.id === "string" && l.txFile.get(t.id)) || PATHS.ledgerDir;
    const w = typeof t.id === "string" ? t.id : "(no id)";
    if (typeof t.id !== "string" || !t.id) {
      err(file, w, "transaction without id");
      continue;
    }
    if (ids.has(t.id)) err(file, w, "duplicate transaction id");
    ids.add(t.id);
    if (!isDate(t.date)) {
      err(file, w, `bad date "${t.date}"`);
      continue;
    }
    if (ledgerPath(t.date) !== file) err(file, w, `dated ${t.date} but stored in ${file} (belongs in ${ledgerPath(t.date)})`);
    if (t.time != null && !/^\d{2}:\d{2}(:\d{2})?$/.test(String(t.time))) err(file, w, `bad time "${t.time}" (HH:MM)`);
    if (t.tags !== undefined && (!Array.isArray(t.tags) || t.tags.some((x) => typeof x !== "string"))) err(file, w, "tags must be a list of text");
    if (t.plan != null && !plans.has(String(t.plan))) err(file, w, `unknown plan "${t.plan}"`);
    if (t.src) {
      const k = `${t.src.import}:${t.src.key}`;
      if (srcKeys.has(k)) err(file, w, `same import key as ${srcKeys.get(k)}`);
      srcKeys.set(k, t.id);
    }
    if (t.trail !== undefined) {
      if (!Array.isArray(t.trail)) err(file, w, "trail must be a list");
      else
        t.trail.forEach((e, j) => {
          if (!e || typeof e !== "object" || typeof e.op !== "string" || typeof e.at !== "string" || typeof e.via !== "string") err(file, `${w} trail ${j + 1}`, "trail entry needs op, at and via");
        });
    }
    if (!Array.isArray(t.lines) || t.lines.length < 2) {
      err(file, w, "needs at least two lines");
      continue;
    }
    let sum = 0;
    t.lines.forEach((ln, j) => {
      const lw = `${w} line ${j + 1}`;
      if (!ln || typeof ln !== "object") return err(file, lw, "not an object");
      const hasA = ln.account !== undefined && ln.account !== null;
      const hasC = ln.category !== undefined && ln.category !== null;
      if (hasA === hasC) return err(file, lw, "a line has either account or category (exactly one)");
      if (!Number.isInteger(ln.amount)) return err(file, lw, `amount must be a whole number in ${base} (got ${ln.amount})`);
      sum += ln.amount;
      if (hasC) {
        if (!catOk(String(ln.category))) err(file, lw, `unknown category "${ln.category}"`);
        if (ln.qty !== undefined || ln.asset !== undefined) err(file, lw, "category lines have no asset or qty");
        return;
      }
      const acc = accounts.get(String(ln.account));
      if (!acc) return err(file, lw, `unknown account "${ln.account}"`);
      const accAsset = acc.asset ?? base;
      const lineAsset = ln.asset ?? accAsset;
      if (lineAsset !== accAsset) err(file, lw, `asset ${lineAsset} but account ${acc.id} holds ${accAsset}`);
      if (accAsset !== base) {
        if (typeof ln.qty !== "number" || !Number.isFinite(ln.qty)) err(file, lw, `account ${acc.id} holds ${accAsset}: line needs qty`);
      } else if (ln.qty !== undefined) {
        err(file, lw, "qty only on lines of non-base assets");
      }
      if (isDate(acc.opened) && t.date < acc.opened) warn(file, lw, `before account ${acc.id} opened (${acc.opened})`);
      if (isDate(acc.closed) && t.date > acc.closed && !t.void) warn(file, lw, `after account ${acc.id} closed (${acc.closed})`);
    });
    if (sum !== 0) err(file, w, `lines don't balance: sum is ${sum}, must be 0`);
  }

  return out;
}
