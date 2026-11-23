// An MCP client for tests: JSON-RPC over the SDK's in-memory transport, to the real server on fixtures/demo.
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { Env } from "../src/worker/env.js";
import { buildServer, type Deps } from "../src/worker/mcp.js";
import type { DataSource } from "../src/worker/store.js";
import { readDataDir } from "../src/node/files.js";

function fakeKv(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string, type?: string) => {
      const v = m.get(k);
      return v === undefined ? null : type === "json" ? JSON.parse(v) : v;
    },
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  } as unknown as KVNamespace;
}

/** A tiny MCP client: JSON-RPC over the SDK's in-memory transport. */
export async function connect(deps: Deps = { openwallet: null }) {
  const files = readDataDir(join(import.meta.dirname, "..", "fixtures", "demo"));
  const src: DataSource = {
    label: "fixtures/demo",
    head: async () => "demo0000000000000000000000000000000000000",
    files: async () => files,
    blob: async () => null,
    commit: async () => {
      throw new Error("evals never commit");
    },
  };
  const env = { OAUTH_KV: fakeKv(), DEV_DATA_URL: "memory", TIMEZONE: "Asia/Ho_Chi_Minh" } as unknown as Env;
  const server = buildServer(env, { login: "demo-user", client: "evals" }, src, deps);
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (m: any) => void>();
  client.onmessage = (m: any) => {
    if (m.id !== undefined && waiting.has(m.id)) {
      waiting.get(m.id)!(m);
      waiting.delete(m.id);
    }
  };
  await server.connect(serverSide);
  await client.start();
  let id = 0;
  const rpc = (method: string, params: object) =>
    new Promise<any>((resolve) => {
      const n = ++id;
      waiting.set(n, resolve);
      void client.send({ jsonrpc: "2.0", id: n, method, params } as any);
    });
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "evals", version: "1" } });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" } as any);
  return {
    tools: async () => ((await rpc("tools/list", {})).result.tools as { name: string }[]).map((t) => t.name),
    call: async (name: string, args: object) => {
      const r = await rpc("tools/call", { name, arguments: args });
      if (r.error) return { text: `${r.error.message} ${JSON.stringify(r.error.data ?? "")}`, isError: true };
      return { text: (r.result.content ?? []).map((c: any) => c.text ?? "").join("\n"), isError: Boolean(r.result.isError) };
    },
    close: () => client.close(),
  };
}

