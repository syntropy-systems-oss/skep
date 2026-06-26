// Post-build: rewrite relative `.ts` import specifiers to `.js` in emitted .d.ts files.
// We author source with explicit `.ts` extensions (esbuild/tsx resolve them), but tsc's
// declaration emit keeps the `.ts` specifier verbatim, which downstream consumers cannot
// resolve. This rewrites `from "./x.ts"` / `import("../x.ts")` → `.js` so the published
// types resolve against the sibling `.d.ts`/`.js` files. Runs over dist/ after `tsc`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RELATIVE_TS = /(["'])(\.[^"']*?)\.ts\1/g;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let changed = 0;
for (const file of walk("dist")) {
  if (!file.endsWith(".d.ts")) continue;
  const src = readFileSync(file, "utf8");
  const out = src.replace(RELATIVE_TS, "$1$2.js$1");
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`fix-dts-extensions: rewrote ${changed} declaration file(s)`);
