import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SuiteResult {
  name: string;
  passed: number;
  failed: number;
  exitCode: number;
}

/** True when this module is executed directly (not imported). */
export function isDirectExecution(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(metaUrl));
}

export function printSuiteSummary(result: SuiteResult): void {
  console.log(`\n── ${result.name}: ${result.passed} passed, ${result.failed} failed ──`);
}
