import { test } from "node:test";
import assert from "node:assert/strict";
import { action, cell, stringInput, type ActionView, type Cell, type Mind } from "../src/framework/index.ts";
import { makeBee, runBee, type RunEnv } from "../src/framework/runtime.ts";
import { tuiRenderer } from "../src/framework/renderers/tui.ts";

const ROOT_GOAL = "find the thing";
const CHILD_GOAL = "inspect deeper for the thing";

type S = { name: string };

const mockCell: Cell<S, S> = cell<S, S>("mock.cell", {
  setup: (input) => input,
  content: (state) => `<mock name="${state.name}" />`,
  actions: () => [
    action<S>("look", { description: "look around" }, async (_args, ctx) => {
      ctx.observe(`looked at ${ctx.state.name}`);
    }),
    action<S>("scribble", { description: "write something", requires: ["write"] }, async (_args, ctx) => {
      ctx.observe("scribbled");
    }),
    action<S>("descend", { description: "send a child bee", input: [stringInput("goal", "child goal")] }, async ({ goal }, ctx) => {
      const result = await ctx.spawn(mockCell, { name: "child" }, String(goal));
      ctx.observe(`child returned ${result.outcome}`);
    }),
  ],
});

const env = (over: Partial<RunEnv> = {}): RunEnv => ({
  renderer: tuiRenderer,
  beeTypes: { scout: ["read"], worker: ["read", "write"] },
  maxSteps: 20,
  ...over,
});

test("capabilities gate which actions a bee can see", async () => {
  const seen: Record<string, ActionView | undefined> = {};
  const probe = (key: string): Mind => ({
    async decide({ actions }) {
      seen[key] = actions.find((a) => a.name === "scribble");
      assert.ok(actions.some((a) => a.name === "resolve" && a.available), "resolve is injected and available");
      return { action: "resolve", args: { outcome: "succeeded", summary: "done" } };
    },
  });

  await runBee(makeBee(ROOT_GOAL, ["read"], probe("scout")), mockCell, { name: "root" }, [], env());
  await runBee(makeBee(ROOT_GOAL, ["read", "write"], probe("worker")), mockCell, { name: "root" }, [], env());

  assert.equal(seen.scout?.available, false, "read-only bee cannot run the write action");
  assert.match(seen.scout?.unavailableReason ?? "", /requires write/);
  assert.equal(seen.worker?.available, true, "worker bee can run the write action");
});

test("a child sees ancestor + own goal, not the parent's notes; results bubble up", async () => {
  let childView = "";
  const mind: Mind = {
    async decide({ bee, view }) {
      if (bee.goal === ROOT_GOAL) {
        if (bee.localLog.length === 0) return { action: "look", args: {} };
        if (bee.children.length === 0) return { action: "descend", args: { goal: CHILD_GOAL } };
        return { action: "resolve", args: { outcome: "succeeded", summary: "via child: " + (bee.children[0].result?.summary ?? "?") } };
      }
      if (bee.goal === CHILD_GOAL) {
        childView = view;
        return { action: "resolve", args: { outcome: "not_found", summary: "nothing here" } };
      }
      return { action: "resolve", args: { outcome: "blocked", summary: "unexpected" } };
    },
  };

  const root = makeBee(ROOT_GOAL, ["read"], mind);
  const result = await runBee(root, mockCell, { name: "root" }, [], env());

  assert.equal(result.outcome, "succeeded");
  assert.equal(root.children.length, 1, "root spawned one child");
  assert.equal(root.children[0].result?.outcome, "not_found", "child result bubbled up");
  assert.equal(root.children[0].localLog.length, 0, "child kept its own (empty) log");
  assert.ok(root.localLog.some((e) => e.text.includes("looked at root")), "root kept its own note");

  assert.ok(childView.includes(ROOT_GOAL), "child view shows the ancestor goal");
  assert.ok(childView.includes(CHILD_GOAL), "child view shows its own goal");
  assert.ok(!childView.includes("looked at root"), "child view does not leak the parent's notes");
});

test("repeating the same action with the same input is caught", async () => {
  let n = 0;
  const mind: Mind = {
    async decide() {
      n++;
      return n <= 4 ? { action: "look", args: {} } : { action: "resolve", args: { outcome: "succeeded", summary: "done" } };
    },
  };
  const root = makeBee(ROOT_GOAL, ["read"], mind);
  await runBee(root, mockCell, { name: "root" }, [], env());
  assert.ok(root.localLog.some((e) => e.text.includes("repeated")), "the loop is flagged");
});

test("hitting the step cap yields a blocked result", async () => {
  const mind: Mind = { async decide() { return { action: "look", args: {} }; } };
  const root = makeBee(ROOT_GOAL, ["read"], mind);
  const result = await runBee(root, mockCell, { name: "root" }, [], env({ maxSteps: 3 }));
  assert.equal(result.outcome, "blocked");
});

test("a cell that defines a reserved 'resolve' action is rejected", async () => {
  const bad = cell<S, S>("bad.cell", {
    setup: (input) => input,
    content: () => "",
    actions: () => [action<S>("resolve", { description: "shadows the injected resolve" }, async () => {})],
  });
  const mind: Mind = { async decide() { return { action: "resolve", args: { outcome: "succeeded", summary: "x" } }; } };
  await assert.rejects(
    () => runBee(makeBee(ROOT_GOAL, ["read"], mind), bad, { name: "root" }, [], env()),
    /reserved action name "resolve"/,
  );
});
