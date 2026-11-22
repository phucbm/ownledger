import type { Env } from "../worker/env.js";
import { cardsApi } from "./cards/api.js";
import { moduleByName } from "./index.js";
import type { DataSource, Snapshot } from "../worker/store.js";

export interface ModuleApiCtx {
  req: Request;
  env: Env;
  src: DataSource;
  snap: Snapshot;
  login: string;
  asOf: string;
  q: URLSearchParams;
}

export type ModuleApiResult = { body: unknown; status?: number } | null;
type Handler = (path: string, c: ModuleApiCtx) => Promise<ModuleApiResult> | ModuleApiResult;

/** /api/m/<module>/… : each module's endpoints. A module that's off answers 404. */
const HANDLERS: Record<string, Handler> = { cards: cardsApi };

export function registerModuleApi(name: string, h: Handler): void {
  HANDLERS[name] = h;
}

export async function moduleApi(path: string, c: ModuleApiCtx): Promise<ModuleApiResult> {
  const i = path.indexOf("/");
  const name = i < 0 ? path : path.slice(0, i);
  const h = HANDLERS[name];
  const m = moduleByName(name);
  if (!h || !m || !m.on(c.snap.ledger, c.asOf, c.snap.files)) return null;
  return h(i < 0 ? "" : path.slice(i + 1), c);
}
