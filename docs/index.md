# Skep

**Space as the agent's workspace.**

Most LLM agents live in *time*. Every tool call, observation, and stray thought is
appended to one ever-growing transcript. The agent's memory is a timeline that only gets
longer; its attention is "everything that has happened, in order." Nothing else works this
way — no human carries every pixel of every page they've ever read. They carry the *gist*,
and they move on.

Skep gives the agent *space* instead.

A **bee** is somewhere — inside a **cell**, a room that renders what's there and offers a
few actions. The bee sees that room, its goal, and what its scouts brought back — not the
world's transcript. To go deeper it doesn't grow a log; it **sends another bee into another
cell**. The run isn't a timeline. It's a **comb** the bees build as they go.

> The default agent remembers everything and goes nowhere.
> A skep agent holds a small, local view — and *moves*.

## Why the shift matters

The dominant variable in agent performance is the **interface** — what gets painted into
the model's context each turn — not raw model smarts. Treating the workspace as space makes
that interface deliberate:

- **Context stays small and local.** A bee sees its current cell, its path back to the
  queen, and the results its own children returned. Not the whole history — exactly a
  function's view of its own call chain.
- **Parallelism is free.** Sibling bees explore different cells, blind to each other. There
  is no shared blackboard to corrupt; isolation falls out of the model rather than being
  bolted on.
- **Distillation is the default.** A bee finishes by resolving with a *result* — a takeaway
  — not a transcript. The detail stays in the cell; only the answer travels up the comb.

## The whole model, on one page

There is one actor: the **bee**. It carries a **goal**, a **mind** (its policy: decide
observation → action), and a set of **keys**. The **queen** is just the root bee.

```ts
import { skep, registerCell } from "@syntropy-systems/skep";
import { llmMind } from "@syntropy-systems/skep/agents/llm";

const hive = skep({
  cells: [registerCell(mailbox, { name: "support" }, { as: "scout" })],
  mind: llmMind(),
});

const comb = await hive.run("find the thread where the customer threatened to churn");

comb.result;          // the takeaway: { outcome, summary }
comb.queen.children;  // the tree of bees that wove it
```

- **Cell** — a reusable room: renders content, offers lock-gated actions.
- **Bee** — an actor in a cell, pursuing a goal; it can spawn child bees into other cells.
- **Mind** — one method, `decide`; the bee's policy. `llmMind()` is a ready-made one.
- **Comb** — what a run weaves: the queen and her tree of bees.

`resolve` is injected into every cell, so a bee can always finish. The package has **zero
runtime dependencies**.

## Next

- [Getting started](getting-started.md) — install it and run your first skep.
- [The model](the-model.md) — bees, cells, minds, locks & keys, and the comb in depth.
