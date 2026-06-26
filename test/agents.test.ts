import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../src/agents/json.ts";

test("extractJson: parses a clean object", () => {
  assert.deepEqual(extractJson('{"action":"resolve","outcome":"succeeded"}'), { action: "resolve", outcome: "succeeded" });
});

test("extractJson: extracts an object embedded in surrounding prose", () => {
  const text = 'Sure, here is the action:\n{"action":"grep","text":"foo"}\nHope that helps.';
  assert.deepEqual(extractJson(text), { action: "grep", text: "foo" });
});

test("extractJson: handles nested objects and braces inside strings", () => {
  const text = 'noise {"outer":{"inner":1},"note":"a } brace in a string"} trailing';
  assert.deepEqual(extractJson(text), { outer: { inner: 1 }, note: "a } brace in a string" });
});

test("extractJson: returns null when there is no JSON object", () => {
  assert.equal(extractJson("no json here"), null);
});

test("extractJson: returns null for a malformed object", () => {
  assert.equal(extractJson('{"a": }'), null);
});

test("llmMind: per-instance config; surfaces a helpful error when unreachable", async () => {
  const { llmMind } = await import("../src/agents/llm.ts");
  // Per-instance baseUrl (no env), pointing at a closed port so fetch fails fast.
  const mind = llmMind({ baseUrl: "http://127.0.0.1:1/v1", model: "test-model" });
  await assert.rejects(
    () => mind.decide({ bee: null as any, view: "CELL", actions: [] }),
    (err: Error) => /completion fetch failed/.test(err.message) && /127\.0\.0\.1:1/.test(err.message),
    "error names the configured endpoint",
  );
});

test("llmMind: a custom fetch lets the model be driven without a network", async () => {
  const { llmMind } = await import("../src/agents/llm.ts");
  const fakeFetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"resolve","outcome":"succeeded","summary":"ok"}' } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const mind = llmMind({ baseUrl: "http://example.test/v1", fetch: fakeFetch as typeof fetch });
  const decision = await mind.decide({
    bee: null as any,
    view: "CELL",
    actions: [{
      name: "resolve",
      describe: "finish",
      locks: [],
      input: [{ name: "outcome", type: "string", required: true }, { name: "summary", type: "string", required: true }],
      available: true,
      example: {},
    }],
  });
  assert.deepEqual(decision, { action: "resolve", args: { outcome: "succeeded", summary: "ok" } });
});
