// Verifies the *published* surface: imports go through the package name "@syntropy-systems/skep"
// (Node self-reference → the built dist + the package.json exports map), so this fails
// if the build is missing, an export path is wrong, or the public API drifts.
import { test } from "node:test";
import assert from "node:assert/strict";

test("root export surface is exactly the curated public API", async () => {
  const mod = await import("@syntropy-systems/skep");

  const expected = [
    "xml", "showIf", "raw",
    "ActionFailure",
    "skep",
    "action", "booleanInput", "cell", "numberInput", "registerCell", "stringInput",
  ].sort();
  const actual = Object.keys(mod).filter((k) => k !== "default").sort();
  assert.deepEqual(actual, expected, "root exports match the curated list");

  // Low-level internals must NOT be part of the public API.
  for (const internal of ["makeBee", "runBee", "failAction", "entryCell", "solve", "makeQueen", "capabilitiesFor"]) {
    assert.equal((mod as Record<string, unknown>)[internal], undefined, `internal "${internal}" is not exported`);
  }
});

test("subpath exports resolve and expose their entry points", async () => {
  const tui = await import("@syntropy-systems/skep/renderers/tui");
  assert.equal(typeof tui.tuiRenderer, "function");

  const briefing = await import("@syntropy-systems/skep/renderers/briefing");
  assert.equal(typeof briefing.briefingRenderer, "function");

  const debug = await import("@syntropy-systems/skep/debug/tui");
  assert.equal(typeof debug.createDebugTui, "function");

  const llm = await import("@syntropy-systems/skep/agents/llm");
  assert.equal(typeof llm.llmMind, "function");
});
