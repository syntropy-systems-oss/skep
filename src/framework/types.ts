// The result a bee returns — the only value that crosses a bee boundary.
export type GoalOutcome = "succeeded" | "partial" | "not_found" | "blocked" | "failed";

export interface GoalResult {
  outcome: GoalOutcome;
  summary: string;
}

export interface LogEntry {
  role: "model" | "observation";
  text: string;
}

export type BeeStatus = "open" | "resolved";

// The one actor. A queen, a scout, a worker — all of these are bees; the only
// difference is the capabilities they carry and the mind that drives them.
export interface Bee {
  id: string;
  goal: string;
  capabilities: string[];
  mind: Mind;
  status: BeeStatus;
  localLog: LogEntry[];
  result?: GoalResult;
  children: Bee[];
}

// A comb is what a run weaves: the root bee (the queen) and her tree.
export interface Comb {
  queen: Bee;
  result: GoalResult;
  budgetUsed: number;
}

// What a bee can see when it decides: its ancestors' goals (the lexical contract),
// its own goal, the results its children returned, and its own local history.
export interface BeeView {
  ancestorGoals: string[];
  goal: string;
  childResults: GoalResult[];
  localLog: LogEntry[];
}

import type { Markup } from "./markup.ts";

// Cell / action authoring.
export type MaybePromise<T> = T | Promise<T>;

// What a cell renders: structured Markup (from `xml`) or a plain string.
export type Content = Markup | string;

export type InputKind = "string" | "number" | "boolean";

export interface InputField {
  name: string;
  type: InputKind;
  description?: string;
  required?: boolean;
}

export interface ActionSpec {
  name: string;
  description: string;
  requires?: string[]; // capabilities a bee must carry to see this action
  input?: InputField[];
}

export interface ActionView extends ActionSpec {
  available: boolean;
  unavailableReason?: string;
  example: Record<string, unknown>;
}

export type Availability = boolean | string;

export interface SpawnOptions {
  as?: string; // a bee-type preset name (resolved against the skep's bee types)
  capabilities?: string[]; // explicit capabilities, overrides `as`
  mind?: Mind; // give the child a different mind (e.g. a different model)
}

export interface ActionContext<S> {
  bee: Bee;
  readonly state: S;
  update(patch: Partial<S> | ((state: S) => S)): void;
  observe(text: string): void;
  spawn<I>(cell: Cell<any, I>, input: I, goal: string, opts?: SpawnOptions): Promise<GoalResult>;
  resolve(result: GoalResult): Promise<GoalResult>;
  fail(message: string): never;
}

export interface ActionDefinition<S = unknown> extends ActionSpec {
  available?: (ctx: { bee: Bee; state: S }) => MaybePromise<Availability>;
  run(args: Record<string, unknown>, ctx: ActionContext<S>): MaybePromise<void>;
}

export interface Cell<S = unknown, I = unknown> {
  id: string;
  description?: string;
  setup(input: I): MaybePromise<S>;
  content(state: S): Content;
  actions(ctx: { bee: Bee; state: S }): MaybePromise<ActionDefinition<S>[]>;
}

export interface CellRegistration<S = unknown, I = unknown> {
  id: string;
  cell: Cell<S, I>;
  input: I;
  description?: string;
  as?: string; // default bee-type for bees dispatched into this cell
}

// The mind — the one model seam. A bee decides; everything it "authors" (a child's
// goal, its own result) is just arguments of the action it decides to take.
export interface Decision {
  action: string;
  args: Record<string, unknown>;
}

export interface DecideContext {
  bee: Bee;
  view: string; // the rendered cell the bee is looking at
  actions: ActionView[];
}

export interface Mind {
  decide(ctx: DecideContext): Promise<Decision>;
}

// The interface: how a bee's view becomes the text its mind reads. This is the
// single most important variable to experiment on — so it's swappable.
export type Renderer = (view: BeeView, content: Content, actions: ActionView[]) => string;

// Run observability — the intrinsic lifecycle, nothing more.
export type RunEvent =
  | { type: "enter"; bee: Bee; cell: string; depth: number }
  | { type: "view"; bee: Bee; cell: string; depth: number; view: string }
  | { type: "action"; bee: Bee; name: string; args: Record<string, unknown> }
  | { type: "observe"; bee: Bee; text: string }
  | { type: "spawn"; parent: Bee; child: Bee; cell: string; goal: string }
  | { type: "resolve"; bee: Bee; result: GoalResult }
  | { type: "error"; bee: Bee; name: string; message: string };

export interface RunOptions {
  budget?: number;
  maxSteps?: number;
  onEvent?: (e: RunEvent) => void;
}
