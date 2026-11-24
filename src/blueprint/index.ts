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
  type GraphCycle,
  type RuleSummary,
  type WorkspaceOptions,
} from "./workspace";
export { serializeFileGraph, deserializeFileGraph, filterFileGraph, type SerializedFileGraph } from "./snapshot";
export { deriveBlueprint, detectSystemName, type DeriveOptions } from "./derive";
export { renderAgentProse, renderAgentBlock, AGENTS_BLOCK_START, AGENTS_BLOCK_END, type AgentProseOptions } from "./prose";
export { stampVerification, verifiedIds } from "./verify";
export { syncBlueprint, type SyncOptions, type SyncResult } from "./sync";
export { buildFileGraph, languageOf, isTestPath, isIgnoredPath, normalizePackageName } from "./imports";
export { analyzeReach, isAgentConfigPath } from "./reach";
export { parseUnifiedDiff, fileAdded, matchTripwires, detectVerificationWeakening, WEAKENING_SIGNALS, type WeakeningSignal, type WeakeningSignalName } from "./diff";
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
  DEFAULT_APPROVE_LABEL,
  type FailOn,
  type Verdict,
  type GraphView,
} from "./report";
export {
  componentStateSchema,
  systemStatusSchema,
  parseSystemStatus,
  serializeSystemStatus,
  summarizeStatus,
  overallStatus,
  isStale,
  STATUS_PATH,
  type ComponentState,
  type ComponentStatus,
  type SystemStatus,
} from "./status";
export { diffArchitecture, type ArchitectureDiff, type ArchitectureEdge } from "./arch-diff";
export { layoutGraph } from "./layout";
export { renderSystemDiagram, renderStatusBadge, DIAGRAM_PALETTES } from "./diagram";
export {
  blueprintEditSchema,
  applyBlueprintEdits,
  describeEdits,
  summarizeBlueprintDelta,
  resolveComponentRef,
  BlueprintEditError,
  type BlueprintEdit,
  type BlueprintEditInput,
  type AppliedEdit,
  type BlueprintDelta,
} from "./edits";
export { parseIntent, suggestIntents, INTENT_EXAMPLES, type IntentResult } from "./intent";

export { calmGraphView, calmEdgeKey, type CalmGraphView, type CalmOptions } from "./calm";
