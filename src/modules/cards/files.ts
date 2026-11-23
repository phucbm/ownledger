import type { FileMap } from "../../engine/load.js";

/**
 * Bank statement PDFs (plan 004): imports/statements/<account-id>/<YYYY-MM>.pdf, YYYY-MM = the month of the close date.
 * The Worker only knows their paths (from the tarball, contents not read) and streams one to the signed-in dashboard;
 * it never parses them. Reading them is the CLI's job, on the user's computer.
 */
export const STATEMENTS_DIR = "imports/statements";
export const STATEMENT_PDF_RE = /^imports\/statements\/[^/]+\/\d{4}-(0[1-9]|1[0-2])\.pdf$/;

export function statementPdfPath(account: string, close: string): string {
  return `${STATEMENTS_DIR}/${account}/${close.slice(0, 7)}.pdf`;
}

/** The statement PDF filed for this card's statement closing on `close`, or null. */
export function statementPdf(files: FileMap, account: string, close: string): string | null {
  if (!account || account.includes("/") || account.startsWith(".")) return null;
  const p = statementPdfPath(account, close);
  return STATEMENT_PDF_RE.test(p) && files[p] !== undefined ? p : null;
}
