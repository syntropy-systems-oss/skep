import { action, cell, numberInput, showIf, stringInput, xml, type Cell } from "@syntropy-systems/skep";
import {
  FileInput,
  FileState,
  GREP_CAP,
  HEAD_LINES,
  loadFile,
  makeMatcher,
} from "./helpers.ts";

export function fileCell(): Cell<FileState, FileInput> {
  return cell<FileState, FileInput>("fs.file", {
    description: "Inspect a single file through windows and searches.",
    setup: (input) => loadFile(input),
    content: (state) => {
      const start = Math.max(1, state.window.start);
      const end = Math.min(state.lines.length, state.window.end);
      const visible = state.lines.slice(start - 1, end);
      return xml`
        <file path="${state.path}" lines="${state.lines.length}" window="${start}..${end}">
          ${showIf(state.error, xml`<error>${state.error ?? ""}</error>`)}
          <window>
            ${visible.map((line, index) => xml`<line n="${start + index}">${line}</line>`)}
          </window>
          ${showIf(state.search, xml`
            <search text="${state.search?.text ?? ""}" capped="${state.search?.capped ? "true" : "false"}">
              ${(state.search?.hits ?? []).map((hit) => xml`<hit line="${hit.line}">${hit.text}</hit>`)}
            </search>
          `)}
        </file>
      `;
    },
    actions: () => [
      action<FileState>(
        "search",
        {
          description: "Search within this file and update the file cell with matching lines.",
          input: [stringInput("text", "Text or regex to search for")],
        },
        async ({ text }, ctx) => {
          const query = String(text);
          const match = makeMatcher(query);
          const hits = ctx.state.lines
            .map((line, index) => ({ line: index + 1, text: line.trim() }))
            .filter((item) => match(item.text))
            .slice(0, GREP_CAP);
          ctx.update({ search: { text: query, hits, capped: hits.length >= GREP_CAP } });
          ctx.observe(hits.length ? `search "${query}" found ${hits.length} hit(s) in ${ctx.state.path}.` : `search "${query}" found no matches in ${ctx.state.path}.`);
        },
      ),
      action<FileState>(
        "show",
        {
          description: "Change the visible line window for this file cell.",
          input: [
            numberInput("start", "First line to show"),
            numberInput("end", "Last line to show", false),
          ],
        },
        async ({ start, end }, ctx) => {
          const first = Math.max(1, Number(start));
          const last = Math.min(ctx.state.lines.length, Number(end ?? first + HEAD_LINES - 1));
          ctx.update({ window: { start: first, end: Math.max(first, last) } });
          ctx.observe(`showing ${ctx.state.path} lines ${first}..${Math.max(first, last)}.`);
        },
      ),
    ],
  });
}
