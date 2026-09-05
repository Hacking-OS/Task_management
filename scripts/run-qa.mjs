/**
 * Combined QA orchestrator: TypeScript check → Jest (backend + frontend) → Playwright E2E
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function run(label: string, cmd: string, args: string[], cwd: string): number {
  console.log(`\n${"=".repeat(64)}\n▶ ${label}\n${"=".repeat(64)}\n`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
}

const steps: { label: string; cmd: string; args: string[]; cwd: string }[] = [
  { label: "Backend TypeScript", cmd: "npm", args: ["run", "typecheck"], cwd: path.join(root, "backend") },
  { label: "Backend Jest", cmd: "npm", args: ["run", "test:jest"], cwd: path.join(root, "backend") },
  { label: "Frontend Jest", cmd: "npm", args: ["run", "test:jest"], cwd: path.join(root, "frontend") },
  { label: "Playwright E2E", cmd: "npm", args: ["run", "test:e2e"], cwd: root },
];

let failed = 0;
for (const step of steps) {
  const code = run(step.label, step.cmd, step.args, step.cwd);
  if (code !== 0) failed += 1;
}

console.log(`\n${"=".repeat(64)}`);
console.log(`QA summary: ${steps.length - failed}/${steps.length} stages passed`);
if (failed > 0) process.exit(1);
