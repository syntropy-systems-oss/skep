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
import { skep, registerCell, cell, action, stringInput, xml } from "@syntropy-systems/skep";
import { llmMind } from "@syntropy-systems/skep/agents/llm";

// A cell: a room that renders content and offers actions.
const notes = cell("notes", {
  description: "A scratch space of short notes.",
  setup: ({ items }: { items: string[] }) => ({ items }),
  content: (state) => xml`
    <notes>
      ${state.items.map((n, i) => xml`<note id="${i}">${n}</note>`)}
    </notes>
  `,
  actions: () => [
    action("add", {
      description: "Append a note.",
      requires: ["write"],
      input: [stringInput("text", "Note text")],
    }, async ({ text }, ctx) => {
      ctx.update((s) => ({ items: [...s.items, String(text)] }));
      ctx.observe(`Added: ${text}`);
    }),
  ],
});

const hive = skep({
  cells: [registerCell(notes, { items: ["buy honey"] }, { as: "worker" })],
  mind: llmMind(),
});

const comb = await hive.run("Add a note reminding me to refill the feeder.");
console.log(comb.result.outcome, "—", comb.result.summary);
```

A bee never sees a write action unless it carries the `write` capability — here the cell is
registered `as: "worker"` (read + write). A `scout` (read only) would see `notes` but not
`add`. The `resolve` action is injected automatically, so the bee can always finish.

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
