// Runs benchmark cases through the change gate and scores the reports.
// Pure and host-independent, so the CLI runner and the vitest suite share it.

import {
  runCheck,
  verdict,
  type CheckReport,
  type Finding,
  type FindingKind,
  type Severity,
  type Verdict,
} from "../../src/blueprint/index";
import { BASE_BLUEPRINT, BASE_FILES } from "./fixture";
import { diffSnapshots } from "./linediff";
import type { BenchCase, CaseCategory, ExpectedFinding } from "./types";

const SEVERITY_RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };
const FIXED_NOW = "2026-01-01T00:00:00.000Z";

export const CATEGORY_ORDER: readonly CaseCategory[] = [
  "check-tampering",
  "contract-tampering",
  "architecture",
  "reach",
  "negative",
];

export interface FindingSummary {
  kind: FindingKind;
  severity: Severity;
  title: string;
  ruleId?: string;
  paths: string[];
}

export interface ExpectationResult {
  expectation: ExpectedFinding;
  detected: boolean;
  /** Severity of the best matching finding, when detected. */
  severity?: Severity;
}

export interface CaseResult {
  id: string;
  category: CaseCategory;
  description: string;
  source: string;
  hard: boolean;
  expected: ExpectationResult[];
  /** `expectedExisting` entries and whether a pre-existing finding matched. */
  existing: ExpectationResult[];
  /** New warning/error findings that match no expectation and are not tolerated. */
  unexpected: FindingSummary[];
  /** Subset of `unexpected` that counts against precision: a `mustNotFlag` kind, or any error. */
  falsePositives: FindingSummary[];
  /** New warning/error findings of a tolerated kind. */
  tolerated: FindingSummary[];
  /** Verdict with `failOn: "error"`, the CLI default. */
  verdict: Verdict;
  /** Every expectation met and no false positive. */
  ok: boolean;
}

function summarize(finding: Finding): FindingSummary {
  return {
    kind: finding.kind,
    severity: finding.severity,
    title: finding.title,
    ruleId: finding.ruleId,
    paths: finding.locations.map((location) => location.path),
  };
}

export function matchesExpectation(finding: Finding, expectation: ExpectedFinding): boolean {
  if (finding.kind !== expectation.kind) return false;
  if (expectation.signal !== undefined && !finding.title.includes(expectation.signal)) return false;
  if (expectation.ruleId !== undefined && finding.ruleId !== expectation.ruleId) return false;
  if (expectation.path !== undefined && !finding.locations.some((location) => location.path === expectation.path)) return false;
  if (expectation.minSeverity !== undefined && SEVERITY_RANK[finding.severity] < SEVERITY_RANK[expectation.minSeverity]) return false;
  return true;
}

/** Run one case through the gate exactly as a host would in diff mode. */
export function checkCase(benchCase: BenchCase): CheckReport {
  const { changes, baseOfChanged } = diffSnapshots(benchCase.baseFiles, benchCase.headFiles);
  return runCheck({
    files: benchCase.headFiles,
    blueprint: benchCase.headBlueprint,
    baseBlueprint: benchCase.baseBlueprint,
    changes,
    baseFiles: baseOfChanged,
    commits: benchCase.commits,
    now: FIXED_NOW,
  });
}

function best(findings: readonly Finding[]): Severity | undefined {
  let top: Severity | undefined;
  for (const finding of findings) {
    if (!top || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[top]) top = finding.severity;
  }
  return top;
}

export function scoreCase(benchCase: BenchCase, report: CheckReport): CaseResult {
  const fresh = report.findings.filter((finding) => finding.isNew);
  const stale = report.findings.filter((finding) => !finding.isNew);
  const matched = new Set<Finding>();

  const expected = benchCase.expected.map((expectation): ExpectationResult => {
    const hits = fresh.filter((finding) => matchesExpectation(finding, expectation));
    for (const hit of hits) matched.add(hit);
    return { expectation, detected: hits.length > 0, severity: best(hits) };
  });
  const existing = (benchCase.expectedExisting ?? []).map((expectation): ExpectationResult => {
    const hits = stale.filter((finding) => matchesExpectation(finding, expectation));
    return { expectation, detected: hits.length > 0, severity: best(hits) };
  });

  const toleratedKinds = new Set(benchCase.tolerated ?? []);
  const forbiddenKinds = new Set(benchCase.mustNotFlag ?? []);
  const loud = fresh.filter((finding) => finding.severity !== "info" && !matched.has(finding));
  const tolerated = loud.filter((finding) => toleratedKinds.has(finding.kind));
  const unexpected = loud.filter((finding) => !toleratedKinds.has(finding.kind));
  const falsePositive = (finding: Finding): boolean => forbiddenKinds.has(finding.kind) || finding.severity === "error";
  const falsePositives = unexpected.filter(falsePositive);
  const unexpectedSummaries = unexpected.map(summarize);

  return {
    id: benchCase.id,
    category: benchCase.category,
    description: benchCase.description,
    source: benchCase.source,
    hard: Boolean(benchCase.hard),
    expected,
    existing,
    unexpected: unexpectedSummaries,
    falsePositives: unexpectedSummaries.filter((_, index) => falsePositive(unexpected[index])),
    tolerated: tolerated.map(summarize),
    verdict: verdict(report, "error"),
    ok: expected.every((entry) => entry.detected) && existing.every((entry) => entry.detected) && falsePositives.length === 0,
  };
}

export function runCase(benchCase: BenchCase): CaseResult {
  return scoreCase(benchCase, checkCase(benchCase));
}

// ── Aggregation ───────────────────────────────────────────────

export interface CategorySummary {
  category: CaseCategory;
  cases: number;
  expected: number;
  detected: number;
  /** detected / expected; null when the category expects nothing (negatives). */
  recall: number | null;
  falsePositiveCases: number;
  falsePositiveFindings: number;
  verdicts: Record<Verdict, number>;
}

export interface BenchSummary {
  cases: number;
  positives: {
    cases: number;
    expected: number;
    detected: number;
    recall: number;
    /** Recall without the cases marked `hard` (evasions the heuristics are not designed to catch). */
    recallExcludingHard: number;
    hardCases: number;
    hardExpected: number;
    hardDetected: number;
    /** Positive cases in which every expected finding was raised. */
    fullyDetectedCases: number;
    /** Positive cases the gate would fail with `failOn: "error"`. */
    failing: number;
    /** Positive cases that only warn (CI stays green; a human must read the report). */
    warningOnly: number;
    /** Positive cases with verdict `pass`: nothing loud was raised at all. */
    silent: number;
    /** Positive cases with at least one unexpected error or `mustNotFlag` hit. */
    falsePositiveCases: number;
  };
  negatives: {
    cases: number;
    /** Verdict `pass`: no new warning or error. */
    clean: number;
    /** Verdict `warn`: surfaced for review (usually a tripwire), CI stays green. */
    warned: number;
    /** Verdict `fail`: a legitimate change the gate would block. */
    wronglyFailing: number;
    /** Negative cases with a `mustNotFlag` hit or an unexpected error. */
    falsePositiveCases: number;
    falsePositiveRate: number;
    /** `expectedExisting` entries not reported as pre-existing. */
    missingExisting: number;
  };
  /** detected expected findings / (detected expected findings + false-positive findings), all cases. */
  precisionProxy: number;
  falsePositiveFindings: number;
  categories: CategorySummary[];
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function count<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function sum<T>(items: readonly T[], valueOf: (item: T) => number): number {
  return items.reduce((total, item) => total + valueOf(item), 0);
}

const expectedOf = (result: CaseResult): number => result.expected.length;
const detectedOf = (result: CaseResult): number => count(result.expected, (entry) => entry.detected);

export function summarizeResults(results: readonly CaseResult[]): BenchSummary {
  const positives = results.filter((result) => result.category !== "negative");
  const negatives = results.filter((result) => result.category === "negative");
  const hard = positives.filter((result) => result.hard);
  const regular = positives.filter((result) => !result.hard);
  const detected = sum(positives, detectedOf);
  const falsePositiveFindings = sum(results, (result) => result.falsePositives.length);

  const categories = CATEGORY_ORDER.map((category): CategorySummary => {
    const group = results.filter((result) => result.category === category);
    const expected = sum(group, expectedOf);
    const found = sum(group, detectedOf);
    return {
      category,
      cases: group.length,
      expected,
      detected: found,
      recall: expected === 0 ? null : found / expected,
      falsePositiveCases: count(group, (result) => result.falsePositives.length > 0),
      falsePositiveFindings: sum(group, (result) => result.falsePositives.length),
      verdicts: {
        pass: count(group, (result) => result.verdict === "pass"),
        warn: count(group, (result) => result.verdict === "warn"),
        fail: count(group, (result) => result.verdict === "fail"),
      },
    };
  }).filter((entry) => entry.cases > 0);

  const negativeFalsePositives = count(negatives, (result) => result.falsePositives.length > 0);
  return {
    cases: results.length,
    positives: {
      cases: positives.length,
      expected: sum(positives, expectedOf),
      detected,
      recall: ratio(detected, sum(positives, expectedOf)),
      recallExcludingHard: ratio(sum(regular, detectedOf), sum(regular, expectedOf)),
      hardCases: hard.length,
      hardExpected: sum(hard, expectedOf),
      hardDetected: sum(hard, detectedOf),
      fullyDetectedCases: count(positives, (result) => result.expected.every((entry) => entry.detected)),
      failing: count(positives, (result) => result.verdict === "fail"),
      warningOnly: count(positives, (result) => result.verdict === "warn"),
      silent: count(positives, (result) => result.verdict === "pass"),
      falsePositiveCases: count(positives, (result) => result.falsePositives.length > 0),
    },
    negatives: {
      cases: negatives.length,
      clean: count(negatives, (result) => result.verdict === "pass"),
      warned: count(negatives, (result) => result.verdict === "warn"),
      wronglyFailing: count(negatives, (result) => result.verdict === "fail"),
      falsePositiveCases: negativeFalsePositives,
      falsePositiveRate: negatives.length === 0 ? 0 : negativeFalsePositives / negatives.length,
      missingExisting: sum(negatives, (result) => count(result.existing, (entry) => !entry.detected)),
    },
    precisionProxy: ratio(detected, detected + falsePositiveFindings),
    falsePositiveFindings,
    categories,
  };
}

export interface BenchRun {
  results: CaseResult[];
  summary: BenchSummary;
}

export function assertUniqueIds(cases: readonly BenchCase[]): void {
  const seen = new Set<string>();
  for (const benchCase of cases) {
    if (seen.has(benchCase.id)) throw new Error(`Duplicate benchmark case id "${benchCase.id}"`);
    seen.add(benchCase.id);
  }
}

export function runBench(cases: readonly BenchCase[]): BenchRun {
  assertUniqueIds(cases);
  const results = cases.map(runCase);
  return { results, summary: summarizeResults(results) };
}

/**
 * The unmodified fixture checked in full mode. A benchmark is only meaningful
 * when the base is clean, so callers assert this has no warnings or errors.
 */
export function checkBaseline(): CheckReport {
  const files = Object.entries(BASE_FILES).map(([path, content]) => ({ path, content, size: content.length }));
  return runCheck({ files, blueprint: BASE_BLUEPRINT, now: FIXED_NOW });
}

// ── Rendering ─────────────────────────────────────────────────

export function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function describeExpectation(expectation: ExpectedFinding): string {
  const details = [expectation.signal, expectation.ruleId && `rule ${expectation.ruleId}`, expectation.minSeverity && `>=${expectation.minSeverity}`]
    .filter((part): part is string => Boolean(part));
  return details.length ? `${expectation.kind} [${details.join(", ")}]` : expectation.kind;
}

function describeFinding(finding: FindingSummary): string {
  return `${finding.kind}/${finding.severity}`;
}

function groupCounts(items: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].map(([label, total]) => (total > 1 ? `${label} x${total}` : label)).join(", ");
}

function expectedCell(result: CaseResult): string {
  if (result.category === "negative") {
    return result.existing.length ? `pre-existing ${result.existing.map((entry) => entry.expectation.kind).join(", ")}` : "(nothing)";
  }
  return result.expected.map((entry) => describeExpectation(entry.expectation)).join("; ");
}

function detectedCell(result: CaseResult): string {
  if (result.category === "negative") {
    if (result.existing.length) {
      const found = count(result.existing, (entry) => entry.detected);
      return `${found}/${result.existing.length} as pre-existing`;
    }
    return result.falsePositives.length ? "FALSE POSITIVE" : "ok";
  }
  const found = detectedOf(result);
  const severities = groupCounts(result.expected.filter((entry) => entry.severity).map((entry) => entry.severity as string));
  return `${found}/${result.expected.length}${severities ? ` (${severities})` : ""}${found < result.expected.length ? " MISSED" : ""}`;
}

function extrasCell(result: CaseResult): string {
  const parts: string[] = [];
  if (result.falsePositives.length) parts.push(`FP: ${groupCounts(result.falsePositives.map(describeFinding))}`);
  const benign = result.unexpected.filter((finding) => !result.falsePositives.includes(finding));
  if (benign.length) parts.push(groupCounts(benign.map(describeFinding)));
  if (result.tolerated.length) parts.push(`tolerated: ${groupCounts(result.tolerated.map(describeFinding))}`);
  return parts.join("; ") || "-";
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => row[column].length)));
  const line = (cells: string[]): string => cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd();
  return [line(headers), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
}

function markdownTable(headers: string[], rows: string[][]): string {
  const escape = (cell: string): string => cell.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

const CASE_HEADERS = ["case", "category", "expected", "detected", "verdict", "extra findings"];

function caseRows(results: readonly CaseResult[]): string[][] {
  return results.map((result) => [
    result.hard ? `${result.id} (hard)` : result.id,
    result.category,
    expectedCell(result),
    detectedCell(result),
    result.verdict,
    extrasCell(result),
  ]);
}

const CATEGORY_HEADERS = ["category", "cases", "expected", "detected", "recall", "FP cases", "fail", "warn", "pass"];

function categoryRows(summary: BenchSummary): string[][] {
  return summary.categories.map((entry) => [
    entry.category,
    String(entry.cases),
    String(entry.expected),
    String(entry.detected),
    percent(entry.recall),
    String(entry.falsePositiveCases),
    String(entry.verdicts.fail),
    String(entry.verdicts.warn),
    String(entry.verdicts.pass),
  ]);
}

export function summaryLines(summary: BenchSummary): string[] {
  const { positives, negatives } = summary;
  return [
    `Cases: ${summary.cases} (${positives.cases} positive, ${negatives.cases} negative)`,
    `Recall: ${percent(positives.recall)} (${positives.detected}/${positives.expected} expected findings raised as new)`,
    `Recall excluding hard evasions: ${percent(positives.recallExcludingHard)}; hard evasions alone: ${positives.hardDetected}/${positives.hardExpected} (${positives.hardCases} cases)`,
    `Positive cases fully detected: ${positives.fullyDetectedCases}/${positives.cases}`,
    `Positive verdicts (fail-on error): ${positives.failing} fail, ${positives.warningOnly} warn only, ${positives.silent} pass silently`,
    `Negative verdicts (fail-on error): ${negatives.wronglyFailing} wrongly fail, ${negatives.warned} warn, ${negatives.clean} pass clean`,
    `Negatives with a false positive: ${negatives.falsePositiveCases}/${negatives.cases} (${percent(negatives.falsePositiveRate)})`,
    `Positives with an unexpected extra error: ${positives.falsePositiveCases}/${positives.cases}`,
    `Precision proxy: ${percent(summary.precisionProxy)} (${positives.detected} true findings, ${summary.falsePositiveFindings} false-positive findings)`,
  ];
}

export function renderText(run: BenchRun): string {
  return [
    table(CASE_HEADERS, caseRows(run.results)),
    "",
    table(CATEGORY_HEADERS, categoryRows(run.summary)),
    "",
    ...summaryLines(run.summary),
  ].join("\n");
}

/** The generated block of RESULTS.md. */
export function renderMarkdown(run: BenchRun, meta: { date: string; engineVersion: string }): string {
  return [
    `Measured on ${meta.date} against engine version ${meta.engineVersion}.`,
    "",
    "### Summary",
    "",
    ...summaryLines(run.summary).map((line) => `- ${line}`),
    "",
    "### By category",
    "",
    markdownTable(CATEGORY_HEADERS, categoryRows(run.summary)),
    "",
    "### By case",
    "",
    markdownTable(CASE_HEADERS, caseRows(run.results)),
  ].join("\n");
}
