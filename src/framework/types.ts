import type { Markup } from "./markup.ts";

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

// The one actor. A queen, a scout, a worker — all bees; they differ only in the keys
// they carry and the mind that drives them.
export interface Bee {
  id: string;
  goal: string;
  keys: string[]; // the locks this bee can open
  mind: Mind;
  status: BeeStatus;
  localLog: LogEntry[];
  result?: GoalResult;
  children: Bee[];
}

// A comb is what a run weaves: the queen (root bee) and her tree.
export interface Comb {
  queen: Bee;
  result: GoalResult;
  budgetUsed: number;
}

export interface BeeView {
  ancestorGoals: string[];
  goal: string;
  childResults: GoalResult[];
  localLog: LogEntry[];
}

// Authoring: cells, actions, and the input schema.
export type MaybePromise<T> = T | Promise<T>;
export type Content = Markup | string;

export type FieldType = "string" | "number" | "boolean";

// A declared input field. `required` is carried in the type so `ArgsOf` can make
// optional fields optional in the handler's args.
export interface Field<T = unknown, R extends boolean = boolean> {
  type: FieldType;
  describe?: string;
  required: R;
  readonly _t?: T;
}

export type InputSchema = Record<string, Field>;

// The handler's args, derived from the input schema: required fields are present,
// optional fields are optional, and each value has the field's declared type.
export type ArgsOf<I extends InputSchema> = Prettify<
  { [K in keyof I as I[K] extends { required: true } ? K : never]: I[K] extends Field<infer T, any> ? T : never } & {
    [K in keyof I as I[K] extends { required: false } ? K : never]?: I[K] extends Field<infer T, any> ? T : never;
  }
>;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export interface ActionContext<S> {
  bee: Bee;
  readonly state: S;
  update(patch: Partial<S> | ((state: S) => S)): void;
  observe(text: string): void;
  spawn<I>(cell: Cell<any, I>, input: I, goal: string, opts?: SpawnOptions): Promise<GoalResult>;
  resolve(result: GoalResult): Promise<GoalResult>;
  fail(message: string): never;
}

export type Availability = boolean | string;

export interface SpawnOptions {
  as?: string; // a bee-type preset name, resolved against the skep's beeTypes
  keys?: string[]; // explicit keys, overrides `as`
  mind?: Mind; // give the child a different mind (e.g. a different model)
}

// An action: an affordance of a cell. `locks` are the keys a bee must carry to see it
// (AND — every lock). `input` is a schema; `run`'s args are inferred from it.
export interface Action<S = unknown, I extends InputSchema = InputSchema> {
  describe: string;
  locks?: string[];
  input?: I;
  available?: (ctx: { bee: Bee; state: S }) => MaybePromise<Availability>;
  run(args: ArgsOf<I>, ctx: ActionContext<S>): MaybePromise<void>;
}

export type Does<S> = Record<string, Action<S, any>>;

// A cell is a room: enter it (set up state), show it (render), and do things in it.
export interface Cell<S = unknown, I = unknown> {
  id: string;
  describe?: string;
  enter(input: I): MaybePromise<S>;
  show(state: S): Content;
  does: Does<S> | ((ctx: { bee: Bee; state: S }) => MaybePromise<Does<S>>);
}

export interface CellRegistration<S = unknown, I = unknown> {
  id: string;
  cell: Cell<S, I>;
  input: I;
  describe?: string;
  as?: string; // default bee-type for bees dispatched into this cell
}

// The mind — the one model seam (a policy: observation → action).
export interface Decision {
  action: string;
  args: Record<string, unknown>;
}

export interface DecideContext {
  bee: Bee;
  view: string;
  actions: ActionView[];
}

export interface Mind {
  decide(ctx: DecideContext): Promise<Decision>;
}

// Normalized, model-facing view of an action (renderers and minds see this, not the
// authoring shape). `input` is flattened to a list for rendering and arg coercion.
export interface InputField {
  name: string;
  type: FieldType;
  describe?: string;
  required: boolean;
}

export interface ActionView {
  name: string;
  describe: string;
  locks: string[];
  input: InputField[];
  available: boolean;
  unavailableReason?: string;
  example: Record<string, unknown>;
}

export type Renderer = (view: BeeView, content: Content, actions: ActionView[]) => string;

// Run observability — the intrinsic lifecycle.
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
