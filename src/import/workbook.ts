import { strFromU8, unzipSync } from "fflate";

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][]; // rows[r][c], 0-based; missing cells are null
}
export interface Workbook {
  kind: "xlsx" | "csv" | "json";
  sheets: Sheet[];
}

/* ------------------------------------------------------------------ xlsx */

const XML_ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unxml(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (XML_ENT[e] ?? m),
    );
}

function textOf(xml: string): string {
  // concatenates <t> runs (rich text), ignoring phonetic runs
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  const noPh = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
  for (let m; (m = re.exec(noPh)); ) out += m[1] ?? "";
  return unxml(out);
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unxml(m[1]!) : undefined;
}

export function readXlsx(data: Uint8Array): Workbook {
  const files = unzipSync(data, { filter: (f) => f.name.startsWith("xl/") && f.name.endsWith(".xml") || f.name.endsWith(".rels") });
  const get = (p: string) => (files[p] ? strFromU8(files[p]!) : undefined);
  const wb = get("xl/workbook.xml");
  if (!wb) throw new Error("not an xlsx file (xl/workbook.xml missing)");
  const rels = get("xl/_rels/workbook.xml.rels") ?? "";
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) relMap.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const shared: string[] = [];
  const sst = get("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]!));

  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], "r:id");
    const path = rid ? relMap.get(rid) : undefined;
    const xml = path ? get(path) : undefined;
    if (!xml) continue;
    const rows: Cell[][] = [];
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const r = Number(attr(rm[1] ?? rm[3] ?? "", "r") ?? rows.length + 1) - 1;
      const row: Cell[] = [];
      for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = cm[1] ?? "";
        const inner = cm[2] ?? "";
        const ref = attr(a, "r");
        const c = ref ? colIndex(ref) : row.length;
        const t = attr(a, "t");
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let val: Cell = null;
        if (t === "s") val = v !== undefined ? (shared[Number(v)] ?? "") : null;
        else if (t === "inlineStr") val = textOf(inner);
        else if (t === "str" || t === "e") val = v !== undefined ? unxml(v) : null;
        else if (t === "b") val = v === "1" ? 1 : 0;
        else if (v !== undefined) val = Number(v);
        if (val === "") val = null;
        while (row.length < c) row.push(null);
        row[c] = val;
      }
      while (rows.length < r) rows.push([]);
      rows[r] = row;
    }
    sheets.push({ name: unxml(name), rows });
  }
  return { kind: "xlsx", sheets };
}

/* ------------------------------------------------------------------ csv */

export function readCsv(text: string, name = "csv"): Workbook {
  const t = text.replace(/^﻿/, "");
  const first = t.slice(0, t.indexOf("\n") >>> 0 || t.length);
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let q = false;
  let quoted = false;
  const push = () => {
    row.push(field === "" && !quoted ? null : field);
    field = "";
    quoted = false;
  };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') {
      q = true;
      quoted = true;
    } else if (ch === delim) push();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    push();
    rows.push(row);
  }
  return { kind: "csv", sheets: [{ name, rows }] };
}

/* ------------------------------------------------------------------ json */

export function readJson(text: string, name = "json"): Workbook {
  const v = JSON.parse(text);
  const arr: Record<string, unknown>[] = Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.items) ? v.items : [];
  const headers = [...new Set(arr.flatMap((o) => Object.keys(o ?? {})))];
  const rows: Cell[][] = [headers];
  for (const o of arr) {
    rows.push(headers.map((h) => {
      const x = (o as Record<string, unknown>)[h];
      return x === undefined || x === null ? null : typeof x === "number" ? x : typeof x === "object" ? JSON.stringify(x) : String(x);
    }));
  }
  return { kind: "json", sheets: [{ name, rows }] };
}

export function readWorkbook(fileName: string, data: Uint8Array): Workbook {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || (data[0] === 0x50 && data[1] === 0x4b)) return readXlsx(data);
  const text = new TextDecoder().decode(data);
  if (lower.endsWith(".json")) return readJson(text, fileName);
  return readCsv(text, fileName);
}
