import type {
  ActionDefinition,
  ActionView,
  Bee,
  BeeView,
  Cell,
  GoalResult,
  InputField,
  Mind,
  Renderer,
  RunEvent,
  SpawnOptions,
} from "./types.ts";

let _beeId = 0;

export function makeBee(goal: string, capabilities: string[], mind: Mind): Bee {
  return { id: `b${++_beeId}`, goal, capabilities, mind, status: "open", localLog: [], children: [] };
}

export class ActionFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionFailure";
  }
}

export function failAction(message: string): never {
  throw new ActionFailure(message);
}

function buildBeeView(bee: Bee, ancestors: Bee[]): BeeView {
  return {
    ancestorGoals: ancestors.map((a) => a.goal),
    goal: bee.goal,
    childResults: bee.children.filter((c) => c.result).map((c) => c.result as GoalResult),
    localLog: bee.localLog,
  };
}

// The resolve action is injected into every cell: a bee can always finish by naming
// an outcome and a summary. Authors never write it.
const RESOLVE_ACTION: Pick<ActionDefinition, "name" | "description" | "input"> = {
  name: "resolve",
  description: "Finish this bee: report the outcome and a summary that answers the goal.",
  input: [
    { name: "outcome", type: "string", description: "succeeded | partial | not_found | blocked | failed" },
    { name: "summary", type: "string", description: "the answer, or why the goal could not be met" },
  ],
};

const OUTCOMES = ["succeeded", "partial", "not_found", "blocked", "failed"] as const;

// The shared run environment threaded through a bee and its descendants.
export interface RunEnv {
  renderer: Renderer;
  beeTypes: Record<string, string[]>;
  budget?: { remaining: number };
  maxSteps: number;
  onEvent?: (e: RunEvent) => void;
}

export async function runBee<S, I>(
  bee: Bee,
  cell: Cell<S, I>,
  input: I,
  ancestors: Bee[],
  env: RunEnv,
): Promise<GoalResult> {
  let state = await cell.setup(input);
  env.onEvent?.({ type: "enter", bee, cell: cell.id, depth: ancestors.length });

  let lastSig = "";
  let repeats = 0;
  let outOfBudget = false;

  const observe = (text: string) => {
    bee.localLog.push({ role: "observation", text });
    env.onEvent?.({ type: "observe", bee, text });
  };

  const finish = (result: GoalResult): GoalResult => {
    bee.result = result;
    bee.status = "resolved";
    env.onEvent?.({ type: "resolve", bee, result });
    return result;
  };

  const hasCaps = (requires?: string[]) => (requires ?? []).every((c) => bee.capabilities.includes(c));

  const viewsFor = async (defs: ActionDefinition<S>[]): Promise<ActionView[]> => {
    const out: ActionView[] = [];
    for (const def of defs) {
      const allowed = hasCaps(def.requires);
      const gate = allowed ? await availability(def, bee, state) : { available: false, reason: `requires ${(def.requires ?? []).join(", ")}` };
      out.push({
        name: def.name,
        description: def.description,
        requires: def.requires,
        input: def.input,
        available: gate.available,
        unavailableReason: gate.reason,
        example: exampleFor(def),
      });
    }
    out.push({ ...RESOLVE_ACTION, available: true, example: exampleFor(RESOLVE_ACTION) });
    return out;
  };

  for (let step = 0; step < env.maxSteps; step++) {
    if (env.budget && env.budget.remaining <= 0) {
      outOfBudget = true;
      break;
    }

    const defs = await cell.actions({ bee, state });
    if (defs.some((d) => d.name === "resolve")) {
      throw new Error(`Cell "${cell.id}" defines a reserved action name "resolve"; the runtime injects it automatically.`);
    }
    const actions = await viewsFor(defs);
    const view = env.renderer(buildBeeView(bee, ancestors), cell.content(state), actions);
    env.onEvent?.({ type: "view", bee, cell: cell.id, depth: ancestors.length, view });

    const decision = await bee.mind.decide({ bee, view, actions });
    if (env.budget) env.budget.remaining--;

    if (decision.action === "resolve") {
      const coerced = coerceArgs(RESOLVE_ACTION.input, decision.args);
      if (coerced.error) {
        observe(`Invalid resolve: ${coerced.error}`);
        continue;
      }
      return finish({ outcome: normalizeOutcome(coerced.args.outcome), summary: String(coerced.args.summary) });
    }

    const def = defs.find((a) => a.name === decision.action);
    const av = actions.find((a) => a.name === decision.action);
    if (!def || !av) {
      observe(`"${decision.action}" is not an action here. Available: ${actions.filter((a) => a.available).map((a) => a.name).join(", ")}.`);
      continue;
    }
    if (!av.available) {
      observe(`"${decision.action}" is unavailable${av.unavailableReason ? `: ${av.unavailableReason}` : ""}.`);
      continue;
    }

    const coerced = coerceArgs(def.input, decision.args);
    if (coerced.error) {
      observe(`Invalid input for "${decision.action}": ${coerced.error}`);
      continue;
    }

    const sig = decision.action + ":" + JSON.stringify(coerced.args);
    repeats = sig === lastSig ? repeats + 1 : 0;
    lastSig = sig;
    if (repeats >= 2) {
      observe(`You've repeated "${decision.action}" with the same input. Try a different action or resolve.`);
      continue;
    }

    env.onEvent?.({ type: "action", bee, name: def.name, args: coerced.args });

    try {
      const ctx = {
        bee,
        get state() {
          return state;
        },
        update: (patch: Partial<S> | ((s: S) => S)) => {
          state = (typeof patch === "function" ? patch(state as S) : { ...(state as any), ...patch }) as Awaited<S>;
        },
        observe,
        spawn: <ChildInput>(childCell: Cell<any, ChildInput>, childInput: ChildInput, goal: string, opts: SpawnOptions = {}) =>
          spawnChild(bee, ancestors, childCell, childInput, goal, opts, env),
        resolve: async (result: GoalResult) => finish(result),
        fail: failAction,
      };
      await def.run(coerced.args, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      env.onEvent?.({ type: "error", bee, name: def.name, message });
      observe(`Action "${def.name}" failed: ${message}`);
    }

    if (bee.result) return bee.result;
  }

  return finish({
    outcome: "blocked",
    summary: outOfBudget ? "Bee stopped: out of budget." : `Bee stopped: step cap (${env.maxSteps}).`,
  });
}

async function spawnChild<ChildInput>(
  parent: Bee,
  ancestors: Bee[],
  childCell: Cell<any, ChildInput>,
  childInput: ChildInput,
  goal: string,
  opts: SpawnOptions,
  env: RunEnv,
): Promise<GoalResult> {
  const capabilities = opts.capabilities ?? (opts.as ? env.beeTypes[opts.as] ?? [] : parent.capabilities);
  const child = makeBee(goal, capabilities, opts.mind ?? parent.mind);
  parent.children.push(child);
  env.onEvent?.({ type: "spawn", parent, child, cell: childCell.id, goal });
  return runBee(child, childCell, childInput, [...ancestors, parent], env);
}

async function availability<S>(def: ActionDefinition<S>, bee: Bee, state: S): Promise<{ available: boolean; reason?: string }> {
  if (!def.available) return { available: true };
  const out = await def.available({ bee, state });
  if (typeof out === "string") return { available: false, reason: out };
  return { available: out };
}

function normalizeOutcome(value: unknown): GoalResult["outcome"] {
  return (OUTCOMES as readonly string[]).includes(value as string) ? (value as GoalResult["outcome"]) : "blocked";
}

function coerceArgs(
  fields: InputField[] | undefined,
  raw: Record<string, unknown>,
): { args: Record<string, unknown>; error?: string } {
  const args: Record<string, unknown> = {};
  for (const field of fields ?? []) {
    const value = raw[field.name];
    const required = field.required !== false;
    if (value === undefined || value === null || value === "") {
      if (required) return { args, error: `missing required field "${field.name}"` };
      continue;
    }
    const coerced = coerceField(field, value);
    if (coerced.error) return { args, error: coerced.error };
    args[field.name] = coerced.value;
  }
  return { args };
}

function coerceField(field: InputField, value: unknown): { value?: unknown; error?: string } {
  if (field.type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? { value: n } : { error: `"${field.name}" must be a number` };
  }
  if (field.type === "boolean") {
    if (typeof value === "boolean") return { value };
    if (value === "true") return { value: true };
    if (value === "false") return { value: false };
    return { error: `"${field.name}" must be a boolean` };
  }
  return { value: String(value) };
}

function exampleFor(action: { name: string; input?: InputField[] }): Record<string, unknown> {
  const example: Record<string, unknown> = { action: action.name };
  for (const field of action.input ?? []) {
    if (field.type === "number") example[field.name] = 1;
    else if (field.type === "boolean") example[field.name] = true;
    else example[field.name] = `<${field.name}>`;
  }
  return example;
}
