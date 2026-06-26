import { cell, cellKit, num, optional, showIf, text, xml, type Cell } from "@syntropy-systems/skep";
import { FileInput, FileState, GREP_CAP, HEAD_LINES, loadFile, makeMatcher } from "./helpers.ts";

const k = cellKit<FileState>();

// ── state ──
const enter = (input: FileInput): FileState => loadFile(input);

// ── show ──
const show = (s: FileState) => {
  const start = Math.max(1, s.window.start);
  const end = Math.min(s.lines.length, s.window.end);
  const visible = s.lines.slice(start - 1, end);
  return xml`
    <file path="${s.path}" lines="${s.lines.length}" window="${start}..${end}">
      ${showIf(s.error, xml`<error>${s.error ?? ""}</error>`)}
      <window>${visible.map((line, i) => xml`<line n="${start + i}">${line}</line>`)}</window>
      ${showIf(s.search, xml`
        <search text="${s.search?.text ?? ""}" capped="${s.search?.capped ? "true" : "false"}">
          ${(s.search?.hits ?? []).map((hit) => xml`<hit line="${hit.line}">${hit.text}</hit>`)}
        </search>
      `)}
    </file>
  `;
};

// ── does ──
const search = k.action({
  describe: "Search within this file and surface matching lines.",
  input: { query: text("text or regex to search for") },
  run: ({ query }, ctx) => {
    const match = makeMatcher(query);
    const hits = ctx.state.lines
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter((h) => match(h.text))
      .slice(0, GREP_CAP);
    ctx.update({ search: { text: query, hits, capped: hits.length >= GREP_CAP } });
    ctx.observe(hits.length ? `search "${query}" found ${hits.length} hit(s) in ${ctx.state.path}.` : `search "${query}" found no matches in ${ctx.state.path}.`);
  },
});

const window = k.action({
  describe: "Move the visible line window.",
  input: { start: num("first line"), end: optional(num("last line")) },
  run: ({ start, end }, ctx) => {
    const first = Math.max(1, start);
    const last = Math.min(ctx.state.lines.length, end ?? first + HEAD_LINES - 1);
    ctx.update({ window: { start: first, end: Math.max(first, last) } });
    ctx.observe(`showing ${ctx.state.path} lines ${first}..${Math.max(first, last)}.`);
  },
});

// ── assembly ──
export function fileCell(): Cell<FileState, FileInput> {
  return cell<FileState, FileInput>("fs.file", {
    describe: "Inspect a single file through windows and searches.",
    enter,
    show,
    does: { search, window },
  });
}
