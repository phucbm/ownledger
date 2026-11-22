import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import type { Dict, Entry, Lang } from "./types";
import { vi } from "./vi";

export type { Dict, Lang };
export const dictionaries: Record<Lang, Dict> = { vi, en };
const STORAGE_KEY = "ownledger.lang";

export type Vars = Record<string, string | number>;

function pick(entry: Entry, lang: Lang, n: unknown): string {
  if (typeof entry === "string") return entry;
  const form = typeof n === "number" ? new Intl.PluralRules(lang === "vi" ? "vi-VN" : "en-US").select(n) : "other";
  return form === "one" ? entry.one : entry.other;
}

/** Looks a key up in `lang`, then English, then returns the key. Fills `{name}` placeholders from `vars`. */
export function translate(lang: Lang, key: string, vars?: Vars): string {
  const entry = dictionaries[lang][key] ?? en[key];
  if (entry === undefined) return key;
  const s = pick(entry, lang, vars?.n);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

function initialLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Vars) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* private mode: keep it for this session only */
    }
    setLangState(l);
  }, []);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
