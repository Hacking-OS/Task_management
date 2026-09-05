/**
 * Run every backend QA / security test suite in sequence.
 * Usage: npm run test  (from backend or root)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..", "..");
const tsxCli = path.join(backendRoot, "node_modules", "tsx", "dist", "cli.mjs");

const SUITES: { id: string; name: string; file: string }[] = [
  { id: "security", name: "Security matrix", file: "securityTests.ts" },
  { id: "complex-qa", name: "Complex QA (multi-workspace)", file: "complexQaTests.ts" },
  { id: "auth-security", name: "Auth & invitation security", file: "authSecurityQaTests.ts" },
  { id: "refresh-auth", name: "Refresh token (cookie-only)", file: "refreshAuthQaTests.ts" },
  { id: "role-permission-refresh", name: "Role × permission × override × refresh", file: "rolePermissionRefreshQaTests.ts" },
];

console.log("Jellyfish backend — full test run\n");
console.log(`Suites: ${SUITES.length}\n`);

const results: { id: string; name: string; exitCode: number | null }[] = [];

for (const suite of SUITES) {
  const banner = `${"=".repeat(64)}\n▶ ${suite.name} (${suite.id})\n${"=".repeat(64)}`;
  console.log(`\n${banner}\n`);

  const suitePath = path.join(__dirname, suite.file);
  const proc = spawnSync(process.execPath, [tsxCli, suitePath], {
    cwd: backendRoot,
    stdio: "inherit",
    env: process.env,
  });

  results.push({ id: suite.id, name: suite.name, exitCode: proc.status });
}

console.log(`\n${"=".repeat(64)}`);
console.log("SUMMARY");
console.log("=".repeat(64));

let failedSuites = 0;
for (const r of results) {
  const ok = r.exitCode === 0;
  if (!ok) failedSuites += 1;
  console.log(`  ${ok ? "✓ PASS" : "✗ FAIL"}  ${r.name} (${r.id})`);
}

console.log(`\nTotal: ${results.length - failedSuites}/${results.length} suites passed`);

if (failedSuites > 0) {
  process.exit(1);
}
