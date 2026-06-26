import { test } from "node:test";
import assert from "node:assert/strict";
import { cell, cellKit, text, type ActionView, type Cell, type Mind, type RunEvent } from "../src/framework/index.ts";
import { makeBee, runBee, type RunEnv } from "../src/framework/runtime.ts";
import { tuiRenderer } from "../src/framework/renderers/tui.ts";

const ROOT_GOAL = "find the thing";
const CHILD_GOAL = "inspect deeper for the thing";

type S = { name: string };
const k = cellKit<S>();

const mockCell: Cell<S, S> = cell<S, S>("mock.cell", {
  enter: (input) => input,
  show: (s) => `<mock name="${s.name}" />`,
  does: {
    look: k.action({ describe: "look around", run: (_args, ctx) => ctx.observe(`looked at ${ctx.state.name}`) }),
    scribble: k.action({ describe: "write something", locks: ["write"], run: (_args, ctx) => ctx.observe("scribbled") }),
    descend: k.action({
      describe: "send a child bee",
      input: { goal: text("child goal") },
      run: async ({ goal }, ctx) => {
        const result = await ctx.spawn(mockCell, { name: "child" }, goal);
        ctx.observe(`child returned ${result.outcome}`);
      },
    }),
  },
});

const env = (over: Partial<RunEnv> = {}): RunEnv => ({
  renderer: tuiRenderer,
  beeTypes: { scout: ["read"], worker: ["read", "write"] },
  context: {},
  maxSteps: 20,
  ...over,
});

test("locks gate which actions a bee can see", async () => {
  const seen: Record<string, ActionView | undefined> = {};
  const probe = (key: string): Mind => ({
    async decide({ actions }) {
      seen[key] = actions.find((a) => a.name === "scribble");
      assert.ok(actions.some((a) => a.name === "resolve" && a.available), "resolve is injected");
      return { action: "resolve", args: { outcome: "succeeded", summary: "done" } };
    },
  });

  await runBee(makeBee(ROOT_GOAL, ["read"], probe("scout")), mockCell, { name: "root" }, [], env());
  await runBee(makeBee(ROOT_GOAL, ["read", "write"], probe("worker")), mockCell, { name: "root" }, [], env());

  assert.equal(seen.scout?.available, false, "a bee without the write key can't open the write-locked action");
  assert.match(seen.scout?.unavailableReason ?? "", /write/);
  assert.equal(seen.worker?.available, true, "a bee carrying the write key can");
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
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].result?.outcome, "not_found");
  assert.equal(root.children[0].localLog.length, 0);
  assert.ok(root.localLog.some((e) => e.text.includes("looked at root")));

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
  assert.ok(root.localLog.some((e) => e.text.includes("repeated")));
});

test("hitting the step cap yields a blocked result", async () => {
  const mind: Mind = { async decide() { return { action: "look", args: {} }; } };
  const root = makeBee(ROOT_GOAL, ["read"], mind);
  const result = await runBee(root, mockCell, { name: "root" }, [], env({ maxSteps: 3 }));
  assert.equal(result.outcome, "blocked");
});

test("a cell that defines a reserved 'resolve' action is rejected", async () => {
  const bad = cell<S, S>("bad.cell", {
    enter: (input) => input,
    show: () => "",
    does: { resolve: k.action({ describe: "shadows the injected resolve", run: () => {} }) },
  });
  const mind: Mind = { async decide() { return { action: "resolve", args: { outcome: "succeeded", summary: "x" } }; } };
  await assert.rejects(
    () => runBee(makeBee(ROOT_GOAL, ["read"], mind), bad, { name: "root" }, [], env()),
    /reserved action "resolve"/,
  );
});

test("a bee cannot spawn a child with keys it doesn't hold (attenuation)", async () => {
  const escalator = cell<S, S>("escalator", {
    enter: (input) => input,
    show: () => "",
    does: {
      escalate: k.action({
        describe: "try to spawn a write-capable bee from a read-only bee",
        run: async (_args, ctx) => {
          await ctx.spawn(mockCell, { name: "child" }, "child goal", { keys: ["read", "write"] });
        },
      }),
    },
  });
  const events: RunEvent[] = [];
  let n = 0;
  const mind: Mind = {
    async decide() {
      n++;
      return n === 1 ? { action: "escalate", args: {} } : { action: "resolve", args: { outcome: "blocked", summary: "done" } };
    },
  };
  const root = makeBee(ROOT_GOAL, ["read"], mind); // read-only
  await runBee(root, escalator, { name: "root" }, [], env({ onEvent: (e) => events.push(e) }));

  assert.equal(root.children.length, 0, "the escalated child was never created");
  assert.ok(events.some((e) => e.type === "error" && /exceed/.test(e.message)), "escalation fails loud");
});

test("run context is readable by every bee and inherited by children", async () => {
  const seen: unknown[] = [];
  type D = { depth: number };
  const kd = cellKit<D>();
  const reader: Cell<D, D> = cell<D, D>("reader", {
    enter: (input) => input,
    show: () => "",
    does: {
      peek: kd.action({
        describe: "read the run context, then maybe go deeper",
        run: async (_args, ctx) => {
          seen.push(ctx.context.userId);
          ctx.observe("peeked");
          if (ctx.state.depth > 0) await ctx.spawn(reader, { depth: ctx.state.depth - 1 }, "deeper");
        },
      }),
    },
  });
  const mind: Mind = {
    async decide({ bee }) {
      return bee.localLog.length === 0
        ? { action: "peek", args: {} }
        : { action: "resolve", args: { outcome: "succeeded", summary: "ok" } };
    },
  };

  const root = makeBee("read it", ["read"], mind);
  await runBee(root, reader, { depth: 1 }, [], env({ context: { userId: "u_123" } }));

  assert.deepEqual(seen, ["u_123", "u_123"], "the root and its inherited child both saw the context");
});
