/**
 * Sync Jest coverageThreshold from coverage/coverage-summary.json.
 *
 * Usage:
 *   npm run test:coverage              # produce coverage summary
 *   npm run coverage:sync-thresholds   # write coverage-thresholds.cjs from that summary
 *
 * The generated file is committed so CI enforces the same floors. Re-run sync after
 * improving coverage to raise the minimums — never edit the numbers by hand.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SUMMARY_PATH = path.join(ROOT, "coverage", "coverage-summary.json");
const OUTPUT_PATH = path.join(ROOT, "coverage-thresholds.cjs");

const FOLDER_KEYS = [
  { key: "src/middleware/", match: "src\\middleware\\" },
  { key: "src/permissions/", match: "src\\permissions\\" },
  { key: "src/validation/", match: "src\\validation\\" },
  { key: "src/routes/", match: "src\\routes\\" },
  { key: "src/services/", match: "src\\services\\" },
];

const METRICS = ["lines", "statements", "functions", "branches"];

function roundPct(covered, total) {
  if (!total) return 100;
  return Math.floor((covered / total) * 10000) / 100;
}

function aggregateFolder(summary, match) {
  const totals = Object.fromEntries(METRICS.map((m) => [m, { covered: 0, total: 0 }]));
  for (const [filePath, stats] of Object.entries(summary)) {
    if (filePath === "total" || !filePath.includes(match)) continue;
    for (const metric of METRICS) {
      totals[metric].covered += stats[metric].covered;
      totals[metric].total += stats[metric].total;
    }
  }
  return Object.fromEntries(
    METRICS.map((metric) => [
      metric,
      roundPct(totals[metric].covered, totals[metric].total),
    ]),
  );
}

function formatMeasured(covered, total) {
  return `${covered}/${total}`;
}

function buildReport(summary) {
  const lines = ["Measured coverage (source: coverage/coverage-summary.json):"];
  const total = summary.total;
  lines.push(
    `  global: lines ${total.lines.pct}% (${formatMeasured(total.lines.covered, total.lines.total)}), statements ${total.statements.pct}%`,
  );
  for (const { key, match } of FOLDER_KEYS) {
    const totals = Object.fromEntries(METRICS.map((m) => [m, { covered: 0, total: 0 }]));
    for (const [filePath, stats] of Object.entries(summary)) {
      if (filePath === "total" || !filePath.includes(match)) continue;
      for (const metric of METRICS) {
        totals[metric].covered += stats[metric].covered;
        totals[metric].total += stats[metric].total;
      }
    }
    const pct = (m) => roundPct(totals[m].covered, totals[m].total);
    lines.push(
      `  ${key}: lines ${pct("lines")}% (${formatMeasured(totals.lines.covered, totals.lines.total)}), statements ${pct("statements")}%, functions ${pct("functions")}%, branches ${pct("branches")}%`,
    );
  }
  return lines.join("\n * ");
}

function main() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error(`Missing ${SUMMARY_PATH}. Run npm run test:coverage first.`);
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8"));
  const generatedAt = new Date().toISOString();

  const threshold = {
    global: {
      lines: roundPct(summary.total.lines.covered, summary.total.lines.total),
      statements: roundPct(summary.total.statements.covered, summary.total.statements.total),
    },
  };

  for (const { key, match } of FOLDER_KEYS) {
    threshold[key] = aggregateFolder(summary, match);
  }

  const report = buildReport(summary);
  const contents = `/** AUTO-GENERATED — do not edit by hand.
 * Generated: ${generatedAt}
 * ${report}
 *
 * Regenerate: npm run coverage:sync-thresholds
 */
module.exports = ${JSON.stringify(threshold, null, 2)};
`;

  fs.writeFileSync(OUTPUT_PATH, contents, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(report.replace(/ \* /g, "\n"));
}

main();
