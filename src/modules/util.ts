import { isDate } from "../engine/dates.js";
import type { Account, ISODate } from "../engine/types.js";

export const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
export const int = (v: unknown): number | undefined => (Number.isInteger(v) ? (v as number) : undefined);
export const day = (v: unknown): number | undefined => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31 ? (v as number) : undefined);
export const date = (v: unknown): ISODate | undefined => (isDate(v) ? v : undefined);
export const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
/** Open on asOf: not closed on or before it. */
export const isOpen = (a: Account, asOf: ISODate) => !(isDate(a.closed) && a.closed <= asOf);
