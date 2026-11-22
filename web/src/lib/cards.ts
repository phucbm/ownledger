import { daysBetween, iso } from "./dates";
import { parseDate } from "./format";

/** The next statement date on or after `asOf` for a statement day (clamped to short months). */
export function nextStatementDate(asOf: string, statementDay: number): string {
  const d = parseDate(asOf);
  const at = (y: number, m: number) => iso(new Date(y, m, Math.min(statementDay, new Date(y, m + 1, 0).getDate())));
  const thisMonth = at(d.getFullYear(), d.getMonth());
  return thisMonth >= asOf ? thisMonth : at(d.getFullYear(), d.getMonth() + 1);
}

export const daysToClose = (asOf: string, statementDay: number) => daysBetween(asOf, nextStatementDate(asOf, statementDay));

/** `#/cards/<account>`. */
export const cardHref = (account: string) => `#/cards/${encodeURIComponent(account)}`;

/** Which group of the status filter a card status belongs to (inactive counts as active: it is open, only unused). */
export const statusGroup = (status: string): "active" | "locked" | "cancelled" => (status === "locked" ? "locked" : status === "cancelled" ? "cancelled" : "active");
