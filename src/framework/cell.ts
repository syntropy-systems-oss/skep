import type { Action, Cell, CellRegistration, Field, InputSchema } from "./types.ts";
import { xml } from "./markup.ts";

/**
 * Define a cell — a room a bee enters. A cell renders its contents (`show`) and offers
 * affordances (`does`); the runtime injects a `resolve` action into every cell.
 *
 * @example
 * ```ts
 * import { cell, cellKit, text, xml } from "@syntropy-systems/skep";
 *
 * type Notes = { items: string[] };
 * const k = cellKit<Notes>();
 *
 * const add = k.action({
 *   describe: "Append a note.",
 *   locks: ["write"],
 *   input: { text: text("note text") },
 *   run: ({ text }, ctx) => ctx.update((s) => ({ items: [...s.items, text] })),
 * });
 *
 * export const notes = cell<Notes, { items: string[] }>("notes", {
 *   enter: ({ items }) => ({ items }),
 *   show: (s) => xml`<notes>${s.items.map((n) => xml`<note>${n}</note>`)}</notes>`,
 *   does: { add },
 * });
 * ```
 */
export function cell<S, I = unknown>(id: string, def: Omit<Cell<S, I>, "id">): Cell<S, I> {
  return { id, ...def };
}

/**
 * Define an action: an affordance of a cell. `locks` are the keys a bee must carry to see
 * it (every lock — AND); `input` is a schema and `run`'s args are inferred from it.
 *
 * Prefer `cellKit<State>().action` so `ctx.state` is typed; this standalone form leaves the
 * state untyped.
 */
export function action<S = unknown, I extends InputSchema = {}>(def: Action<S, I>): Action<S, I> {
  return def;
}

/**
 * A state-bound authoring kit. `cellKit<State>().action(...)` types `ctx.state` as `State`
 * while still inferring each action's args from its `input` schema.
 */
export function cellKit<S>() {
  return {
    action: <I extends InputSchema = {}>(def: Action<S, I>): Action<S, I> => def,
  };
}

// Input field helpers — declare the shape; the handler's args are inferred from it.
export const text = (describe?: string): Field<string, true> => ({ type: "string", describe, required: true });
export const num = (describe?: string): Field<number, true> => ({ type: "number", describe, required: true });
export const flag = (describe?: string): Field<boolean, true> => ({ type: "boolean", describe, required: true });
export const optional = <T>(field: Field<T, true>): Field<T, false> => ({ ...field, required: false });

export function registerCell<S, I>(
  target: Cell<S, I>,
  input: I,
  opts: { id?: string; describe?: string; as?: string } = {},
): CellRegistration<S, I> {
  return { id: opts.id ?? target.id, cell: target, input, describe: opts.describe ?? target.describe, as: opts.as };
}

// The queen's cell. Framework-generated: it lists the registered cells and lets her
// dispatch a bee into one with a self-contained goal. (Resolve is injected by the runtime.)
interface EntryInput {
  cells: CellRegistration<any, any>[];
}

export function entryCell(): Cell<EntryInput, EntryInput> {
  const k = cellKit<EntryInput>();
  return cell<EntryInput, EntryInput>("skep.entry", {
    describe: "Queen entry cell.",
    enter: (input) => input,
    show: (s) => xml`
      <skep>
        <cells>
          ${s.cells.map((reg) => xml`<cell id="${reg.id}" type="${reg.as ?? "scout"}">${reg.describe ?? reg.cell.describe ?? ""}</cell>`)}
        </cells>
      </skep>
    `,
    does: {
      dispatch: k.action({
        describe: "Send a bee into a registered cell with a self-contained goal.",
        input: {
          cell: text("registered cell id"),
          goal: text("self-contained goal for the bee"),
          as: optional(text("bee type, e.g. scout or worker")),
        },
        run: async ({ cell: cellId, goal, as }, ctx) => {
          const reg = ctx.state.cells.find((candidate) => candidate.id === cellId);
          if (!reg) return ctx.fail(`Unknown cell "${cellId}".`);
          const beeType = as ?? reg.as ?? "scout";
          const result = await ctx.spawn(reg.cell, reg.input, goal, { as: beeType });
          ctx.observe(`Bee returned [${result.outcome}] ${result.summary}`);
        },
      }),
    },
  });
}
