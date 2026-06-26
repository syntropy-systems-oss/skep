import { action, cell, showIf, stringInput, xml, type Cell } from "@syntropy-systems/skep";
import {
  FolderInput,
  FolderState,
  GREP_CAP,
  grepUnder,
  loadFolder,
  resolveRel,
} from "./helpers.ts";
import { fileCell } from "./file.ts";

export function folderCell(): Cell<FolderState, FolderInput> {
  return cell<FolderState, FolderInput>("fs.folder", {
    description: "Start in a local filesystem folder and inspect files by search or navigation.",
    setup: (input) => loadFolder(input),
    content: (state) => xml`
      <folder path="${state.path}">
        ${showIf(state.error, xml`<error>${state.error ?? ""}</error>`)}
        <dirs>${state.dirs.map((dir) => xml`<dir name="${dir}" />`)}</dirs>
        <files>${state.files.map((file) => xml`<file name="${file}" />`)}</files>
        ${showIf(!state.error && !state.dirs.length && !state.files.length, xml`<empty />`)}
        ${showIf(state.search, xml`
          <search text="${state.search?.text ?? ""}" capped="${state.search?.capped ? "true" : "false"}">
            ${(state.search?.hits ?? []).map((hit) => xml`<hit>${hit}</hit>`)}
          </search>
        `)}
      </folder>
    `,
    actions: () => [
      action<FolderState>(
        "grep",
        {
          description: "Search recursively under this folder and update this folder cell with matching file lines.",
          input: [stringInput("text", "Text or regex to search for")],
        },
        async ({ text }, ctx) => {
          const query = String(text);
          const hits = grepUnder(ctx.state.root, ctx.state.path, query);
          ctx.update({ search: { text: query, hits, capped: hits.length >= GREP_CAP } });
          ctx.observe(hits.length ? `grep "${query}" found ${hits.length} hit(s).` : `grep "${query}" found no matches under ${ctx.state.path}.`);
        },
      ),
      action<FolderState>(
        "open_folder",
        {
          description: "Send a bee into a child folder. Use this for structural navigation, not simple searches.",
          input: [stringInput("target", "Folder name or path"), stringInput("goal", "Self-contained goal for the bee you send")],
        },
        async ({ target, goal }, ctx) => {
          const path = resolveRel(ctx.state.root, ctx.state.path, String(target));
          const result = await ctx.spawn(folderCell(), { root: ctx.state.root, path }, String(goal));
          ctx.observe(`Folder bee returned [${result.outcome}] ${result.summary}`);
        },
      ),
      action<FolderState>(
        "open_file",
        {
          description: "Send a bee into a file to inspect its contents.",
          input: [stringInput("target", "File name or path"), stringInput("goal", "Self-contained goal for the bee you send")],
        },
        async ({ target, goal }, ctx) => {
          const path = resolveRel(ctx.state.root, ctx.state.path, String(target));
          const result = await ctx.spawn(fileCell(), { root: ctx.state.root, path }, String(goal));
          ctx.observe(`File bee returned [${result.outcome}] ${result.summary}`);
        },
      ),
    ],
  });
}
