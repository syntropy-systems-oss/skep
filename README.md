<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/syntropy-systems-oss/skep/main/assets/logo-dark.png">
    <img alt="Skep" src="https://raw.githubusercontent.com/syntropy-systems-oss/skep/main/assets/logo-light.png" width="120" height="120">
  </picture>
</p>

# Skep

Skep is a small framework for agent runs built from one idea: **everything is a bee.**

A bee carries a *goal*, a *mind* (what it decides with), and a set of *keys*. It
enters a **cell** — a reusable room that renders content and offers actions — looks at
what it sees, and acts. It can send child bees into other cells with their own goals, and
it finishes by resolving with a result. The first bee is the **queen**; she orchestrates.
A run weaves a **comb**: the queen and her tree of bees.

That's the whole model. A scout, a worker, the queen — all bees; the only difference is
the keys they carry and the mind that drives them. There is one model seam (the
mind decides), one permission gate (locks & keys), and one thing that crosses a bee
boundary (its result).

The package has **zero runtime dependencies.**

## Install

```bash
npm install @syntropy-systems/skep
```

## Authoring cells

A cell is a room: `enter` it (set up state), `show` it (render), and `does` (its
affordances). One cell per file, laid out so each concern is edited on its own — state,
then show, then the action cards, then the assembly. You never write a `resolve` action —
the runtime injects one into every cell. Values interpolated with `xml` are escaped by
default; nested `xml` passes through, and `raw()` injects trusted markup.

Each action declares `locks` (the keys a bee must carry to see it — every lock) and an
`input` schema; the handler's args are **typed from that schema**, no parsing. "Opening"
something is never special-cased — it's just `ctx.spawn` into another cell, so a **message
is its own cell**:

```ts
import { cell, cellKit, text, xml } from "@syntropy-systems/skep";

type Mailbox = { name: string; results: Email[] };
const k = cellKit<Mailbox>();              // binds ctx.state to Mailbox in every handler

// ── state ──
const enter = ({ name }: { name: string }): Mailbox => ({ name, results: [] });

// ── show ──
const show = (s: Mailbox) => xml`
  <mailbox name="${s.name}">
    ${s.results.map((e) => xml`<email id="${e.id}" subject="${e.subject}" />`)}
  </mailbox>
`;

// ── does ──
const search = k.action({
  describe: "Search this mailbox.",
  input: { query: text("search query") },  // declare the shape → run's args are typed
  run: ({ query }, ctx) => {               // query: string
    ctx.update({ results: searchMailbox(query) });
    ctx.observe(`found ${ctx.state.results.length} emails`);
  },
});

const archive = k.action({
  describe: "Archive a message.",
  locks: ["write"],                        // a bee sees this only if it carries the write key
  input: { id: text("email id") },
  run: ({ id }, ctx) => archiveEmail(id),
});

const open = k.action({
  describe: "Send a bee into a message to read it.",
  input: { id: text("email id"), goal: text("goal for the bee you send") },
  run: async ({ id, goal }, ctx) => {
    const r = await ctx.spawn(message, { id }, goal);   // `message` is another cell
    ctx.observe(`reader returned [${r.outcome}] ${r.summary}`);
  },
});

// ── assembly ──
export const mailbox = cell<Mailbox, { name: string }>("mailbox", {
  enter,
  show,
  does: { search, archive, open },
});
```

Agents will write cells too — so the shape *is* the prompt. The full authoring guide ships
in the package as [`llms.txt`](./llms.txt).

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
just key presets — `scout → ["read"]`, `worker → ["read", "write"]` — and you can
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
built-in permission system beyond lock-and-key actions.** Keys only ever *attenuate*: a bee
can only spawn children with a subset of its own keys, so privilege can't escalate down the
tree. Cross-cutting request data (user id, auth, tenant) rides in **run context** —
`run(prompt, { context })`, immutable, readable by every bee as `ctx.context`.

Still: when you run an agent against untrusted input or in an autonomous loop, the *process
boundary* is your real security boundary. The included `Dockerfile` shows a locked-down
pattern (`--cap-drop ALL`, `--read-only`, `--security-opt no-new-privileges`, no docker
socket). See [SECURITY.md](./SECURITY.md).

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
