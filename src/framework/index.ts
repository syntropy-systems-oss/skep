/**
 * @packageDocumentation
 * Skep — space, not time, as the agent's workspace.
 *
 * A run is not a growing transcript; it's a walk through a state machine. A **bee** is in a
 * **cell** (a room): it sees that room, its goal, and what its sub-bees returned — then it
 * acts, or sends another bee into another cell, or resolves with a result. The queen is the
 * root bee; a run weaves a **comb**.
 *
 * New here? To write a cell, see {@link cell} and {@link action}. The full authoring guide
 * (and the mental-model shift) lives in `llms.txt` at the package root.
 */
export { xml, showIf, raw } from "./markup.ts";
export type { Markup } from "./markup.ts";
export { ActionFailure } from "./runtime.ts";
export { skep } from "./skep.ts";
export { action, cell, cellKit, registerCell, text, num, flag, optional } from "./cell.ts";

export type { Skep, SkepConfig } from "./skep.ts";

export type {
  Action,
  ActionContext,
  ActionView,
  ArgsOf,
  Availability,
  Bee,
  BeeStatus,
  BeeView,
  Cell,
  CellRegistration,
  Comb,
  Content,
  Context,
  DecideContext,
  Decision,
  Does,
  Field,
  FieldType,
  GoalOutcome,
  GoalResult,
  InputField,
  InputSchema,
  MaybePromise,
  Mind,
  Renderer,
  RunEvent,
  RunOptions,
  SpawnOptions,
} from "./types.ts";
