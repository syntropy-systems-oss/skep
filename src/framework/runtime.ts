import type {
  Action,
  ActionView,
  Bee,
  BeeView,
  Cell,
  Does,
  GoalResult,
  InputField,
  InputSchema,
  Mind,
  Renderer,
  RunEvent,
  SpawnOptions,
} from "./types.ts";

let _beeId = 0;

export function makeBee(goal: string, keys: string[], mind: Mind): Bee {
  return { id: `b${++_beeId}`, goal, keys, mind, status: "open", localLog: [], children: [] };
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

// `resolve` is injected into every cell: a bee can always finish by naming an outcome and
// a summary. Authors never write it (and a cell that defines one is rejected).
const RESOLVE_FIELDS: InputField[] = [
  { name: "outcome", type: "string", describe: "succeeded | partial | not_found | blocked | failed", required: true },
  { name: "summary", type: "string", describe: "the answer, or why the goal could not be met", required: true },
];
const RESOLVE_DESCRIBE = "Finish this bee: report the outcome and a summary that answers the goal.";
const OUTCOMES = ["succeeded", "partial", "not_found", "blocked", "failed"] as const;

export interface RunEnv {
  renderer: Renderer;
  beeTypes: Record<string, string[]>;
  budget?: { remaining: number };
  maxSteps: number;
  onEvent?: (e: RunEvent) => void;
}

export async function runBee<S, I>(bee: Bee, cell: Cell<S, I>, input: I, ancestors: Bee[], env: RunEnv): Promise<GoalResult> {
  let state = await cell.enter(input);
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

  const viewFor = async (name: string, def: Action<S>): Promise<ActionView> => {
    const fields = inputFields(def.input);
    const hasKeys = (def.locks ?? []).every((lock) => bee.keys.includes(lock));
    const gate = hasKeys
      ? await availability(def, bee, state)
      : { available: false, reason: `needs key(s): ${(def.locks ?? []).join(", ")}` };
    return {
      name,
      describe: def.describe,
      locks: def.locks ?? [],
      input: fields,
      available: gate.available,
      unavailableReason: gate.reason,
      example: exampleFor(name, fields),
    };
  };

  for (let step = 0; step < env.maxSteps; step++) {
    if (env.budget && env.budget.remaining <= 0) {
      outOfBudget = true;
      break;
    }

    const does = await resolveDoes(cell.does, bee, state);
    if ("resolve" in does) {
      throw new Error(`Cell "${cell.id}" defines a reserved action "resolve"; the runtime injects it automatically.`);
    }

    const views: ActionView[] = [];
    for (const [name, def] of Object.entries(does)) views.push(await viewFor(name, def));
    views.push({
      name: "resolve",
      describe: RESOLVE_DESCRIBE,
      locks: [],
      input: RESOLVE_FIELDS,
      available: true,
      example: exampleFor("resolve", RESOLVE_FIELDS),
    });

    const view = env.renderer(buildBeeView(bee, ancestors), cell.show(state), views);
    env.onEvent?.({ type: "view", bee, cell: cell.id, depth: ancestors.length, view });

    const decision = await bee.mind.decide({ bee, view, actions: views });
    if (env.budget) env.budget.remaining--;

    if (decision.action === "resolve") {
      const coerced = coerceArgs(RESOLVE_FIELDS, decision.args);
      if (coerced.error) {
        observe(`Invalid resolve: ${coerced.error}`);
        continue;
      }
      return finish({ outcome: normalizeOutcome(coerced.args.outcome), summary: String(coerced.args.summary) });
    }

    const def = does[decision.action];
    const av = views.find((v) => v.name === decision.action);
    if (!def || !av) {
      observe(`"${decision.action}" is not an action here. Available: ${views.filter((v) => v.available).map((v) => v.name).join(", ")}.`);
      continue;
    }
    if (!av.available) {
      observe(`"${decision.action}" is unavailable${av.unavailableReason ? `: ${av.unavailableReason}` : ""}.`);
      continue;
    }

    const coerced = coerceArgs(av.input, decision.args);
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

    env.onEvent?.({ type: "action", bee, name: decision.action, args: coerced.args });

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
      await def.run(coerced.args as any, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      env.onEvent?.({ type: "error", bee, name: decision.action, message });
      observe(`Action "${decision.action}" failed: ${message}`);
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
  const keys = opts.keys ?? (opts.as ? env.beeTypes[opts.as] ?? [] : parent.keys);
  const child = makeBee(goal, keys, opts.mind ?? parent.mind);
  parent.children.push(child);
  env.onEvent?.({ type: "spawn", parent, child, cell: childCell.id, goal });
  return runBee(child, childCell, childInput, [...ancestors, parent], env);
}

async function resolveDoes<S>(does: Cell<S>["does"], bee: Bee, state: S): Promise<Does<S>> {
  return typeof does === "function" ? does({ bee, state }) : does;
}

function inputFields(schema?: InputSchema): InputField[] {
  if (!schema) return [];
  return Object.entries(schema).map(([name, field]) => ({
    name,
    type: field.type,
    describe: field.describe,
    required: field.required,
  }));
}

async function availability<S>(def: Action<S>, bee: Bee, state: S): Promise<{ available: boolean; reason?: string }> {
  if (!def.available) return { available: true };
  const out = await def.available({ bee, state });
  if (typeof out === "string") return { available: false, reason: out };
  return { available: out };
}

function normalizeOutcome(value: unknown): GoalResult["outcome"] {
  return (OUTCOMES as readonly string[]).includes(value as string) ? (value as GoalResult["outcome"]) : "blocked";
}

function coerceArgs(fields: InputField[], raw: Record<string, unknown>): { args: Record<string, unknown>; error?: string } {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const value = raw[field.name];
    if (value === undefined || value === null || value === "") {
      if (field.required) return { args, error: `missing required field "${field.name}"` };
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

function exampleFor(name: string, fields: InputField[]): Record<string, unknown> {
  const example: Record<string, unknown> = { action: name };
  for (const field of fields) {
    if (field.type === "number") example[field.name] = 1;
    else if (field.type === "boolean") example[field.name] = true;
    else example[field.name] = `<${field.name}>`;
  }
  return example;
}
