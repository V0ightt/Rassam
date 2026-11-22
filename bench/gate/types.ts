// Types for the gate benchmark. A case is a labeled change (base → head) with
// the findings the gate is expected to raise, or the kinds it must not raise.

import type { Blueprint, CommitInfo, FindingKind, Severity, SourceFile } from "../../src/blueprint/index";

export type CaseCategory =
  | "check-tampering"
  | "contract-tampering"
  | "architecture"
  | "reach"
  | "negative";

export interface ExpectedFinding {
  kind: FindingKind;
  /** Substring the finding title must contain, e.g. the weakening signal slug "test-skipped". */
  signal?: string;
  ruleId?: string;
  /** A location of the finding must have this path. */
  path?: string;
  minSeverity?: Severity;
}

export interface BenchCase {
  id: string;
  category: CaseCategory;
  description: string;
  /** The documented behavior this case models. */
  source: string;
  baseFiles: SourceFile[];
  headFiles: SourceFile[];
  baseBlueprint: Blueprint | null;
  headBlueprint: Blueprint | null;
  commits?: CommitInfo[];
  /** Findings that must be raised as NEW. Empty for negatives. */
  expected: ExpectedFinding[];
  /** Kinds that must not appear as NEW warning/error findings (beyond the expected ones). */
  mustNotFlag?: FindingKind[];
  /**
   * Kinds that are true but incidental consequences of the change (e.g. the
   * `undeclared-dependency` that accompanies a forbidden import). They count
   * neither toward recall nor as false positives.
   */
  tolerated?: FindingKind[];
  /** Findings that must be reported as pre-existing (`isNew: false`). */
  expectedExisting?: ExpectedFinding[];
  /**
   * True for evasions the line-based heuristics are not designed to catch.
   * They stay in the recall denominator; the flag only groups the report.
   */
  hard?: boolean;
}
