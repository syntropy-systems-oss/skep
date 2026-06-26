import type { Renderer } from "../types.ts";

const RULE = "=".repeat(72);

// A renderer that FOREGROUNDS returned child results as decisive evidence — placed
// directly under the goal, framed as "already gathered, do not re-gather", with an
// explicit resolve cue at the point of evidence. Use this instead of the default `tui`
// renderer when parent bees tend to re-derive work a child already returned. Pure
// render change: the engine, cells, and protocol are unaffected.
export const briefingRenderer: Renderer = (view, content, actions) => {
  const lines: string[] = [];

  lines.push("GOAL: " + view.goal);
  if (view.ancestorGoals.length) {
    lines.push("PATH: " + view.ancestorGoals.join(" > ") + " > (here)");
  }

  if (view.childResults.length) {
    lines.push(RULE);
    lines.push(`RETURNED BY YOUR SUB-TASKS (${view.childResults.length}) — already-gathered evidence, do not re-gather:`);
    for (const result of view.childResults) {
      lines.push(`  ▸ [${result.outcome}] ${result.summary}`);
    }
    lines.push("If the above already answers the GOAL, choose `resolve` now instead of exploring again.");
  }

  lines.push(RULE);
  lines.push("CELL:");
  lines.push(String(content));

  if (view.localLog.length) {
    lines.push(RULE);
    lines.push("YOUR NOTES:");
    for (const entry of view.localLog.slice(-6)) lines.push("  " + entry.text.replace(/\n/g, "\n  "));
  }

  lines.push(RULE);
  lines.push("ACTIONS:");
  for (const action of actions) {
    const status = action.available ? "" : ` (unavailable${action.unavailableReason ? `: ${action.unavailableReason}` : ""})`;
    lines.push(`  ${action.name}${status}: ${action.describe}`);
    if (action.input?.length) {
      lines.push("    input: " + action.input.map((f) => `${f.name}:${f.type}${f.required === false ? "?" : ""}`).join(", "));
    }
    lines.push("    example: " + JSON.stringify(action.example));
  }

  return lines.join("\n");
};
