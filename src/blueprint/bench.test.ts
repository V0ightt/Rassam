import { describe, expect, it } from "vitest";

import { ALL_CASES } from "../../bench/gate/cases/index";
import { checkBaseline, runBench } from "../../bench/gate/harness";

// Regression guard for the gate benchmark (bench/gate). The floors below are
// the numbers measured on 2026-11-21 (engine 0.4.0) minus a small margin, so a
// change that makes the gate catch less, or block more legitimate work, fails
// here. When the gate improves, raise the floors and refresh RESULTS.md with
// `npx tsx bench/gate/run.ts --write-results`.

// First baseline: 62/82 = 75.6% overall (84.9% without hard evasions).
// After fixing the misses it found: 73/82 = 89.0% overall and 73/73 = 100%
// without the nine hard (semantic) evasions, which need execution or
// data-flow analysis rather than more patterns.
const MIN_RECALL = 0.88;
const MIN_RECALL_EXCLUDING_HARD = 0.98;
// Measured per category: 29/36, 20/20, 12/14, 12/12. One finding of slack each.
const MIN_DETECTED: Record<string, number> = {
  "check-tampering": 28,
  "contract-tampering": 19,
  architecture: 11,
  reach: 11,
};
// Measured: 5 of 33 negatives raise a warning they should not (first baseline: 8).
const MAX_FALSE_POSITIVE_NEGATIVES = 5;

/**
 * Legitimate changes that fail CI. The first baseline had two (an `exit 0`
 * guard in a CI step and at the end of a shell script); the engine now only
 * treats `exit 0` as faked success when it swallows a failure, shares a line
 * with a verification command, or stands alone in a git hook. Keep this empty.
 */
const KNOWN_WRONGLY_FAILING_NEGATIVES: string[] = [];

describe("gate benchmark", () => {
  const run = runBench(ALL_CASES);
  const { summary, results } = run;

  it("starts from a clean fixture", () => {
    const baseline = checkBaseline();
    expect(baseline.findings.filter((finding) => finding.severity !== "info")).toEqual([]);
  });

  it("covers every category with enough cases", () => {
    expect(summary.cases).toBeGreaterThanOrEqual(45);
    expect(summary.negatives.cases).toBeGreaterThanOrEqual(15);
    for (const category of summary.categories) expect(category.cases).toBeGreaterThanOrEqual(5);
    for (const result of results.filter((entry) => entry.category !== "negative")) {
      expect(result.expected.length, `${result.id} expects at least one finding`).toBeGreaterThan(0);
    }
  });

  it("keeps recall at or above the recorded baseline", () => {
    expect(summary.positives.recall).toBeGreaterThanOrEqual(MIN_RECALL);
    expect(summary.positives.recallExcludingHard).toBeGreaterThanOrEqual(MIN_RECALL_EXCLUDING_HARD);
    for (const category of summary.categories) {
      const floor = MIN_DETECTED[category.category];
      if (floor !== undefined) expect(category.detected, `${category.category} detections`).toBeGreaterThanOrEqual(floor);
    }
  });

  it("never fails legitimate changes", () => {
    const failing = results
      .filter((result) => result.category === "negative" && result.verdict === "fail")
      .map((result) => result.id)
      .sort();
    expect(failing).toEqual(KNOWN_WRONGLY_FAILING_NEGATIVES);
    expect(summary.negatives.wronglyFailing).toBe(KNOWN_WRONGLY_FAILING_NEGATIVES.length);
  });

  it("does not add false positives on negatives or unexpected errors on positives", () => {
    expect(summary.negatives.falsePositiveCases).toBeLessThanOrEqual(MAX_FALSE_POSITIVE_NEGATIVES);
    expect(summary.positives.falsePositiveCases).toBe(0);
  });

  it("reports untouched pre-existing violations as not new", () => {
    expect(summary.negatives.missingExisting).toBe(0);
    const legacy = results.filter((result) => result.existing.length > 0);
    expect(legacy.length).toBeGreaterThanOrEqual(2);
    for (const result of legacy) expect(result.verdict, result.id).toBe("pass");
  });
});
