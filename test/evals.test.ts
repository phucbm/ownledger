// Question evals: evals/questions.md, run against the MCP server in memory on fixtures/demo with a fixed date.
// Each `## ` is one question; its `- tool:` lines are called in order, and every `- expect:` must appear in what they
// returned (`- not:` must not; `- expect_error:` must appear in a tool error). No model is called: the evals check
// that the tools give a good answer the facts it needs, and refuse what they must refuse.
// EVAL_SHOW=<file> pnpm vitest run test/evals.test.ts appends every tool result to <file> (to write expectations from real output).
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect } from "./mcp-memory.js";

const NOW = "2026-11-03T05:00:00Z"; // noon in Vietnam; the demo card's statement period started 2026-10-21

interface Question {
  title: string;
  calls: { tool: string; args: Record<string, unknown> }[];
  expect: string[];
  not: string[];
  errors: string[];
}

export function parseQuestions(md: string): Question[] {
  const qs: Question[] = [];
  let q: Question | null = null;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      q = { title: line.slice(3), calls: [], expect: [], not: [], errors: [] };
      qs.push(q);
      continue;
    }
    if (!q) continue;
    const m = /^- (tool|expect|not|expect_error): (.*)$/.exec(line);
    if (!m) continue;
    const [, kind, rest] = m as unknown as [string, string, string];
    if (kind === "tool") {
      const i = rest.indexOf(" ");
      q.calls.push({ tool: i < 0 ? rest : rest.slice(0, i), args: i < 0 ? {} : JSON.parse(rest.slice(i + 1)) });
    } else if (kind === "expect") q.expect.push(rest);
    else if (kind === "not") q.not.push(rest);
    else q.errors.push(rest);
  }
  return qs;
}

const questions = parseQuestions(readFileSync(join(import.meta.dirname, "..", "evals", "questions.md"), "utf8"));

describe("question evals (evals/questions.md)", () => {
  let mcp: Awaited<ReturnType<typeof connect>>;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    mcp = await connect();
  });
  afterAll(async () => {
    await mcp.close();
    vi.useRealTimers();
  });

  it("the file has questions", () => expect(questions.length).toBeGreaterThan(10));

  for (const q of questions) {
    it(q.title, async () => {
      const ok: string[] = [];
      const errs: string[] = [];
      let lastPreview: string | undefined;
      for (const c of q.calls) {
        // `"$preview"` in args is the preview_id returned by the question's previous call
        const args = JSON.parse(JSON.stringify(c.args).replaceAll('"$preview"', JSON.stringify(lastPreview ?? "")));
        const r = await mcp.call(c.tool, args);
        if (process.env.EVAL_SHOW) appendFileSync(process.env.EVAL_SHOW, `\n[${q.title}] ${c.tool} ${JSON.stringify(args)}\n${r.text}\n`);
        (r.isError ? errs : ok).push(r.text);
        lastPreview = /"preview_id":"([^"]+)"/.exec(r.text)?.[1] ?? lastPreview;
      }
      const okText = ok.join("\n");
      const errText = errs.join("\n");
      for (const e of q.expect) expect(okText, `expected in results: ${e}`).toContain(e);
      for (const e of q.not) expect(okText + errText, `must not appear: ${e}`).not.toContain(e);
      for (const e of q.errors) expect(errText, `expected an error with: ${e}`).toContain(e);
      if (!q.errors.length) expect(errText, "no tool should fail").toBe("");
    });
  }
});
