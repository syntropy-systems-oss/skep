// Compiled by tsconfig.consumer.json as if it were a downstream consumer: it resolves
// "@syntropy-systems/skep" through the published exports map + emitted .d.ts, WITHOUT
// allowImportingTsExtensions. If declaration emit ever regresses (e.g. .ts specifiers leak
// into dist/*.d.ts) or the public types drift, this stops type-checking. Never executed.
import {
  skep,
  cell,
  cellKit,
  action,
  registerCell,
  text,
  type Cell,
  type Comb,
  type Mind,
  type GoalResult,
  type SkepConfig,
} from "@syntropy-systems/skep";
import { tuiRenderer } from "@syntropy-systems/skep/renderers/tui";
import { llmMind } from "@syntropy-systems/skep/agents/llm";

type Probe = { n: number };

export async function _typeProbe(mind: Mind): Promise<Comb> {
  const k = cellKit<Probe>();
  const probe = cell<Probe, { n: number }>("probe", {
    enter: ({ n }) => ({ n }),
    show: (s) => `n=${s.n}`,
    does: {
      // arg `by` is inferred as string from the input schema
      bump: k.action({
        describe: "increment by an amount",
        input: { by: text("amount") },
        run: ({ by }, ctx) => ctx.update((s) => ({ n: s.n + Number(by) })),
      }),
    },
  });

  const cells: Cell[] = [];
  const r: GoalResult = { outcome: "succeeded", summary: "ok" };
  const config: SkepConfig = { cells: [registerCell(probe, { n: 0 }, { as: "scout" })], mind, renderer: tuiRenderer };

  void cells;
  void r;
  void action;
  void llmMind;

  return skep(config).run("probe");
}
