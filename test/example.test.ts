// Integration coverage: drives the code-browser example (its filesystem cells + scripted
// mind) through skep().run(), offline and deterministically.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skep, registerCell, type RunEvent } from "../src/framework/index.ts";
import { folderCell } from "../examples/code-browser/cells/fs/index.ts";
import { mockMind } from "../examples/code-browser/mock-mind.ts";

function plantRepo(root: string): void {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "src/menu-items"), { recursive: true });
  writeFileSync(
    join(root, "src/menu-items/dashboard.js"),
    "import { IconAffiliate } from '@tabler/icons-react';\nexport default { icon: IconAffiliate };\n",
  );
}

test("queen dispatches a scout, which opens a file, and the answer bubbles up", async () => {
  const root = join(tmpdir(), "skep-example-test");
  plantRepo(root);

  const events: RunEvent[] = [];
  const hive = skep({
    cells: [registerCell(folderCell(), { root, path: "." }, { description: "Inspect the test repo", as: "scout" })],
    mind: mockMind(),
  });

  const comb = await hive.run("Where is the dashboard icon defined?", { onEvent: (e) => events.push(e) });

  assert.equal(comb.result.outcome, "succeeded", "the run resolved");
  assert.match(comb.result.summary, /tabler/i, "summary names the icon library");
  assert.equal(comb.queen.children.length, 1, "queen dispatched one bee");
  assert.equal(comb.queen.children[0].children.length, 1, "the folder bee opened one file bee");

  assert.ok(events.some((e) => e.type === "enter" && e.cell === "skep.entry"), "queen entered the generated entry cell");
  assert.ok(events.some((e) => e.type === "spawn" && e.cell === "fs.folder"), "a bee was spawned into the folder cell");
  assert.ok(events.some((e) => e.type === "spawn" && e.cell === "fs.file"), "a bee was spawned into the file cell");
});

test("a read-only scout never runs a write action (none exist here, but the gate holds)", async () => {
  const root = join(tmpdir(), "skep-example-caps-test");
  plantRepo(root);

  const hive = skep({
    cells: [registerCell(folderCell(), { root, path: "." }, { as: "scout" })],
    mind: mockMind(),
  });
  const comb = await hive.run("Where is the dashboard icon defined?");

  // The dispatched bee carried scout capabilities (read only).
  assert.deepEqual(comb.queen.children[0].capabilities, ["read"]);
});
