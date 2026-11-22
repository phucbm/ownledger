export interface DrillFilter {
  from?: string;
  to?: string;
  account?: string;
  category?: string;
  text?: string;
  who?: string;
  event?: string;
  tag?: string;
  tx?: string;
  plan?: string;
  within?: string;
}

/** `#/transactions?...` for a filter; empty fields are left out. */
export function drillHref(f: DrillFilter = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return `#/transactions${s ? `?${s}` : ""}`;
}

/** First and last day of the month `yyyy-mm`. */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
