import type {
  ActionContext,
  ActionDefinition,
  ActionSpec,
  Availability,
  Bee,
  Cell,
  CellRegistration,
  InputField,
  MaybePromise,
} from "./types.ts";
import { xml } from "./markup.ts";

export function cell<S, I = unknown>(id: string, definition: Omit<Cell<S, I>, "id">): Cell<S, I> {
  return { id, ...definition };
}

export function registerCell<S, I>(
  target: Cell<S, I>,
  input: I,
  opts: { id?: string; description?: string; as?: string } = {},
): CellRegistration<S, I> {
  return {
    id: opts.id ?? target.id,
    cell: target,
    input,
    description: opts.description ?? target.description,
    as: opts.as,
  };
}

export function action<S>(
  name: string,
  spec: Omit<ActionSpec, "name"> & { available?: (ctx: { bee: Bee; state: S }) => MaybePromise<Availability> },
  run: (args: Record<string, unknown>, ctx: ActionContext<S>) => MaybePromise<void>,
): ActionDefinition<S> {
  return { name, ...spec, run };
}

export function stringInput(name: string, description?: string, required = true): InputField {
  return { name, type: "string", description, required };
}

export function numberInput(name: string, description?: string, required = true): InputField {
  return { name, type: "number", description, required };
}

export function booleanInput(name: string, description?: string, required = true): InputField {
  return { name, type: "boolean", description, required };
}

// The queen's cell. Framework-generated: it lists the registered cells and lets the
// queen dispatch a bee into one with a self-contained goal. (Resolve is injected by
// the runtime, so it isn't authored here.)
interface EntryInput {
  cells: CellRegistration<any, any>[];
}

export function entryCell(): Cell<EntryInput, EntryInput> {
  return cell<EntryInput, EntryInput>("skep.entry", {
    description: "Queen entry cell.",
    setup: (input) => input,
    content: (state) => xml`
      <skep>
        <cells>
          ${state.cells.map(
            (reg) => xml`
            <cell id="${reg.id}" type="${reg.as ?? "scout"}">
              ${reg.description ?? reg.cell.description ?? ""}
            </cell>`,
          )}
        </cells>
      </skep>
    `,
    actions: () => [
      action<EntryInput>(
        "dispatch",
        {
          description: "Send a bee into a registered cell with a self-contained goal.",
          input: [
            stringInput("cell", "Registered cell id"),
            stringInput("goal", "Self-contained goal for the bee"),
            stringInput("as", "Bee type, e.g. scout or worker", false),
          ],
        },
        async ({ cell: cellId, goal, as }, ctx) => {
          const reg = ctx.state.cells.find((candidate) => candidate.id === String(cellId));
          if (!reg) return ctx.fail(`Unknown cell "${String(cellId)}".`);
          // Default to "scout" so the dispatched bee's capabilities match the type shown
          // in the cell listing (rather than silently inheriting the queen's superset).
          const beeType = (as ? String(as) : reg.as) ?? "scout";
          const result = await ctx.spawn(reg.cell, reg.input, String(goal), { as: beeType });
          ctx.observe(`Bee returned [${result.outcome}] ${result.summary}`);
        },
      ),
    ],
  });
}
