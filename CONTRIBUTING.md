# Contributing to @syntropy-systems/skep

Thanks for your interest in improving Skep. This document covers the project layout,
local setup, and the conventions we follow.

## Requirements

- Node.js 20 or newer.

## Setup

```bash
npm install
```

`npm install` runs the `prepare` script, which builds `dist/` (esbuild bundles the runtime
to ESM and `tsc` emits `.d.ts` declarations).

## Project layout

```
src/framework/      The core — the bee engine, cells, actions, renderers, markup helpers,
                    skep()/run, and shared types. This is the public package surface.
src/agents/         Optional minds. agents/llm.ts is an OpenAI-compatible llmMind().
examples/           Runnable examples (not published to npm). The code-browser example is
                    a self-contained filesystem agent used by the integration tests.
test/               node:test suites. test/types/ is a consumer-perspective typecheck.
scripts/            Build helpers (not published).
```

Internal modules import each other with relative paths and explicit `.ts` extensions
(esbuild/tsx resolve them; the build rewrites them to `.js` in emitted declarations).
Only the curated names in `src/framework/index.ts` are public API.

## Workflow

```bash
npm run verify   # build + typecheck + consumer typecheck + tests — run before opening a PR
npm test         # build + run the test suite
npm run run:mock # exercise the code-browser example with no network
```

`npm run verify` is the gate: it must pass. The consumer typecheck
(`tsconfig.consumer.json`) compiles against the *emitted* declarations the way a downstream
package would, so it catches regressions in the published type surface.

## Conventions

- **Everything is a bee.** Resist adding parallel actor concepts (roles, special "queen"
  state, separate "capture" callbacks). A bee has a goal, a mind, and capabilities; that's
  the whole model. New behavior should be a cell, a capability, or a mind — not a new noun.
- **Keep the core domain-agnostic.** Filesystems, email, HTTP, MCP tools, etc. belong in
  cells (see `examples/`), never in `src/framework/`.
- **Curate the public API.** New root exports are a semver commitment — add them to
  `src/framework/index.ts` deliberately, and prefer keeping low-level runtime internals
  unexported.
- **No new runtime dependencies** without discussion. The published package currently has
  zero runtime dependencies.
- **Add tests** for behavior changes. Pure logic gets a unit test; runtime behavior gets a
  `runtime`/`example` test.
- Match the style of the surrounding code.

## Commits & PRs

Commits on `main` follow [Conventional Commits](https://www.conventionalcommits.org/) —
Release Please reads them to compute the next version and generate `CHANGELOG.md`:

- `feat: …` → minor, `fix: …` → patch, `docs:` / `chore:` / `refactor:` / `test:` → no release.
- Breaking changes: add `!` (`feat!: …`) or a `BREAKING CHANGE:` footer. While the version
  is `0.x`, breaking changes bump the minor (they'll bump major after `1.0.0`).
- Keep commits focused; confirm `npm run verify` passes before opening a PR.

## Releasing

Versioning is automated by [Release Please](https://github.com/googleapis/release-please).
Pushing Conventional Commits to `main` maintains a release PR that bumps the version
(`package.json` + `.release-please-manifest.json`) and updates `CHANGELOG.md`; merging that
PR tags the release. Don't hand-edit the version or changelog.

Publishing to npm is a separate, deliberate step (not yet automated):

```bash
npm run verify
npm publish --access public
```

The `@syntropy-systems` npm scope must grant publish access. When ready to ship on every
release, add an `npm publish` step to the release workflow gated on `release_created`.
