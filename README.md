# Skep

Skep is a small framework for agent runs built from one idea: **everything is a bee.**

A bee carries a *goal*, a *mind* (what it decides with), and a set of *capabilities*. It
enters a **cell** — a reusable room that renders content and offers actions — looks at
what it sees, and acts. It can send child bees into other cells with their own goals, and
it finishes by resolving with a result. The first bee is the **queen**; she orchestrates.
A run weaves a **comb**: the queen and her tree of bees.

That's the whole model. A scout, a worker, the queen — all bees; the only difference is
the capabilities they carry and the mind that drives them. There is one model seam (the
mind decides), one permission gate (capabilities), and one thing that crosses a bee
boundary (its result).

The package has **zero runtime dependencies.**

## Install

```bash
npm install @syntropy-systems/skep
```

## Authoring cells

A cell is a room: it renders content and offers actions. Actions declare what capability
they require; a bee only sees an action if it carries that capability. You never write a
`resolve` action — the runtime injects one into every cell. Values interpolated with `xml`
are escaped by default; nested `xml` fragments pass through untouched, and `raw()` injects
trusted markup verbatim.

"Opening" something is never special-cased — it's just sending a bee into another cell.
Here a mailbox cell opens individual messages, and a **message is its own cell**:

```ts
import { action, cell, stringInput, xml } from "@syntropy-systems/skep";

// A message is a cell too — a room a bee enters to read one email.
const message = cell("message", {
  description: "Read a single email message.",
  setup: ({ id }: { id: string }) => ({ id, email: loadEmail(id) }),
  content: (state) => xml`
    <message id="${state.id}" from="${state.email.from}" subject="${state.email.subject}">
      ${state.email.body}
    </message>
  `,
  actions: () => [],                             // nothing to do but read, then resolve
});

const mailbox = cell("mailbox", {
  description: "Search a mailbox and open individual messages.",
  setup: ({ name }: { name: string }) => ({ name, results: [] as Email[] }),
  content: (state) => xml`
    <mailbox name="${state.name}">
      ${state.results.map((email) => xml`<email id="${email.id}" subject="${email.subject}" />`)}
    </mailbox>
  `,
  actions: () => [
    action("search", {
      description: "Search this mailbox.",
      input: [stringInput("query", "Search query")],
    }, async ({ query }, ctx) => {
      const results = await searchMailbox(String(query));
      ctx.update({ results });
      ctx.observe(`Found ${results.length} emails.`);
    }),

    action("archive", {
      description: "Archive a message.",
      requires: ["write"],                       // only a bee carrying "write" sees this
      input: [stringInput("id", "Email id")],
    }, async ({ id }, ctx) => {
      await archive(String(id));
      ctx.observe(`Archived ${id}.`);
    }),

    action("open", {
      description: "Send a bee into a message to read it.",
      input: [stringInput("id", "Email id"), stringInput("goal", "Goal for the bee you send")],
    }, async ({ id, goal }, ctx) => {
      const result = await ctx.spawn(message, { id: String(id) }, String(goal));
      ctx.observe(`Reader returned [${result.outcome}] ${result.summary}`);
    }),
  ],
});
```

## Running a skep

Build a skep — cells, a mind, and (optionally) a renderer — then run it. `run` returns the
comb the bees wove. The mind is required and explicit: it's the bee's brain, so it's a
choice you make, not a default. `llmMind` lives in the agent layer (`@syntropy-systems/skep/agents/llm`)
precisely because the core knows nothing about LLMs — swap in a mock, a scripted policy, or
your own provider and the engine doesn't change.

```ts
import { skep, registerCell } from "@syntropy-systems/skep";
import { llmMind } from "@syntropy-systems/skep/agents/llm";

const hive = skep({
  cells: [registerCell(mailbox, { name: "support" }, { as: "scout" })],
  mind: llmMind(),
  // renderer defaults to the built-in; swap it to experiment on the interface
});

const comb = await hive.run("find the thread where the customer threatened to churn");

comb.result;            // the GoalResult: { outcome, summary }
comb.queen.children;    // the tree of bees
```

`run` generates the queen's entry cell automatically: it lists the registered cells and
lets her `dispatch` a bee into one with a self-contained goal. `scout` and `worker` are
just capability presets — `scout → ["read"]`, `worker → ["read", "write"]` — and you can
define your own via `beeTypes`.

## The mind

A mind has exactly one method: `decide`. It looks at the rendered cell and the available
actions and returns the next action with its arguments. Everything a bee "authors" — a
child's goal, its own result summary — is just an action argument.

If you've done any RL or agent work: **a mind is the agent's policy** — a pure function
from observation (the rendered cell) to action. So you don't implement an LLM to use
Skep; `llmMind()` is a ready-made policy. You only write a `Mind` when you want a
*different* policy — a mock, a heuristic, a different provider, a router across models.

```ts
import type { Mind } from "@syntropy-systems/skep";

const echoMind: Mind = {
  async decide({ view, actions }) {
    // ...inspect `view`, choose from `actions`...
    return { action: "resolve", args: { outcome: "succeeded", summary: "done" } };
  },
};
```

`llmMind()` is the batteries-included implementation, backed by any OpenAI-compatible
chat-completions endpoint and configured by environment variables (read once at load):

| Variable          | Default                    | Purpose                                          |
| ----------------- | -------------------------- | ------------------------------------------------ |
| `OPENAI_BASE_URL` | `http://localhost:8080/v1` | Base URL of the OpenAI-compatible endpoint.      |
| `SKEP_MODEL`      | `local-model`              | Model id sent in each request.                   |
| `OPENAI_API_KEY`  | *(unset)*                  | Sent as `Authorization: Bearer …` when present.  |

Every default is overridable per instance — `llmMind({ baseUrl, model, apiKey, temperature,
maxTokens, system, fetch })` — so two minds can point at two models in one process.
Because the mind lives on the bee, different bees can run different models: give a reviewer
bee a stronger one via `ctx.spawn(cell, input, goal, { mind: llmMind({ model: "..." }) })`.

## Debug TUI

The runtime emits a `view` event with the exact text a bee sees before each decision,
plus the lifecycle around it (enter / action / observe / spawn / resolve / error). The
debug TUI renders that stream:

```ts
import { createDebugTui } from "@syntropy-systems/skep/debug/tui";

const comb = await hive.run(prompt, { onEvent: createDebugTui() });
```

This repo includes a no-network code-browser example:

```bash
npm run tui
```

Run it against a real endpoint:

```bash
OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=sk-... SKEP_MODEL=gpt-4o-mini npm run tui:llm
```

## Security & sandboxing

The runtime executes whatever its cells expose — filesystem, shell, network — with **no
built-in permission system beyond capability-gated actions.** When you run an agent
against untrusted input or in an autonomous loop, the *process boundary* is your security
boundary. The included `Dockerfile` shows a locked-down pattern (`--cap-drop ALL`,
`--read-only`, `--security-opt no-new-privileges`, no docker socket). See
[SECURITY.md](./SECURITY.md).

## Development

Requires Node.js 20+.

```bash
npm install        # installs dev deps and builds dist via the prepare script
npm run build      # esbuild bundles + tsc emits .d.ts into dist/
npm test           # build, then run the node:test suite
npm run verify     # build + typecheck + consumer typecheck + tests (CI gate)
npm run run:mock   # run the code-browser example with no network
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project layout, conventions, and releasing,
and [CHANGELOG.md](./CHANGELOG.md) for release notes.

## License

[Apache-2.0](./LICENSE)
