import { entryCell } from "./cell.ts";
import { makeBee, runBee, type RunEnv } from "./runtime.ts";
import { tuiRenderer } from "./renderers/tui.ts";
import type { CellRegistration, Comb, Mind, Renderer, RunOptions } from "./types.ts";

const DEFAULT_BEE_TYPES: Record<string, string[]> = {
  scout: ["read"],
  worker: ["read", "write"],
};

export interface SkepConfig {
  // Heterogeneous list of registered cells; each carries its own state/input types.
  cells: CellRegistration<any, any>[];
  mind: Mind;
  renderer?: Renderer;
  beeTypes?: Record<string, string[]>;
}

export interface Skep {
  run(prompt: string, opts?: RunOptions): Promise<Comb>;
}

// Build a skep — the hive: a set of cells, a default mind, and an interface. Running
// it weaves a comb: the queen (the root bee) dispatches bees into cells and resolves.
export function skep(config: SkepConfig): Skep {
  const renderer = config.renderer ?? tuiRenderer;
  const beeTypes = config.beeTypes ?? DEFAULT_BEE_TYPES;
  // The queen carries every key, so she can dispatch into any registered cell.
  const queenKeys = [...new Set(Object.values(beeTypes).flat())];

  return {
    async run(prompt, opts = {}) {
      const total = opts.budget ?? Infinity;
      const budget = Number.isFinite(total) ? { remaining: total } : undefined;
      const env: RunEnv = {
        renderer,
        beeTypes,
        context: opts.context ?? {},
        budget,
        maxSteps: opts.maxSteps ?? 50,
        onEvent: opts.onEvent,
      };

      const queen = makeBee(prompt, queenKeys, config.mind);
      const result = await runBee(queen, entryCell(), { cells: config.cells }, [], env);

      return { queen, result, budgetUsed: budget ? total - budget.remaining : 0 };
    },
  };
}
