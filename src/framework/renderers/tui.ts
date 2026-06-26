import type { Renderer } from "../types.ts";

const RULE = "-".repeat(72);

export const tuiRenderer: Renderer = (view, content, actions) => {
  const lines: string[] = [];

  lines.push("CELL");
  lines.push(RULE);
  lines.push(String(content));
  lines.push(RULE);

  if (view.ancestorGoals.length) {
    lines.push("PATH: " + view.ancestorGoals.join(" > ") + " > (here)");
  }
  lines.push("GOAL: " + view.goal);

  if (view.childResults.length) {
    lines.push("CHILD RESULTS:");
    for (const result of view.childResults) lines.push(`  [${result.outcome}] ${result.summary}`);
  }

  if (view.localLog.length) {
    lines.push("NOTES:");
    for (const entry of view.localLog.slice(-8)) lines.push("  " + entry.text.replace(/\n/g, "\n  "));
  }

  lines.push("ACTIONS:");
  for (const action of actions) {
    const status = action.available ? "" : ` (unavailable${action.unavailableReason ? `: ${action.unavailableReason}` : ""})`;
    lines.push(`  ${action.name}${status}: ${action.description}`);
    if (action.input?.length) {
      lines.push("    input: " + action.input.map((f) => `${f.name}:${f.type}${f.required === false ? "?" : ""}`).join(", "));
    }
    lines.push("    example: " + JSON.stringify(action.example));
  }

  return lines.join("\n");
};
