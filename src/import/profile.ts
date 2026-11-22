import type { Cell, Sheet, Workbook } from "./workbook.js";

/**
 * Describes an export file so an AI can write its mapping: sheets, header rows, labelled figures
 * above the header, sample rows, distinct values of low-variety columns, and note patterns of rows
 * with an empty column (often transfers). Amounts are shown as they are; this runs on the user's machine.
 */
export interface SheetProfile {
  name: string;
  headerRow: number | null; // 1-based
  headers: string[];
  rows: number;
  firstDate: string | null;
  lastDate: string | null;
  figures: Record<string, Cell>; // label → value above the header
}

export interface Profile {
  kind: Workbook["kind"];
  sheets: SheetProfile[];
  sameHeaders: boolean;
  samples: { sheet: string; rows: Record<string, Cell>[] }[];
  distinct: Record<string, { value: string; rows: number }[]>; // columns with ≤ 60 distinct values, all sheets
  emptyColumnNotes: { column: string; noteColumn: string; patterns: { pattern: string; rows: number }[] }[];
  hints: string[];
}

const isText = (c: Cell) => typeof c === "string" && c.trim() !== "" && !/^[\d.,:/\- ]+$/.test(c);
const isDateLike = (c: Cell) => typeof c === "string" && /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/.test(c.trim());

function guessHeader(s: Sheet): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(s.rows.length - 1, 40);
  for (let r = 0; r < limit; r++) {
    const row = s.rows[r] ?? [];
    const texts = row.filter(isText).length;
    const next = s.rows[r + 1] ?? [];
    const filled = next.filter((c) => c !== null).length;
    const score = texts >= 3 && filled >= Math.min(3, texts) ? texts + (next.some(isDateLike) ? 5 : 0) : 0;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

const mask = (s: string) =>
  s
    .replace(/\d[\d.,]*/g, "#")
    .replace(/(Chuyển (?:từ|tới)|from|to)\s+[^()]+/giu, "$1 <name>")
    .slice(0, 80);

export function profileWorkbook(wb: Workbook): Profile {
  const sheets: SheetProfile[] = [];
  const distinct = new Map<string, Map<string, number>>();
  const samples: Profile["samples"] = [];
  const empties = new Map<string, Map<string, number>>(); // "col|noteCol" → pattern → rows
  let firstHeaders: string | null = null;
  let same = true;
  for (const s of wb.sheets) {
    const h = guessHeader(s);
    const headers = h >= 0 ? (s.rows[h] ?? []).map((c) => (c === null ? "" : String(c).trim())) : [];
    const figures: Record<string, Cell> = {};
    for (let r = 0; r < Math.max(h, 0); r++) {
      const row = s.rows[r] ?? [];
      row.forEach((c, i) => {
        if (!isText(c)) return;
        const v = row.slice(i + 1).find((x) => typeof x === "number" || (typeof x === "string" && /^-?[\d.,]+$/.test(x)));
        if (v !== undefined) figures[String(c).trim()] = v;
      });
    }
    const data = h >= 0 ? s.rows.slice(h + 1).filter((r) => r && r.some((c) => c !== null)) : [];
    const dateCol = headers.findIndex((_, i) => data.slice(0, 20).some((r) => isDateLike(r[i] ?? null)));
    const dates = dateCol >= 0 ? data.map((r) => r[dateCol] ?? null).filter(isDateLike).map(String) : [];
    sheets.push({ name: s.name, headerRow: h >= 0 ? h + 1 : null, headers, rows: data.length, firstDate: dates.at(-1) ?? null, lastDate: dates[0] ?? null, figures });
    const sig = headers.join("|");
    if (firstHeaders === null) firstHeaders = sig;
    else if (sig !== firstHeaders) same = false;
    if (samples.length < 3 && data.length) {
      samples.push({ sheet: s.name, rows: data.slice(0, 5).map((r) => Object.fromEntries(headers.map((hh, i) => [hh || `col${i + 1}`, r[i] ?? null]))) });
    }
    const noteCol = headers.findIndex((x) => /diễn giải|note|description|memo|ghi chú|nội dung/i.test(x));
    headers.forEach((name, i) => {
      if (!name) return;
      const m = distinct.get(name) ?? new Map<string, number>();
      for (const r of data) {
        const v = r[i];
        if (v === null || v === undefined || typeof v === "number") continue;
        m.set(String(v), (m.get(String(v)) ?? 0) + 1);
      }
      distinct.set(name, m);
      if (noteCol >= 0 && i !== noteCol && i !== dateCol) {
        const empty = data.filter((r) => (r[i] ?? null) === null);
        if (empty.length && empty.length < data.length) {
          const k = `${name}|${headers[noteCol]}`;
          const pm = empties.get(k) ?? new Map<string, number>();
          for (const r of empty) {
            const p = mask(String(r[noteCol] ?? ""));
            pm.set(p, (pm.get(p) ?? 0) + 1);
          }
          empties.set(k, pm);
        }
      }
    });
  }
  const hints: string[] = [];
  const text = wb.sheets.slice(0, 1).flatMap((s) => s.rows.slice(0, 8).flat()).filter(isText).join(" ");
  if (/SỔ THU CHI/i.test(text) && /Bảng Kê Thu Chi/i.test(text)) hints.push("Looks like MISA Sổ Thu Chi: start from the preset `ownledger import --preset misa` writes (presets/misa.mapping.yaml).");
  if (wb.sheets.length > 1 && same) hints.push(`${wb.sheets.length} sheets share the same header: probably one account per sheet (account_from: sheet). Sheet names may be cut to 31 characters; full names often appear in transfer notes.`);
  return {
    kind: wb.kind,
    sheets,
    sameHeaders: same,
    samples,
    distinct: Object.fromEntries(
      [...distinct]
        .filter(([, m]) => m.size > 0 && m.size <= 60)
        .map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1]).map(([value, rows]) => ({ value, rows }))]),
    ),
    emptyColumnNotes: [...empties]
      .map(([k, pm]) => {
        const [column, noteColumn] = k.split("|") as [string, string];
        return { column, noteColumn, patterns: [...pm].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([pattern, rows]) => ({ pattern, rows })) };
      })
      .filter((e) => e.patterns.length),
    hints,
  };
}

export function profileText(p: Profile): string {
  const out: string[] = [];
  out.push(`# Export profile (${p.kind}, ${p.sheets.length} sheet(s))`, "");
  for (const h of p.hints) out.push(`> ${h}`);
  out.push("", "## Sheets", "", "| sheet | header row | rows | first → last date | figures above header |", "|---|---|---|---|---|");
  for (const s of p.sheets) out.push(`| ${s.name} | ${s.headerRow ?? "?"} | ${s.rows} | ${s.firstDate ?? ""} → ${s.lastDate ?? ""} | ${Object.entries(s.figures).map(([k, v]) => `${k}: ${v}`).join("; ")} |`);
  out.push("", `## Headers${p.sameHeaders ? " (same on every sheet)" : ""}`, "", p.sheets[0]?.headers.filter(Boolean).map((h) => `\`${h}\``).join(", ") ?? "");
  out.push("", "## Sample rows");
  for (const s of p.samples) out.push("", `### ${s.sheet}`, "```json", ...s.rows.map((r) => JSON.stringify(r)), "```");
  out.push("", "## Distinct values (columns with ≤ 60 values, all sheets)");
  for (const [k, vs] of Object.entries(p.distinct)) out.push("", `- **${k}**: ${vs.map((v) => `${v.value} (${v.rows})`).join(" · ")}`);
  out.push("", "## Notes of rows where a column is empty (digits → #, names → <name>)");
  for (const e of p.emptyColumnNotes) out.push("", `- **${e.column}** empty → ${e.noteColumn}: ${e.patterns.map((x) => `"${x.pattern}" (${x.rows})`).join(" · ")}`);
  return out.join("\n") + "\n";
}
