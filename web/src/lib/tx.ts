import type { Meta } from "./api";
import type { Tx } from "./types";

export interface TxView {
  kind: "in" | "out" | "transfer";
  /** Signed from the person's side: money in is positive. For one filtered account: the change on that account. */
  amount: number;
  /** Top category path of the biggest category line; null for a transfer. */
  category: string | null;
  /** Account names on the way out and the way in (transfers). */
  from: string[];
  to: string[];
}

export interface TxNames {
  account: (id?: string | null) => string;
  category: (path?: string | null) => string;
  /** "Ăn uống › Cà phê" */
  categoryPath: (path?: string | null) => string;
}

export function namesFrom(meta: Meta | undefined): TxNames {
  const acc = new Map((meta?.accounts ?? []).map((a) => [a.id, a.name]));
  const cat = new Map((meta?.categories ?? []).map((c) => [c.path, c.name]));
  const leaf = (p: string) => cat.get(p) ?? p.split("/").pop() ?? p;
  return {
    account: (id) => (id ? (acc.get(id) ?? id) : ""),
    category: (p) => (p ? leaf(p) : ""),
    categoryPath: (p) => {
      if (!p) return "";
      const parts = p.split("/");
      return parts.map((_, i) => leaf(parts.slice(0, i + 1).join("/"))).join(" › ");
    },
  };
}

const isSystem = (c: string) => c.startsWith("_");

/** What a transaction means to the reader: spending, income, or a move between accounts. */
export function viewTx(t: Tx, names: TxNames, account?: string): TxView {
  const catLines = t.lines.filter((l) => l.category && !isSystem(l.category));
  const onAccount = account ? t.lines.filter((l) => l.account === account).reduce((s, l) => s + l.amount, 0) : null;
  if (catLines.length === 0) {
    const from = [...new Set(t.lines.filter((l) => l.amount < 0 && l.account).map((l) => names.account(l.account)))];
    const to = [...new Set(t.lines.filter((l) => l.amount > 0 && l.account).map((l) => names.account(l.account)))];
    const moved = t.lines.reduce((s, l) => s + Math.max(0, l.amount), 0);
    return { kind: "transfer", amount: onAccount ?? moved, category: null, from, to };
  }
  const net = -catLines.reduce((s, l) => s + l.amount, 0);
  const main = [...catLines].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0]!;
  return { kind: net < 0 ? "out" : "in", amount: onAccount ?? net, category: main.category ?? null, from: [], to: [] };
}
