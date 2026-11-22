import { fold } from "../../engine/reports.js";
import type { Account, Ledger } from "../../engine/types.js";
import { parseCardName, type CardRecord } from "./terms.js";

/** The owner's answers to the mismatch list, applied on the next preview. */
export interface TrackerDecisions {
  /** card id (tracker) → account id: the same card under another name. */
  link?: Record<string, string>;
  /** account id → closing date (yyyy-mm-dd). */
  closed?: Record<string, string>;
  /** card id → account id: a debit card recorded as a credit card in the ledger; the account becomes a bank account (in the pool), its card terms move to the card record. */
  asDebit?: Record<string, string>;
  /** account id → the full names the import source uses (from the mapping), to read card codes from. */
  names?: Record<string, string[]>;
}

/**
 * One-time load of a card tracker exported as CSV (a Notion "Bank cards" table: Type, Bank, Card status, Name,
 * Credit balance, Số thẻ, Note, Anual fee, Close account, Benefits, Card brand, Apple Pay, Physic card,
 * Issue date, Activate date, Detail link). Builds data/cards.yaml records, the credit card accounts' limits,
 * and a list of what doesn't match the ledger, for the owner to confirm. Writes nothing itself.
 */
export interface TrackerLoad {
  records: CardRecord[];
  /** Account changes the tracker implies (limits; closing cancelled cards). */
  accountUpdates: { id: string; set: Record<string, unknown>; why: string }[];
  /** For the owner to confirm, one by one. */
  mismatches: string[];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const money = (s: string | undefined): number | undefined => {
  const d = (s ?? "").replace(/[^\d]/g, "");
  return d ? Number(d) : undefined;
};
const dmy = (s: string | undefined): string | undefined => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? "").trim());
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : undefined;
};
const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "huỷ t12/26", "huỷ thẻ 2/27", "huỷ 05/26": the last month named after a cancel word, as yyyy-mm. */
export function cancelMonth(note: string): string | undefined {
  const re = /hu[ỷyỶ]\s*(?:th[ẻe]\s*)?(?:v[ậa]t\s*l[ýy]\s*)?(?:ng[àa]y\s*\d{1,2}\/)?t?(\d{1,2})\/(\d{2,4})/giu;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(note); m; m = re.exec(note)) last = m;
  if (!last) return undefined;
  const y = last[2]!.length === 2 ? `20${last[2]}` : last[2]!;
  return `${y}-${last[1]!.padStart(2, "0")}`;
}

/** "đã huỷ thẻ ngày 14/1/26" → 2026-01-14; "đã huỷ 05/26" → 2026-05 (day unknown). */
export function cancelledOn(note: string): string | undefined {
  if (!/(đã|da)\s*hu[ỷy]/iu.test(note)) return undefined;
  const d = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(note);
  if (d) return `${d[3]!.length === 2 ? `20${d[3]}` : d[3]}-${d[2]!.padStart(2, "0")}-${d[1]!.padStart(2, "0")}`;
  return cancelMonth(note) ?? "unknown";
}

function last4Of(a: Account): string | undefined {
  const d = a.details?.number_last4;
  if (typeof d === "string") return d;
  return /\*(\d{4})(?!\d)/.exec(a.name)?.[1];
}

export function loadTracker(csv: string, l: Ledger, dec: TrackerDecisions = {}): TrackerLoad {
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  const head = rows.shift()?.map((h) => fold(h.trim())) ?? [];
  const col = (r: string[], ...names: string[]) => {
    for (const n of names) {
      const i = head.indexOf(fold(n));
      if (i >= 0) return (r[i] ?? "").trim();
    }
    return "";
  };
  const out: TrackerLoad = { records: [], accountUpdates: [], mismatches: [] };
  const cards = l.accounts.filter((a) => a.type === "credit_card");
  const matched = new Set<string>();
  const ids = new Set<string>();

  for (const r of rows) {
    if (!col(r, "Type") && !col(r, "Name")) continue; // a totals row
    const type = fold(col(r, "Type"));
    const kind: CardRecord["kind"] = type.startsWith("credit") ? "credit" : type.startsWith("debit") ? "debit" : "atm";
    const bank = col(r, "Bank");
    const name = col(r, "Name") || `${bank} ${kind}`;
    const note = col(r, "Note");
    const number = col(r, "Số thẻ", "So the", "Number");
    const last4 = /(\d{4})\s*$/.exec(number)?.[1];
    const statusRaw = fold(col(r, "Card status"));
    let status: CardRecord["status"] = statusRaw.includes("lock") ? "locked" : statusRaw.includes("inactiv") ? "inactive" : "active";
    const cancelled = cancelledOn(note);
    if (cancelled) status = "cancelled";
    let id = slug(name) || slug(`${bank}-${kind}`);
    for (let i = 2; ids.has(id); i++) id = `${slug(name)}-${i}`;
    ids.add(id);
    const brand = fold(col(r, "Card brand"));
    const phys = fold(col(r, "Physic card", "Physical card"));
    const rec: CardRecord = {
      id,
      kind,
      bank,
      name,
      ...(brand ? { network: brand } : {}),
      ...(last4 ? { last4 } : {}),
      status,
      ...(dmy(col(r, "Issue date")) ? { issued: dmy(col(r, "Issue date")) } : {}),
      ...(dmy(col(r, "Activate date")) ? { activated: dmy(col(r, "Activate date")) } : {}),
      ...(cancelled && cancelled !== "unknown" && cancelled.length === 10 ? { cancelled } : {}),
      ...(phys ? { physical: phys.includes("both") ? "both" : phys.includes("non") ? "virtual" : "physical" } : {}),
      ...(col(r, "Apple Pay") ? { apple_pay: fold(col(r, "Apple Pay")) === "yes" } : {}),
      ...(money(col(r, "Anual fee", "Annual fee")) !== undefined ? { annual_fee: money(col(r, "Anual fee", "Annual fee")) } : {}),
      ...(money(col(r, "Close account")) !== undefined ? { close_fee: money(col(r, "Close account")) } : {}),
      ...(money(col(r, "Benefits")) !== undefined ? { benefits: money(col(r, "Benefits")) } : {}),
      ...(col(r, "Detail link") ? { fees_url: col(r, "Detail link") } : {}),
      ...(note ? { note } : {}),
    };
    const plan = !cancelled ? cancelMonth(note) : undefined;
    if (plan) rec.cancel_plan = { by: plan, note };
    if (/(giữ|giu)\s*h[ạa]n\s*m[ứu]c/iu.test(note)) rec.keep_for_limit = true;

    const debitAcc = dec.asDebit?.[id];
    if (debitAcc) {
      const acc = l.accounts.find((a) => a.id === debitAcc);
      if (!acc) out.mismatches.push(`asDebit ${id}=${debitAcc}: no such account`);
      else {
        matched.add(acc.id);
        rec.kind = "debit";
        rec.account = acc.id;
        const names = [...(dec.names?.[acc.id] ?? []), acc.name].sort((x, y) => [...y].length - [...x].length);
        const codes = parseCardName(names[0]!).details;
        const d = { ...(acc.details ?? {}) } as Record<string, unknown>;
        const sd = d.statement_day ?? codes.statement_day;
        if (sd !== undefined) rec.statement_day = sd as number;
        const cb = d.cashback ?? codes.cashback;
        if (cb) rec.cashback = cb as Record<string, unknown>;
        if (codes.fee_month) rec.fee_month = codes.fee_month as number;
        for (const k of ["statement_day", "due_day", "cashback", "limit", "fee_month", "anniversary", "from_name"]) delete d[k];
        out.accountUpdates.push({ id: acc.id, set: { type: "bank", details: Object.keys(d).length ? d : null }, why: `a debit card (${name}): ${acc.id} becomes a bank account in "My money"; its cycle start day and cashback terms move to the card record` });
      }
    } else if (kind === "credit") {
      // match: the owner's link, last 4 digits, then the name, then the only credit card of that bank
      const linked = dec.link?.[id] ? cards.find((a) => a.id === dec.link![id]) : undefined;
      let acc = linked ?? (last4 ? cards.find((a) => last4Of(a) === last4) : undefined);
      let how = linked ? "your link" : "last 4 digits";
      if (!acc) {
        acc = cards.find((a) => fold(a.name).replace(/\s*\*\d{4}.*/, "").replace(/\s+/g, "") === fold(name).replace(/\s+/g, ""));
        how = "name";
      }
      if (!acc) {
        const sameBank = cards.filter((a) => !matched.has(a.id) && fold(a.name).split(/\s+/)[0] === fold(bank).split(/\s+/)[0]);
        const known = sameBank.filter((a) => last4Of(a));
        if (last4 && sameBank.length && known.length === sameBank.length) {
          out.mismatches.push(`"${name}" (tracker, *${last4}) is not in the ledger (no ${bank} card ends in ${last4})`);
        } else if (sameBank.length === 1) {
          acc = sameBank[0];
          how = "bank (only one card of this bank in the ledger)";
          out.mismatches.push(`"${name}" (tracker) ↔ "${acc!.name}" (${acc!.id}) matched by ${how}: confirm they're the same card`);
        } else if (sameBank.length > 1) {
          out.mismatches.push(`"${name}" (tracker): which of ${sameBank.map((a) => `${a.name} (${a.id})`).join(", ")} is it?`);
        }
      }
      if (acc) {
        matched.add(acc.id);
        rec.account = acc.id;
        const limit = money(col(r, "Credit balance"));
        if (limit) {
          if (acc.details?.limit !== limit) out.accountUpdates.push({ id: acc.id, set: { details: { ...(acc.details ?? {}), limit } }, why: `limit ${limit} from the tracker ("Credit balance")` });
        } else out.mismatches.push(`${acc.name} (${acc.id}): no limit in the tracker`);
        if (status === "cancelled" && !acc.closed) {
          const day = dec.closed?.[acc.id] ?? (cancelled && cancelled.length === 10 ? cancelled : undefined);
          if (day) out.accountUpdates.push({ id: acc.id, set: { closed: day }, why: `cancelled on ${day} (tracker note: "${note}")` });
          else out.mismatches.push(`${acc.name} (${acc.id}) is cancelled (${cancelled === "unknown" ? "no date" : cancelled}) but still open: which day was it closed?`);
        }
      } else if (!out.mismatches.some((m) => m.startsWith(`"${name}"`))) out.mismatches.push(`"${name}" (tracker, credit) is not in the ledger`);
    } else {
      const same = cards.find((a) => fold(a.name).startsWith(fold(name)) && !matched.has(a.id));
      if (same) out.mismatches.push(`"${name}" is a ${kind} card in the tracker but ${same.name} (${same.id}) is a credit card in the ledger: --as-debit ${id}=${same.id} makes it a bank account with this card's cashback`);
    }
    out.records.push(rec);
  }
  const merged = new Map<string, TrackerLoad["accountUpdates"][number]>();
  for (const u of out.accountUpdates) {
    const m = merged.get(u.id);
    if (!m) merged.set(u.id, { ...u, set: { ...u.set } });
    else {
      m.set = { ...m.set, ...u.set, ...(m.set.details && u.set.details ? { details: { ...(m.set.details as object), ...(u.set.details as object) } } : {}) };
      m.why += `; ${u.why}`;
    }
  }
  out.accountUpdates = [...merged.values()];
  for (const a of cards) {
    if (matched.has(a.id) || a.closed || Object.values(dec.asDebit ?? {}).includes(a.id)) continue;
    out.mismatches.push(`${a.name} (${a.id}) is a credit card in the ledger but not in the tracker`);
  }
  return out;
}
