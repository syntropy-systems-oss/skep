// A scripted mind for the no-network path: it reads which actions are available to
// know which cell the bee is in (entry → dispatch, folder → grep, file → search) and
// walks the happy path. No model, fully deterministic.
import type { Mind } from "@syntropy-systems/skep";

const FOLDER_GOAL = "Find the file defining the dashboard sidebar nav icon and its icon library.";
const FILE_GOAL = "Inspect src/menu-items/dashboard.js to identify the dashboard icon and its library.";
const ANSWER = "The dashboard nav icon is defined in src/menu-items/dashboard.js and comes from @tabler/icons-react as IconAffiliate.";

export function mockMind(): Mind {
  return {
    async decide({ bee, actions }) {
      const has = (name: string) => actions.some((a) => a.name === name && a.available);

      // Queen entry cell.
      if (has("dispatch")) {
        if (bee.children.length === 0) return { action: "dispatch", args: { cell: "fs.folder", goal: FOLDER_GOAL } };
        return { action: "resolve", args: { outcome: "succeeded", summary: ANSWER } };
      }

      // Folder cell.
      if (has("grep")) {
        if (bee.localLog.length === 0) return { action: "grep", args: { text: "IconAffiliate" } };
        if (bee.children.length === 0) return { action: "open_file", args: { target: "src/menu-items/dashboard.js", goal: FILE_GOAL } };
        return { action: "resolve", args: { outcome: "succeeded", summary: ANSWER } };
      }

      // File cell.
      if (has("search")) {
        if (bee.localLog.length === 0) return { action: "search", args: { text: "IconAffiliate" } };
        return { action: "resolve", args: { outcome: "succeeded", summary: ANSWER } };
      }

      return { action: "resolve", args: { outcome: "blocked", summary: "no path forward" } };
    },
  };
}
