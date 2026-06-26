# Getting started

## Install

```bash
npm install @syntropy-systems/skep
```

Requires Node.js 20+. The package ships ESM with type declarations and has zero runtime
dependencies.

## Your first skep

A run needs three things: **cells** to work in, a **mind** to decide, and a **prompt**.

```ts
import { skep, registerCell, cell, cellKit, text, xml } from "@syntropy-systems/skep";
import { llmMind } from "@syntropy-systems/skep/agents/llm";

type Notes = { items: string[] };
const k = cellKit<Notes>();

// ── state ──
const enter = ({ items }: { items: string[] }): Notes => ({ items });

// ── show ──
const show = (s: Notes) => xml`
  <notes>${s.items.map((n, i) => xml`<note id="${i}">${n}</note>`)}</notes>
`;

// ── does ──
const add = k.action({
  describe: "Append a note.",
  locks: ["write"],                       // only a bee carrying the write key sees this
  input: { note: text("note text") },
  run: ({ note }, ctx) => {               // note: string
    ctx.update((s) => ({ items: [...s.items, note] }));
    ctx.observe(`added: ${note}`);
  },
});

// ── assembly ──
const notes = cell<Notes, { items: string[] }>("notes", { enter, show, does: { add } });

const hive = skep({
  cells: [registerCell(notes, { items: ["buy honey"] }, { as: "worker" })],
  mind: llmMind(),
});

const comb = await hive.run("Add a note reminding me to refill the feeder.");
console.log(comb.result.outcome, "—", comb.result.summary);
```

A bee never sees the `add` action unless it carries the `write` key — here the cell is
registered `as: "worker"` (holds `read` + `write`). A `scout` (only `read`) would see the
`notes` cell but not `add`. The `resolve` action is injected automatically, so the bee can
always finish.

## Pointing at a model

`llmMind()` talks to any OpenAI-compatible chat-completions endpoint. Configure it per
instance, or via environment variables:

| Variable          | Default                    | Purpose                                     |
| ----------------- | -------------------------- | ------------------------------------------- |
| `OPENAI_BASE_URL` | `http://localhost:8080/v1` | Base URL of the endpoint.                   |
| `SKEP_MODEL`      | `local-model`              | Model id sent in each request.              |
| `OPENAI_API_KEY`  | *(unset)*                  | Sent as `Authorization: Bearer …`.          |

```ts
const mind = llmMind({ baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY });
```

Because the mind lives on the bee, different bees can run different models — pass a stronger
one when you spawn a reviewer: `ctx.spawn(cell, input, goal, { mind: llmMind({ model: "..." }) })`.

## No model? Run the mock

Every decision point is just a `Mind`, so you can drive a run with no network at all — a
scripted policy that returns canned decisions. The repo's code-browser example ships one:

```bash
npm run run:mock   # deterministic, offline
```

## Watching it work

Pass `onEvent` to see the lifecycle (and `createDebugTui` to see the exact text each bee
reads before deciding):

```ts
import { createDebugTui } from "@syntropy-systems/skep/debug/tui";

await hive.run(prompt, { onEvent: createDebugTui(), budget: 25, maxSteps: 8 });
```
