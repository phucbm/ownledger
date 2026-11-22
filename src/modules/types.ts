import type { TypeDef } from "../engine/registry.js";
import type { FileMap } from "../engine/load.js";
import type { ISODate, Issue, Ledger } from "../engine/types.js";

/**
 * One item for "Needs you". Text is not stored here: the dashboard translates by `kind` (with `params`),
 * the connector reads `title` (plain English) and the fields.
 */
export interface AttentionItem {
  kind: string; // e.g. card_due, plan_overdue, uncategorised
  module?: string; // the module that raised it; none = core
  severity: "red" | "amber" | "info";
  /** Sort key: the date it is about (due date, maturity…), or asOf for housekeeping. */
  date: ISODate;
  title: string; // plain English, for the connector
  amount?: number;
  account?: string;
  name?: string; // the account, plan or card name (owner's data, never translated)
  days?: number; // days left (negative = overdue)
  count?: number;
  params?: Record<string, string | number | null>;
  /** Where it's fixed in the dashboard (hash route), e.g. "#/transactions?category=" */
  link?: string;
  /** true when the fix is a chat with the AI (the dashboard shows "Ask AI"). */
  ask?: boolean;
}

/** A built-in module: what it adds around one or more account types. Built in, never third-party. */
export interface ModuleDef {
  name: string;
  /** Account types it owns (label, liquid/liability/holdings, the details fields check validates). */
  types: Record<string, TypeDef>;
  /** On when the ledger has what the module is about (usually an open account of its types). */
  on(l: Ledger, asOf: ISODate, files?: FileMap): boolean;
  /** Reads the module's own files into ledger.ext[name] when the ledger loads (problems go to issues). */
  load?(files: FileMap, issues: Issue[]): unknown;
  /** Extra checks for its own files and fields, run by `ownledger check` when on. */
  check?(l: Ledger, files: FileMap): Issue[];
  /** Its items for "Needs you". */
  attention?(l: Ledger, asOf: ISODate, files?: FileMap): AttentionItem[];
}
