# Roadmap

Skep is pre-1.0 — the API moves on the `0.x` line. This is a living sketch of where the hive
is headed, not a promise. Ideas graduate from a note here into a release when they're ripe.

## Now

**0.2.0 — governance & context** _(built on `feat/governance-context-0.2.0`, pending release)_
- Key attenuation in `spawn` (a bee can only spawn children with a subset of its own keys).
- Run-level immutable context (`run(prompt, { context })` → `ctx.context`).
- `observe` cleanup; `enter` stays a reference-constructor (decided).

## Next — strong candidates, unscheduled

- **Pollen** — a write-only, append-only side-channel a bee fills with the *nitty-gritty* it
  found (refactor sites, "this line will need updating", caveats) and returns *alongside* its
  result. The result is the honey (the answer); pollen is the raw material the parent can use
  before moving on. Scoped per-bee and returned up the tree — **not** a global blackboard.
- **Auth abstraction** — built on run context; identity in, policy at the cell/lock boundary.
- **Extensibility / plugin hooks** — lifecycle hooks, custom renderers/minds, third-party cells.
- **Readonly bee to minds & events** — hand out a snapshot, not the live mutable bee.
- **Per-action input schema seam** — richer/validated inputs, bring-your-own-validator, zero-dep.

## Bigger bets — themes, partly shaped

- **Parallelism — `many()` / async bees.** Fire bees and keep going instead of blocking on
  each. Needs: a **sleep/poll** primitive (nap until a bee returns or time expires, then
  decide), and **layered budgets** — a global bee budget *and* a per-bee max-concurrent.
- **Bees-per-cell capacity + stigmergy.** A cell caps how many bees it holds at once. `file`
  cell = 1 → no two agents clobber the same file. This is the World-Isolation Law made *local*
  — a decentralized concurrency guard with no global state. Co-located bees coordinate
  *through the cell* (stigmergy — the room is the shared medium, the way real bees use the
  comb), never a global blackboard; the capacity cap is what keeps that bounded. A bee
  arriving at an occupied cell sees the resident's goals; conflicts flag and bubble up.
- **Persistent bees.** A second lifecycle alongside transient task bees (spawn → resolve →
  die): long-lived, ambient bees that patrol the hive — the natural home for the meta-layer
  (immune watcher, learning curator, the cell-rewriting meta-bee). They may roam between cells,
  *if* they carry a distilled gist (mission + pollen), not an accumulating transcript — that's
  what keeps roaming on the space side, not the time side. Makes lifecycle + resource budgets
  load-bearing (a persistent bee is a daemon).
- **Conflict bubbling.** When sibling bees collide (same cell, contradictory work), the
  conflict surfaces to their **lowest common ancestor**, which decides and sends a resolution
  back down. The tree gives you the coordination point for free.
- **Persistence, resume & counterfactual replay.** Serialize a comb; pause/resume; *re-run from
  a saved state* asking "if the description said X instead of Y, would the bees do better?"
  Clean for the functional control flow; effectful writes need world-forking, not reversal.
- **Observability & Wind Tunnel.** The event stream → tracing/audit/replay; Wind Tunnel imports
  skep and measures renderer "arms" — counterfactual replay *is* an arm comparison.
- **World isolation.** Sandbox / fork the effectful world (git worktrees, containers) so
  parallel writers and replay don't clobber. The cross-cutting enabler under most of the above.

### Open philosophical fork
- **A bee moving between cells while keeping its history.** Tempting — but a bee that
  accumulates a transcript as it roams is *time* creeping back in. The spawn-a-fresh-child model
  is what keeps context small and local (the thesis). Flagged, not adopted: resolve the tension
  before building it.

## Research themes — big, unshaped, need experimentation

### Swarm immune system — decentralized prompt-injection defense
Real bees can replace the queen. Apply it to safety:
- A **red-alert** primitive: any bee (or the queen) flags "this doesn't feel like something I
  should be doing."
- Trace the **infected path** via the audit trail (who spawned what, what they touched);
  **quarantine** a subtree rather than killing it.
- **Quorum / queen rotation:** each bee is asked *in isolation* — "does this goal align with
  yours?" — with minimal context, so the injection can't coordinate the deception. Vote to
  rotate the queen and remove bees on the infected path.
- Honest caveat: the verifier can be injected too. This is defense-in-depth, never "solved" —
  but lexical isolation + an audit trail + isolated-context voting raises the bar a lot. The
  decentralization is the point: it makes a single injection hard to hide across the swarm.

### The hive that learns — a meta-process over combs
- Self-learning loops: a bee writes down what it learned (à la skill-writing).
- A meta-process takes a comb's state and asks counterfactuals — where do bees hit friction,
  where's redundancy, what would a different description have produced? — and rearranges the
  space accordingly.
- The system improving over time, not just agents orchestrating agents. Define the **degrees of
  freedom** (what the meta-process may change: descriptions, renderers, cell structure, goals).

### Specialized & RL-trained bee models
The mind is already per-bee, so a bee can run a small task-specialized or RL-tuned model while
its siblings run a general one. The plumbing exists; the research is the training loop and the
data (combs make good trajectories).

### Policy everywhere
Generalize lock/key + run-context governance into a policy seam at *every* boundary — spawn,
action, cell entry. The spawn attenuation check is the first instance of a much larger surface.

## North star — the growing, self-organizing hive

The horizon everything points at. Deliberately unshaped — this needs experimentation, not a spec.

- **Bees make cells; queens make queens.** A self-extending system, not a static one.
- **A meta-bee edits cell code in place** when an action keeps misbehaving — possible *because*
  the cell file format is consistent and agent-authorable (the thing we built in 0.1.0). A cell
  is just dependency-free TypeScript; a growing functional space — deterministic code around
  tool/MCP results, each cell its own little application.
- **The starter hive — grow from usage, not configuration.** Onboarding isn't a config
  wizard; you just *use* the system and it grows around your workflow and requests. **Drop-in
  hives** are seeds: a starter, a *coder* hive whose bees swarm the codebase and build a
  knowledge base, etc.
- **The meta-hive.** How the hive grows should itself be a shapeable, growing abstraction — not
  a sealed mechanism. Persistent meta-bees in meta-cells you can reach in and edit; bees that
  tend bees, and you can rewrite the tending. The growth loop is recursive.
- **Why it's even possible: space, not time.** You can rearrange, add, remove, and combine
  *space*; you can't rearrange a transcript. The thesis pays off hardest up here.
- Hard part (the reason it's not today): the primitive of "what *is* a new cell" — codegen +
  safe execution. Maybe everything is a filesystem and a cell is an abstraction over it.

## Cross-cutting enablers (the substrate the big ideas share)

The reason this list is shorter than it looks — most of the vision rides on a few primitives:

- **Audit trail + lexical isolation + the tree** → trace & quarantine an infected path, and
  "bubble a conflict to the lowest common ancestor." (immune system, conflict resolution)
- **A consistent, agent-authorable cell format** → self-modifying cells, growing combs.
  (growing hive, meta-bee)
- **Comb serialization** → restore, replay, rewind, quarantine. (learning, immune system)
- **World isolation (sandbox/worktree)** → safe parallel writers and clean replay.
- **Per-bee minds** → specialized / RL-trained bees, and meta-bees with their own brains.
- **Stigmergy through cells (not a global blackboard)** → bee-to-bee coordination that stays
  local and bounded.
- **Space, not time** → all of it.

## Infra

- ✅ CI tests (`ci.yml`) on every push/PR.
- ✅ Automated npm publish on release (OIDC trusted publishing, provenance).

## Open questions

- `locks` "any of" (OR) vs AND-only — model OR by minting a shared key, or add real OR?
- Run context: typed generic (`skep<Ctx>`) vs untyped `Record`?
- Where does a bee's *identity* live for audit — derived from context, or its own field?
- Does pollen accumulate up the subtree, or stay per-bee and returned once?

## Parking lot

_Unsorted brain-dump. Ideas land here first; we sort them later._
