import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { translate } from "./index";
import { vi } from "./vi";

const srcDir = fileURLToPath(new URL("..", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !p.includes(join("i18n", "vi.ts")) && !p.includes(join("i18n", "en.ts")) ? [p] : [];
  });
}

const values = (d: Record<string, unknown>) => Object.values(d).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v as object)));

describe("i18n dictionaries", () => {
  it("have the same keys", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });
  it("have no empty value", () => {
    for (const d of [vi, en]) for (const v of values(d)) expect(String(v).trim()).not.toBe("");
  });
  it("use the same placeholders in both languages", () => {
    const ph = (e: unknown) => [...new Set(values({ e: e as string }).join(" ").match(/\{\w+\}/g) ?? [])].sort();
    for (const k of Object.keys(en)) expect(ph(vi[k]), k).toEqual(ph(en[k]));
  });
  it("define every key used in web/src", () => {
    // t("key") calls, and keys kept in data as labelKey: "key" / titleKey: "key" (nav.ts, pages).
    const re = /(?:\bt\(\s*|\w+Key:\s*)["'`]([\w]+(?:\.[\w]+)+)["'`]/g;
    const used = new Set<string>();
    for (const f of files(srcDir)) for (const m of readFileSync(f, "utf8").matchAll(re)) used.add(m[1]!);
    expect(used.size).toBeGreaterThan(0);
    const missing = [...used].filter((k) => !(k in en) || !(k in vi));
    expect(missing).toEqual([]);
  });
  it("have no hard-coded text in JSX", () => {
    // Stand-in for eslint react/jsx-no-literals (typescript-eslint does not support TS 7 yet): visible text between tags.
    const text = />\s*([^<>{}=;()`]*[\p{L}]{2}[^<>{}=;()`]*?)\s*</gu;
    const bad: string[] = [];
    for (const f of files(srcDir).filter((f) => f.endsWith(".tsx") && !f.includes(join("components", "ui")))) {
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      for (const m of src.matchAll(text)) bad.push(`${f.replace(srcDir, "")}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
  it("translate fills placeholders and falls back to the key", () => {
    expect(translate("en", "settings.version", { version: "1.2.3" })).toBe("Version 1.2.3");
    expect(translate("vi", "no.such.key")).toBe("no.such.key");
  });
});
