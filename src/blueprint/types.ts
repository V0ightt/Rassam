// Shared engine types. Every module in src/blueprint/ is isomorphic: no Node
// or browser APIs. Hosts (CLI, MCP server, GitHub Action, web canvas) supply
// file contents and git facts through these plain data shapes.

import type { Severity } from "./schema";

// ── Inputs ────────────────────────────────────────────────────

export interface SourceFile {
  /** Repository-relative POSIX path, e.g. "src/lib/ai.ts". */
  path: string;
  /** UTF-8 text, or null when unavailable (binary, oversized, unreadable). */
  content: string | null;
  size?: number;
}

export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "java"
  | "kotlin"
  | "rust"
  | "c"
  | "cpp"
  | "ruby"
  | "csharp"
  | "php"
  | "swift";

// ── Per-file facts (imports.ts, reach.ts) ─────────────────────

export type ImportKind = "static" | "dynamic" | "require" | "reexport" | "side-effect" | "include" | "use" | "mod";

/** An import statement as written in the source. */
export interface RawImport {
  specifier: string;
  /** 1-based line of the statement. */
  line: number;
  kind: ImportKind;
  /** TypeScript `import type` / `export type` (no runtime coupling). */
  typeOnly: boolean;
}

export type ResolvedImport =
  | { kind: "internal"; target: string }
  | { kind: "external"; pkg: string }
  | { kind: "unresolved" };

/** A resolved dependency from one repository file to another. */
export interface FileEdge {
  from: string;
  to: string;
  line: number;
  specifier: string;
  typeOnly: boolean;
}

/** A dependency on something outside the repository. */
export interface ExternalRef {
  from: string;
  /** Normalized package name: "react", "@scope/pkg", "node:fs", "github.com/x/y", "org.springframework". */
  pkg: string;
  line: number;
  specifier: string;
  typeOnly: boolean;
}

/** A read of an environment variable or secret, e.g. process.env.GITHUB_TOKEN. */
export interface EnvRef {
  file: string;
  name: string;
  line: number;
  /** Heuristic: name looks like a credential (TOKEN, KEY, SECRET, PASSWORD, ...). */
  secretLike: boolean;
}

export interface FileFacts {
  path: string;
  language: Language | null;
  isTest: boolean;
  imports: RawImport[];
  envRefs: EnvRef[];
}

/** The observed, file-level dependency graph of a snapshot. */
export interface FileGraph {
  files: string[];
  facts: Map<string, FileFacts>;
  edges: FileEdge[];
  externals: ExternalRef[];
  unresolved: Array<{ from: string; specifier: string; line: number }>;
}

// ── Component-level views (graph.ts) ──────────────────────────

export interface ComponentMembership {
  /** file path → component id */
  fileToComponent: Map<string, string>;
  /** component id → sorted file paths */
  componentFiles: Map<string, string[]>;
  unmapped: string[];
}

export interface ComponentEdge {
  from: string;
  to: string;
  /** File-level evidence, capped. */
  evidence: FileEdge[];
  count: number;
  /** True when every underlying import is type-only. */
  typeOnly: boolean;
}

export interface ComponentGraph {
  membership: ComponentMembership;
  edges: ComponentEdge[];
  /** component id → external packages it imports */
  externals: Map<string, string[]>;
  /** component id → env vars it reads */
  env: Map<string, EnvRef[]>;
  /** component id → test files that import it */
  tests: Map<string, string[]>;
}

// ── Change inputs (diff.ts) ───────────────────────────────────

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface DiffLine {
  /** Line number in the new file for added lines, in the old file for removed lines. */
  line: number;
  text: string;
}

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  added: DiffLine[];
  removed: DiffLine[];
  binary?: boolean;
}

/** Commit metadata used to detect agent authorship. */
export interface CommitInfo {
  sha: string;
  authorName: string;
  authorEmail: string;
  message: string;
}

export interface AgentActivity {
  commits: number;
  agentCommits: number;
  /** Agent names detected from authors and trailers, e.g. "Claude", "GitHub Copilot". */
  agents: string[];
}

// ── Agent reach (reach.ts) ────────────────────────────────────

export interface AgentConfigFile {
  path: string;
  /** e.g. "mcp", "claude-settings", "codex-config", "instructions" */
  type: "mcp" | "claude-settings" | "codex-config" | "gemini-settings" | "cursor-rules" | "instructions" | "workflow";
  agent: string;
}

export interface McpServerRef {
  name: string;
  configPath: string;
  agent: string;
  transport: "stdio" | "http" | "unknown";
  command?: string;
  url?: string;
  /** Env var names the server receives. */
  env: string[];
}

export interface InlineSecret {
  path: string;
  line: number;
  /** Where it was found, e.g. "mcpServers.github.env.GITHUB_TOKEN". */
  location: string;
  /** Redacted preview, never the secret itself, e.g. "ghp_…a1b2 (40 chars)". */
  preview: string;
  kind: string;
}

export interface PermissionGrant {
  path: string;
  agent: string;
  effect: "allow" | "deny" | "ask";
  rule: string;
  /** Heuristic: grants shell, network or write access without constraints. */
  broad: boolean;
}

export interface ReachReport {
  configs: AgentConfigFile[];
  mcpServers: McpServerRef[];
  inlineSecrets: InlineSecret[];
  permissions: PermissionGrant[];
  /** env var → components (or files when unmapped) that read it */
  envAccess: Array<{ name: string; secretLike: boolean; readers: string[]; files: string[] }>;
}

// ── Findings and reports (check.ts, report.ts) ────────────────

export type FindingKind =
  | "invalid-blueprint"
  | "forbidden-dependency"
  | "allow-only-violation"
  | "layer-violation"
  | "dependency-cycle"
  | "undeclared-dependency"
  | "unmapped-file"
  | "empty-component"
  | "protected-path"
  | "verification-weakened"
  | "contract-weakened"
  | "contract-changed"
  | "secret-access"
  | "inline-secret"
  | "agent-permission-change"
  | "assurance-drift"
  | "stale-verification"
  | "invariant-at-risk"
  | "invariant-failed";

export interface FindingLocation {
  path: string;
  line?: number;
  endLine?: number;
}

export interface Finding {
  /** Stable fingerprint: same violation → same id across runs. */
  id: string;
  kind: FindingKind;
  severity: Severity;
  ruleId?: string;
  title: string;
  message: string;
  /** The human-authored reason attached to the rule, if any. */
  reason?: string;
  components: string[];
  locations: FindingLocation[];
  /** Introduced by this change (diff mode). Always true in full mode. */
  isNew: boolean;
  /** Attention score: higher means look first. */
  score: number;
}

export interface BlueprintChange {
  kind:
    | "component-added"
    | "component-removed"
    | "component-changed"
    | "rule-added"
    | "rule-removed"
    | "rule-weakened"
    | "rule-strengthened"
    | "rule-changed"
    | "dependency-added"
    | "dependency-removed"
    | "invariant-added"
    | "invariant-removed"
    | "invariant-changed"
    | "decision-added"
    | "decision-removed"
    | "decision-changed"
    | "policy-weakened"
    | "policy-changed"
    | "verification-changed";
  target: string;
  summary: string;
  /** True when the change loosens the contract agents are judged by. */
  weakens: boolean;
}

export interface ImpactReport {
  changedFiles: string[];
  touchedComponents: Array<{ id: string; files: string[] }>;
  /** Components that depend (transitively) on touched components, nearest first. */
  dependents: Array<{ id: string; depth: number }>;
}

export interface CheckSummary {
  errors: number;
  warnings: number;
  infos: number;
  newFindings: number;
  components: number;
  filesAnalyzed: number;
  filesMapped: number;
  filesUnmapped: number;
  componentEdges: number;
  undeclaredEdges: number;
  /** Share (0..1) of blueprint facts asserted or verified by a human. */
  humanAuthoredRatio: number;
}

export interface CheckReport {
  tool: { name: "rassam"; version: string };
  generatedAt: string;
  mode: "full" | "diff";
  blueprint: { path: string; present: boolean; valid: boolean; system?: string };
  base?: { ref: string; sha?: string };
  head?: { ref: string; sha?: string };
  summary: CheckSummary;
  /** Sorted by score, highest first. */
  findings: Finding[];
  impact?: ImpactReport;
  contractChanges?: BlueprintChange[];
  agentActivity?: AgentActivity;
  reach?: ReachReport;
  /** True when a human approved contract changes (e.g. PR label). */
  approved?: boolean;
}
