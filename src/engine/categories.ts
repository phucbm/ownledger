import type { CategoriesFile, Category, CategoryNode, CategoryKind } from "./types.js";

/**
 * System categories (prefix "_"): they balance transactions that are neither income nor spending.
 * Reports never count them as income or spending.
 */
export const SYSTEM_CATEGORIES: Record<string, { en: string; vi: string }> = {
  _opening: { en: "Opening balance", vi: "Số dư ban đầu" },
  _adjust: { en: "Balance adjustment", vi: "Điều chỉnh số dư" },
};

export function isSystemCategory(path: string): boolean {
  return path.startsWith("_");
}

/** Flattens the tree into a map path → Category. Duplicate paths are reported by check. */
export function flattenCategories(file: CategoriesFile): { map: Map<string, Category>; dupes: string[] } {
  const map = new Map<string, Category>();
  const dupes: string[] = [];
  const walk = (nodes: CategoryNode[] | undefined, kind: CategoryKind, parent: string | null) => {
    for (const n of nodes ?? []) {
      if (!n || typeof n.id !== "string") continue;
      const path = parent ? `${parent}/${n.id}` : n.id;
      if (map.has(path)) dupes.push(path);
      map.set(path, { path, name: String(n.name ?? n.id), kind, parent });
      walk(n.children, kind, path);
    }
  };
  walk(file.income, "income", null);
  walk(file.expense, "expense", null);
  return { map, dupes };
}

/** The top-level segment of a category path. */
export function topOf(path: string): string {
  const i = path.indexOf("/");
  return i < 0 ? path : path.slice(0, i);
}
