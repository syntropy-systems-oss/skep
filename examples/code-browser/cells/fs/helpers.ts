// Shared filesystem primitives for the folder/file cells. Forgiving +
// defensive: models give inconsistent paths and write regex as often as literal text, and a
// bad read must degrade gracefully (the bee recovers via the cell), never crash the engine.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, normalize } from "node:path";

export interface FolderInput { root: string; path: string }
export interface FileInput { root: string; path: string }

export interface FolderState {
  root: string;
  path: string;
  dirs: string[];
  files: string[];
  error?: string;
  search?: { text: string; hits: string[]; capped: boolean };
}

export interface FileState {
  root: string;
  path: string;
  lines: string[];
  error?: string;
  window: { start: number; end: number };
  search?: { text: string; hits: { line: number; text: string }[]; capped: boolean };
}

export const HEAD_LINES = 40;
export const GREP_CAP = 40;

export function loadFolder(input: FolderInput): FolderState {
  const listing = listFolder(input.root, input.path);
  return { root: input.root, path: input.path, ...listing };
}

export function loadFile(input: FileInput): FileState {
  const lines = fileLines(input.root, input.path);
  return {
    root: input.root,
    path: input.path,
    lines,
    error: lines.length ? undefined : `cannot read file ${input.path}`,
    window: { start: 1, end: Math.min(HEAD_LINES, Math.max(1, lines.length)) },
  };
}

/** Forgiving path resolution: bare name / root-relative / over-qualified-while-inside. Return the
 *  first candidate that exists under root; never escape root. */
export function resolveRel(root: string, cur: string, target: string): string {
  const t = target.replace(/^\.?\//, "");
  for (const c of [join(cur, t), t, join(cur, basename(t)), basename(t)]) {
    const norm = normalize(c).replace(/^(\.\.(\/|$))+/, "");
    if (existsSync(join(root, norm))) return norm;
  }
  return normalize(join(cur, t)).replace(/^(\.\.(\/|$))+/, "");
}

/** Regex (case-insensitive) if valid, else literal substring. Files here are tiny — no ReDoS concern. */
export function makeMatcher(text: string): (line: string) => boolean {
  try {
    const re = new RegExp(text, "i");
    return (l) => re.test(l);
  } catch {
    const needle = text.toLowerCase();
    return (l) => l.toLowerCase().includes(needle);
  }
}

export function listFolder(root: string, path: string): { dirs: string[]; files: string[]; error?: string } {
  try {
    const dirs: string[] = [];
    const files: string[] = [];
    for (const e of readdirSync(join(root, path), { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      (e.isDirectory() ? dirs : files).push(e.name);
    }
    return { dirs: dirs.sort(), files: files.sort() };
  } catch {
    return { dirs: [], files: [], error: `cannot read folder ${path}` };
  }
}

export function grepUnder(root: string, path: string, text: string): string[] {
  const match = makeMatcher(text);
  const hits: string[] = [];
  const walk = (rel: string) => {
    if (hits.length >= GREP_CAP) return;
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childRel = join(rel, e.name);
      if (e.isDirectory()) walk(childRel);
      else if (hits.length < GREP_CAP) {
        try {
          readFileSync(join(root, childRel), "utf8").split("\n").forEach((l, i) => {
            if (hits.length < GREP_CAP && match(l)) hits.push(`${childRel}:${i + 1}: ${l.trim()}`);
          });
        } catch {
          /* skip unreadable/binary */
        }
      }
    }
  };
  walk(path);
  return hits;
}

export function fileLines(root: string, path: string): string[] {
  try {
    return readFileSync(join(root, path), "utf8").split("\n");
  } catch {
    return [];
  }
}
