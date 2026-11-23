import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { Features, Pool, Widget } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Same-origin JSON call to `/api/<path>`. A 401 throws ApiError(401); the app then shows the sign-in screen. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path.replace(/^\//, "")}`, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) {
    let msg = "";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* not JSON: Cloudflare's own error page (e.g. the Worker ran out of CPU time) */
    }
    // statusText is empty over HTTP/2, so never rely on it.
    if (!msg) msg = res.status === 503 ? `HTTP 503: the server hit its limit (Cloudflare). Try again in a moment.` : `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Any 401 re-checks /api/me, which flips the app to the sign-in screen.
      if (err instanceof ApiError && err.status === 401 && query.queryKey[0] !== "me") {
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// Types of the existing endpoints.

export interface Me {
  login: string;
  version: string;
  data: string;
  commit: string;
  base: string;
  locale: string;
  name: string;
  today: string;
  check: { errors: number; warnings: number };
  features?: Features;
  pool?: Pool;
  dashboard?: { saved: boolean; widgets: Widget[]; prefs: Record<string, unknown> };
}

export interface Meta {
  base: string;
  locale: string;
  types: Record<string, { en: string; vi: string; liquid: boolean; liability: boolean; holdings: boolean }>;
  categories: { path: string; name: string; kind: string; parent: string | null }[];
  accounts: { id: string; name: string; type: string; closed: boolean; group: string | null }[];
  assets: unknown;
}
