/** A string with `{name}` placeholders, or `{ one, other }` plural forms picked by the `n` variable. */
export type Entry = string | { one: string; other: string };
export type Dict = Record<string, Entry>;
export type Lang = "vi" | "en";
