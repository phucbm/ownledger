// OpenWallet (https://openwallet.vn): a public catalog of bank cards in Vietnam with an MCP server. An outside source
// the owner turns on (OPENWALLET_URL); off by default. Nothing it returns is stored. What is sent: card product
// names and banks (to find the cards), the purchase (amount, merchant or kind, date) and, per card, what was spent
// and the cashback booked this statement period. Never account ids, notes, balances or anything else.

export const OPENWALLET_DEFAULT_URL = "https://mcp.openwallet.vn/mcp";
const TIMEOUT_MS = 15_000;
/** at most this many requests in flight to OpenWallet (it rate-limits per caller) */
const MAX_IN_FLIGHT = 4;

export class OpenWalletError extends Error {}

export interface OpenWallet {
  url: string;
  call(tool: string, args: Record<string, unknown>): Promise<any>;
}

type Fetch = typeof fetch;

/** Reads a JSON-RPC response that came back as JSON or as server-sent events. */
async function rpcBody(res: Response, id: number): Promise<any> {
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (type.includes("text/event-stream")) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      const m = JSON.parse(data);
      if (m.id === id) return m;
    }
    throw new OpenWalletError("OpenWallet: no answer in the event stream");
  }
  return text ? JSON.parse(text) : null;
}

/** A minimal MCP client over Streamable HTTP: initialize once, then tools/call. */
export function openWalletClient(url: string, fetchImpl: Fetch = fetch, retryDelayMs = 1500): OpenWallet {
  let session: Promise<{ id?: string; protocol: string }> | null = null;
  let n = 0;
  let inFlight = 0;
  const queue: (() => void)[] = [];
  const slot = async () => {
    if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => queue.push(r));
    inFlight++;
  };
  const release = () => {
    inFlight--;
    queue.shift()?.();
  };

  const post = async (body: object, sessionId?: string, protocol?: string) => {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    if (protocol) headers["mcp-protocol-version"] = protocol;
    // one retry after a timeout, a network error or a 429
    for (let attempt = 0; ; attempt++) {
      await slot();
      let res: Response | null = null;
      let failure: string | null = null;
      try {
        res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        failure = `OpenWallet did not answer (${(e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message})`;
      } finally {
        release();
      }
      if (res && res.status === 429) failure = "OpenWallet answered 429 (rate limited: try again in a minute)";
      if (failure) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        throw new OpenWalletError(failure);
      }
      if (!res!.ok && res!.status !== 202) throw new OpenWalletError(`OpenWallet answered ${res!.status}`);
      return res!;
    }
  };

  const init = async () => {
    const id = ++n;
    const res = await post({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ownledger", version: "1" } } });
    const m = await rpcBody(res, id);
    if (!m || m.error) throw new OpenWalletError(`OpenWallet: ${m?.error?.message ?? "no answer to initialize"}`);
    const s = { id: res.headers.get("mcp-session-id") ?? undefined, protocol: String(m.result?.protocolVersion ?? "2025-06-18") };
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, s.id, s.protocol);
    return s;
  };

  return {
    url,
    async call(tool, args) {
      session ??= init().catch((e) => {
        session = null;
        throw e;
      });
      const s = await session;
      const id = ++n;
      const m = await rpcBody(await post({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }, s.id, s.protocol), id);
      if (!m) throw new OpenWalletError(`OpenWallet: no answer to ${tool}`);
      if (m.error) throw new OpenWalletError(`OpenWallet ${tool}: ${m.error.message}`);
      const r = m.result ?? {};
      if (r.structuredContent && !r.isError) return r.structuredContent;
      const text = (r.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n");
      if (r.isError) throw new OpenWalletError(`OpenWallet ${tool}: ${text}`);
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
  };
}
