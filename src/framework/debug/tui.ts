import type { RunEvent } from "../types.ts";

type Writable = { write(text: string): unknown };

export interface DebugTuiOptions {
  clear?: boolean;
  showEvents?: boolean;
  stream?: Writable;
}

// Prints what each bee saw (the `view` event) and the lifecycle around it. A thin
// observer over the run's event stream — nothing the runtime depends on.
export function createDebugTui(opts: DebugTuiOptions = {}): (event: RunEvent) => void {
  const clear = opts.clear ?? true;
  const showEvents = opts.showEvents ?? true;
  const stream = opts.stream ?? process.stdout;
  let viewCount = 0;

  return (event) => {
    if (event.type === "view") {
      viewCount++;
      if (clear) stream.write("\x1b[2J\x1b[H");
      stream.write([
        `BEE ${event.bee.id}  CELL ${event.cell}  DEPTH ${event.depth}  VIEW ${viewCount}`,
        `GOAL ${event.bee.goal}`,
        "",
        event.view,
        "",
      ].join("\n"));
      return;
    }

    if (!showEvents) return;
    stream.write(renderEvent(event) + "\n");
  };
}

function renderEvent(event: RunEvent): string {
  switch (event.type) {
    case "enter":
      return `[enter] ${event.bee.id} ${event.cell}`;
    case "action":
      return `[action] ${event.bee.id} ${event.name} ${JSON.stringify(event.args)}`;
    case "observe":
      return `[observe] ${event.bee.id} ${firstLine(event.text)}`;
    case "spawn":
      return `[spawn] ${event.parent.id} -> ${event.child.id} ${event.cell} "${firstLine(event.goal)}"`;
    case "resolve":
      return `[resolve] ${event.bee.id} ${event.result.outcome}: ${firstLine(event.result.summary)}`;
    case "error":
      return `[error] ${event.bee.id} ${event.name}: ${firstLine(event.message)}`;
    default:
      return "";
  }
}

function firstLine(text: string): string {
  return text.split("\n")[0].slice(0, 120);
}
