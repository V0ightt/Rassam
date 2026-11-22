// Public API of the Rassam Blueprint engine. Isomorphic: used by the CLI, the
// MCP server, the GitHub Action and the web canvas.

export * from "./schema";
export * from "./types";
export * from "./constants";
export { compileGlob, matchesAny } from "./glob";
export { resolveSelector, describeSelector, matchesFile, matchesPackage, matchesComponent } from "./selectors";
export { assignComponents, buildComponentGraph, componentForPath, findCycles } from "./graph";
export { compileRules, evaluateRules, evaluatePolicy, edgeRuleHits, ruleSeverity, type Violation, type SnapshotModel } from "./rules";
export { computeImpact } from "./impact";
export { humanAuthoredRatio, authorshipStats, isHumanFact, type AuthorshipStats } from "./stats";
export { runCheck, buildSnapshotModel, reconstructBaseSnapshot, type CheckInput } from "./check";
export {
  createWorkspace,
  summarizeRule,
  type Workspace,
  type PathExplanation,
  type DependencyVerdict,
  type ComponentSummary,
  type BlueprintOverview,
  type WorkspaceGraphView,
  type RuleSummary,
  type WorkspaceOptions,
} from "./workspace";
export { serializeFileGraph, deserializeFileGraph, filterFileGraph, type SerializedFileGraph } from "./snapshot";
export { deriveBlueprint, detectSystemName, type DeriveOptions } from "./derive";
export { stampVerification, verifiedIds } from "./verify";
export { syncBlueprint, type SyncOptions, type SyncResult } from "./sync";
export { buildFileGraph, languageOf, isTestPath, isIgnoredPath, normalizePackageName } from "./imports";
export { analyzeReach, isAgentConfigPath } from "./reach";
export { parseUnifiedDiff, fileAdded, matchTripwires, detectVerificationWeakening } from "./diff";
export { diffBlueprints } from "./blueprint-diff";
export { detectAgentActivity } from "./agents";
export {
  renderText,
  renderMarkdown,
  renderSarif,
  renderGithubAnnotations,
  renderJson,
  renderMermaid,
  renderDot,
  verdict,
  exitCodeFor,
  COMMENT_MARKER,
  type FailOn,
  type Verdict,
  type GraphView,
} from "./report";
