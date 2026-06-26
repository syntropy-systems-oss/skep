# The model

Skep is built from one abstraction — the **bee** — and a handful of nouns that fall out of
treating space, not time, as the workspace. This page is the whole mental model.

## Bee

A bee is the only actor. A queen, a scout, a worker — all bees. A bee carries:

- a **goal** — the self-contained brief it exists to satisfy,
- a **mind** — how it decides (its policy),
- **keys** — the locks it can open (which actions it gets to see),
- and, as it runs: a local log, child bees, and eventually a result.

There is no separate "queen type" or "orchestrator class." The queen is simply the first
bee; orchestration is just a bee dispatching other bees.

## Cell

A cell is a reusable **room**. It renders content (what's in the room) and offers actions
(what you can do here). Cells are pure definitions — `setup`, `content`, `actions` — with no
runtime state of their own; a bee enters a cell with some input and the cell sets up its
state for that visit.

```ts
const folder = cell("fs.folder", {
  enter: (input) => loadFolder(input),
  show: (state) => xml`<folder path="${state.path}">…</folder>`,
  does: { grep, open_file /* … action cards … */ },
});
```

Each action declares its `locks`; a bee only sees an action whose locks its keys can open.
Two different bees can walk into the same cell and see different action lists. The runtime
injects a `resolve` action into every cell, so a bee can always finish — you never write it.

## Mind

A mind has exactly one method:

```ts
interface Mind {
  decide(ctx: { bee; view; actions }): Promise<{ action; args }>;
}
```

If you've done RL or agent work, this is the **policy**: a function from observation (the
rendered cell) to action. Everything a bee "authors" — a child's goal, its own result — is
just an argument of the action it decides to take. There is no separate "now write your
summary" step; the bee writes it in the same breath it chooses `resolve`.

`llmMind()` is a ready-made policy backed by an LLM. A mock is just an object with a
`decide`. Because the mind lives *on the bee*, different bees can think with different models.

## Locks & keys

Governance is lock-and-key, nothing more. An action declares `locks: ["write"]`; a bee
carries `keys` (`["read"]`, or `["read", "write"]`). A bee sees a door iff its keys open
*every* lock (AND). `scout` and `worker` are just key presets (`scout → ["read"]`,
`worker → ["read", "write"]`); define your own via `beeTypes`. That set-membership check —
locks ⊆ keys — *is* the entire permission system. (Need "any of"? Mint a key both roles
carry and lock the door with that one key.)

## Spawning, and the ancestor contract

A bee goes deeper by **spawning** a child into another cell with an explicit goal:

```ts
const result = await ctx.spawn(fileCell, { path }, "Confirm dashboard.js imports IconAffiliate.");
```

The child runs to its own result and returns it. What the child *sees* is deliberately
narrow — its **lexical scope**:

1. the goals of its ancestors (queen → … → me): the contract it's operating under,
2. its own goal,
3. the results its own children returned,
4. its own local log.

A bee never sees its siblings or their logs. This is exactly a function's view of its call
chain — and it's why context stays small and parallel bees can't interfere. The consequence:
**the goal is the only channel into a child.** A parent threads what it learned into the
next child's brief; the parent is the router.

## Comb

A run weaves a **comb**: the queen and her tree of bees, plus the result.

```ts
const comb = await hive.run(prompt);
comb.result;          // GoalResult: { outcome, summary }
comb.queen.children;  // the tree
comb.budgetUsed;
```

A result is intentionally small — an `outcome` (`succeeded | partial | not_found | blocked
| failed`) and a `summary`. The detail lives in the cells the bees visited; only the
takeaway crosses a boundary.

## The interface is swappable

What a bee actually reads is produced by a **renderer** — the function that paints a bee's
view (cell content + goal + child results + actions) into text. It defaults to a built-in,
but it's a first-class, swappable seam, because *the interface is the experiment*: the same
engine and model can behave very differently depending on how the room is drawn. Treating
the workspace as space is the thesis; the renderer is where you tune it.
