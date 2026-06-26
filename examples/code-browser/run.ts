// Demo: plant a realistic repo (with a users/ decoy loop-trap), give the skep a raw user
// PROMPT (the queen turns it into work), and print the trace. Point it at any
// OpenAI-compatible endpoint via OPENAI_BASE_URL, or pass --mock for the no-network path.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skep, registerCell, type Bee, type RunEvent } from "@syntropy-systems/skep";
import { createDebugTui } from "@syntropy-systems/skep/debug/tui";
import { llmMind } from "@syntropy-systems/skep/agents/llm";
import { folderCell } from "./cells/fs/index.ts";
import { mockMind } from "./mock-mind.ts";

function plantRepo(root: string): void {
  rmSync(root, { recursive: true, force: true });
  const w = (rel: string, body: string) => {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, body);
  };
  w("src/menu-items/dashboard.js", `import { IconAffiliate } from '@tabler/icons-react';\nexport default { id: 'dashboard', icon: IconAffiliate, url: '/dashboard' };\n`);
  w("src/menu-items/staff.js", `import { IconUsers } from '@tabler/icons-react';\nexport default { id: 'staff', icon: IconUsers, url: '/staff' };\n`);
  w("src/menu-items/index.js", `export { default as dashboard } from './dashboard';\nexport { default as staff } from './staff';\n`);
  w("src/layout/MainLayout.jsx", `import Menu from './Menu';\nexport default function MainLayout(){ return <Menu/>; }\n`);
  w("src/layout/Menu.jsx", `import items from '../menu-items';\n// renders the sidebar nav items\n`);
  w("src/components/Button.jsx", `export const Button = () => null;\n`);
  for (let i = 1; i <= 30; i++) {
    w(`src/users/user${i}.js`, `export const user${i} = { id: ${i}, name: 'User ${i}', role: 'member' };\n`);
  }
  w("README.md", `# web-portal\nA dashboard app.\n`);
}

function countBees(bee: Bee): number {
  return 1 + bee.children.reduce((n, child) => n + countBees(child), 0);
}

async function main() {
  const debugTui = process.argv.includes("--tui") || process.env.SKEP_TUI === "1";
  const mockMode = process.argv.includes("--mock") || process.env.SKEP_AGENT === "mock";
  const debugEvents = debugTui ? createDebugTui({ clear: true, showEvents: true }) : undefined;

  const repoRoot = "/tmp/skep-fake-repo";
  plantRepo(repoRoot);

  const prompt =
    "I think the dashboard nav icon in the sidebar should be a graph. Which file defines that icon today, and which icon library does it come from?";

  let decoyMoves = 0;
  const onEvent = (e: RunEvent) => {
    if (e.type === "view") {
      debugEvents?.(e);
      return;
    }
    if (e.type === "spawn" && /user/i.test(e.goal)) decoyMoves++;
    if (debugEvents) {
      debugEvents(e);
      return;
    }
    if (e.type === "enter") console.log(`${"  ".repeat(e.depth)}┌─ ${e.bee.id} enters ${e.cell}  "${e.bee.goal}"`);
    if (e.type === "action") console.log(`   action(${e.name}) ${JSON.stringify(e.args)}`);
    if (e.type === "observe") console.log(`   note: ${e.text.split("\n")[0].slice(0, 88)}`);
    if (e.type === "spawn") console.log(`   spawn → ${e.child.id} ${e.cell}  "${e.goal}"`);
    if (e.type === "error") console.log(`   error(${e.name}): ${e.message}`);
    if (e.type === "resolve") console.log(`└─ ${e.bee.id} resolve [${e.result.outcome}] ${e.result.summary.slice(0, 88)}`);
  };

  const hive = skep({
    cells: [registerCell(folderCell(), { root: repoRoot, path: "." }, { describe: "Inspect the repository from its root folder.", as: "scout" })],
    mind: mockMode ? mockMind() : llmMind({ onRaw: (raw, d) => { if (!d) console.log("   ⚠ unparsed:", raw.slice(0, 110)); } }),
  });

  const comb = await hive.run(prompt, { budget: 25, maxSteps: 8, onEvent });

  console.log("\nPROMPT: " + prompt);
  console.log("AGENT:  " + (mockMode ? "mock" : "llm"));
  console.log("\n══ RESULT ══");
  console.log(`outcome=${comb.result.outcome}  budget ${comb.budgetUsed}/25  bees ${countBees(comb.queen)}  decoy(user) spawns ${decoyMoves}`);
  console.log("summary:", comb.result.summary);
  const correct = /tabler/i.test(comb.result.summary) && /dashboard|affiliate/i.test(comb.result.summary);
  console.log(correct ? "✓ summary names the library + the dashboard icon" : "… inspect summary for correctness");
}

main().catch((e) => { console.error("RUN FAILED:", e?.message ?? e); process.exit(1); });
