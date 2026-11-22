// Gate benchmark runner.
//
//   npx tsx bench/gate/run.ts                  readable table and summary
//   npx tsx bench/gate/run.ts --json           machine-readable results on stdout
//   npx tsx bench/gate/run.ts --case <id>      one case, with every finding the gate raised
//   npx tsx bench/gate/run.ts --write-results  refresh the generated block of RESULTS.md

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ENGINE_VERSION } from "../../src/blueprint/index";
import { ALL_CASES } from "./cases/index";
import { checkBaseline, checkCase, renderMarkdown, renderText, runBench, scoreCase } from "./harness";

const START_MARKER = "<!-- bench:generated:start -->";
const END_MARKER = "<!-- bench:generated:end -->";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function main(argv: string[]): void {
  const json = argv.includes("--json");
  const writeResults = argv.includes("--write-results");
  const caseFlag = argv.indexOf("--case");
  const caseId = caseFlag >= 0 ? argv[caseFlag + 1] : undefined;
  if (caseFlag >= 0 && !caseId) fail("--case needs a case id");

  const baseline = checkBaseline();
  if (baseline.summary.errors + baseline.summary.warnings > 0) {
    fail(`The unmodified fixture is not clean:\n${baseline.findings.map((finding) => `  ${finding.severity} ${finding.kind}: ${finding.title}`).join("\n")}`);
  }

  const cases = caseId ? ALL_CASES.filter((entry) => entry.id === caseId) : ALL_CASES;
  if (cases.length === 0) fail(`Unknown case "${caseId}". Known cases:\n${ALL_CASES.map((entry) => `  ${entry.id}`).join("\n")}`);

  if (caseId) {
    const benchCase = cases[0];
    const report = checkCase(benchCase);
    const result = scoreCase(benchCase, report);
    if (json) {
      process.stdout.write(`${JSON.stringify({ result, findings: report.findings, contractChanges: report.contractChanges }, null, 2)}\n`);
      return;
    }
    const lines = [
      `${benchCase.id} [${benchCase.category}] ${benchCase.description}`,
      `models: ${benchCase.source}`,
      `verdict: ${result.verdict}   ok: ${result.ok}`,
      "",
      "findings:",
      ...report.findings.map((finding) => (
        `  ${finding.isNew ? "new" : "old"} ${finding.severity.padEnd(7)} ${finding.kind}${finding.ruleId ? ` (${finding.ruleId})` : ""}: ${finding.title}`
      )),
      "",
      "expected:",
      ...result.expected.map((entry) => `  ${entry.detected ? "detected" : "MISSED  "} ${JSON.stringify(entry.expectation)}`),
      ...result.existing.map((entry) => `  ${entry.detected ? "pre-existing" : "MISSING pre-existing"} ${JSON.stringify(entry.expectation)}`),
      ...result.falsePositives.map((finding) => `  FALSE POSITIVE ${finding.severity} ${finding.kind}: ${finding.title}`),
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  const run = runBench(cases);
  const date = new Date().toISOString().slice(0, 10);

  if (writeResults) {
    const resultsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "RESULTS.md");
    const current = readFileSync(resultsPath, "utf8");
    const start = current.indexOf(START_MARKER);
    const end = current.indexOf(END_MARKER);
    if (start < 0 || end < start) fail(`RESULTS.md is missing the ${START_MARKER} / ${END_MARKER} markers`);
    const block = renderMarkdown(run, { date, engineVersion: ENGINE_VERSION });
    writeFileSync(resultsPath, `${current.slice(0, start + START_MARKER.length)}\n\n${block}\n\n${current.slice(end)}`);
    process.stderr.write(`Updated ${resultsPath}\n`);
  }

  if (json) {
    process.stdout.write(`${JSON.stringify({ date, engineVersion: ENGINE_VERSION, summary: run.summary, results: run.results }, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderText(run)}\n`);
  }
}

main(process.argv.slice(2));
