// Compiled by tsconfig.consumer.json as if it were a downstream consumer: it resolves
// "@syntropy-systems/skep" through the published exports map + emitted .d.ts, WITHOUT
// allowImportingTsExtensions. If declaration emit ever regresses (e.g. .ts specifiers
// leak back into dist/*.d.ts), this stops type-checking. Never executed.
import {
  skep,
  cell,
  action,
  registerCell,
  stringInput,
  ActionFailure,
  type Cell,
  type Comb,
  type Mind,
  type GoalResult,
  type SkepConfig,
} from "@syntropy-systems/skep";
import { tuiRenderer } from "@syntropy-systems/skep/renderers/tui";
import { llmMind } from "@syntropy-systems/skep/agents/llm";

export async function _typeProbe(mind: Mind): Promise<Comb> {
  const probe = cell<{ n?: number }>("probe", { setup: () => ({}), content: () => "", actions: () => [] });
  const cells: Cell[] = [];
  const r: GoalResult = { outcome: "succeeded", summary: "ok" };
  const config: SkepConfig = { cells: [registerCell(probe, {}, { as: "scout" })], mind, renderer: tuiRenderer };

  void cells;
  void r;
  void action;
  void stringInput;
  void ActionFailure;
  void llmMind;

  return skep(config).run("probe");
}
