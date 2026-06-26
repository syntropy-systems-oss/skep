import { cell, cellKit, showIf, text, xml, type Cell } from "@syntropy-systems/skep";
import { FolderInput, FolderState, GREP_CAP, grepUnder, loadFolder, resolveRel } from "./helpers.ts";
import { fileCell } from "./file.ts";

const k = cellKit<FolderState>();

// ── state ──
const enter = (input: FolderInput): FolderState => loadFolder(input);

// ── show ──
const show = (s: FolderState) => xml`
  <folder path="${s.path}">
    ${showIf(s.error, xml`<error>${s.error ?? ""}</error>`)}
    <dirs>${s.dirs.map((dir) => xml`<dir name="${dir}" />`)}</dirs>
    <files>${s.files.map((file) => xml`<file name="${file}" />`)}</files>
    ${showIf(!s.error && !s.dirs.length && !s.files.length, xml`<empty />`)}
    ${showIf(s.search, xml`
      <search text="${s.search?.text ?? ""}" capped="${s.search?.capped ? "true" : "false"}">
        ${(s.search?.hits ?? []).map((hit) => xml`<hit>${hit}</hit>`)}
      </search>
    `)}
  </folder>
`;

// ── does ──
const grep = k.action({
  describe: "Search file contents recursively under this folder.",
  input: { query: text("text or regex to search for") },
  run: ({ query }, ctx) => {
    const hits = grepUnder(ctx.state.root, ctx.state.path, query);
    ctx.update({ search: { text: query, hits, capped: hits.length >= GREP_CAP } });
    ctx.observe(hits.length ? `grep "${query}" found ${hits.length} hit(s).` : `grep "${query}" found no matches under ${ctx.state.path}.`);
  },
});

const open_folder = k.action({
  describe: "Send a bee into a child folder (structural navigation, not simple search).",
  input: { target: text("folder name or path"), goal: text("self-contained goal for the bee") },
  run: async ({ target, goal }, ctx) => {
    const path = resolveRel(ctx.state.root, ctx.state.path, target);
    const result = await ctx.spawn(folderCell(), { root: ctx.state.root, path }, goal);
    ctx.observe(`Folder bee returned [${result.outcome}] ${result.summary}`);
  },
});

const open_file = k.action({
  describe: "Send a bee into a file to inspect its contents.",
  input: { target: text("file name or path"), goal: text("self-contained goal for the bee") },
  run: async ({ target, goal }, ctx) => {
    const path = resolveRel(ctx.state.root, ctx.state.path, target);
    const result = await ctx.spawn(fileCell(), { root: ctx.state.root, path }, goal);
    ctx.observe(`File bee returned [${result.outcome}] ${result.summary}`);
  },
});

// ── assembly ──
export function folderCell(): Cell<FolderState, FolderInput> {
  return cell<FolderState, FolderInput>("fs.folder", {
    describe: "Start in a local filesystem folder and inspect files by search or navigation.",
    enter,
    show,
    does: { grep, open_folder, open_file },
  });
}
