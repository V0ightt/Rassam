import { createHash } from "node:crypto";
import path from "node:path";

import type { EdgeData, NodeCategory, NodeData } from "@/types";

import { ApiError } from "./api-error";
import { MAX_ANALYSIS_FILE_BYTES, type EvidenceRef } from "./contracts";
import type { RepoNode } from "./github";
import { buildFileGraph } from "@/blueprint/imports";

const posix = path.posix;
const SEMANTIC_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const STRUCTURAL_EXTENSIONS = new Set([
  ".py", ".go", ".rs", ".java", ".kt", ".kts", ".swift", ".rb", ".php",
  ".cs", ".fs", ".fsx", ".c", ".cc", ".cpp", ".h", ".hpp", ".scala",
]);
const DOCUMENTATION_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const ASSET_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
  ".mp3", ".mp4", ".mov", ".woff", ".woff2", ".ttf", ".eot", ".svg",
]);
const CONFIG_NAMES = new Set([
  "package.json", "tsconfig.json", "jsconfig.json", "next.config.js", "next.config.mjs",
  "next.config.ts", "vite.config.js", "vite.config.ts", "webpack.config.js",
  "webpack.config.ts",
]);
const LOCK_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb",
  "composer.lock", "cargo.lock", "poetry.lock", "go.sum",
]);

const IGNORE_SEGMENTS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".output", "dist", "build", "coverage",
  "vendor", "target", "out", ".cache", ".turbo",
]);

export type CoverageBucket = "analyzed" | "ignored" | "unsupported" | "oversized" | "failed" | "unclassified";
export type AnalysisLevel = "semantic" | "structural" | "manifest";

export interface CoverageFile {
  path: string;
  reason: string;
  analysisLevel?: AnalysisLevel;
}

export interface AnalysisCoverage {
  treeComplete: true;
  discovered: number;
  counts: Record<CoverageBucket, number>;
  analyzed: CoverageFile[];
  ignored: CoverageFile[];
  unsupported: CoverageFile[];
  oversized: CoverageFile[];
  failed: CoverageFile[];
  unclassified: CoverageFile[];
}

export interface AnalysisSource {
  path: string;
  blobSha: string;
  content: string | null;
  error?: string;
}

export interface EvidenceNodeData extends NodeData {
  evidence: EvidenceRef[];
  analysisLevel: AnalysisLevel;
  confidence: "medium" | "high";
}

export interface EvidenceEdgeData extends EdgeData {
  evidence: EvidenceRef[];
  confidence: "high";
}

export interface DeterministicNode {
  id: string;
  type: "enhanced";
  position: { x: number; y: number };
  data: EvidenceNodeData;
}

export interface DeterministicEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: "custom";
  animated: false;
  data: EvidenceEdgeData;
  style: { strokeWidth: number };
  markerEnd: { type: "arrowclosed"; color: string };
}

export interface DeterministicAnalysis {
  nodes: DeterministicNode[];
  edges: DeterministicEdge[];
  coverage: AnalysisCoverage;
  warnings: string[];
  analyzer: {
    id: "rassam-deterministic";
    version: 1;
    semanticLanguages: ["javascript", "typescript"];
  };
}

interface GroupDescriptor {
  key: string;
  label: string;
  description: string;
  category: NodeCategory;
}

function stableId(prefix: string, value: string): string {
  const hex = createHash("sha256").update(`${prefix}:${value}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const valueHex = hex.join("");
  return `${valueHex.slice(0, 8)}-${valueHex.slice(8, 12)}-${valueHex.slice(12, 16)}-${valueHex.slice(16, 20)}-${valueHex.slice(20)}`;
}

function words(value: string): string {
  const result = value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return result ? result.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Root";
}

function withoutRouteGroups(segments: string[]): string[] {
  return segments.filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
}

function describeGroup(filePath: string, level: AnalysisLevel): GroupDescriptor {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const lower = normalized.toLowerCase();
  const base = posix.basename(normalized, posix.extname(normalized));

  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(lower) || segments.some((segment) => segment === "__tests__" || segment === "tests")) {
    return { key: "tests", label: "Tests", description: "Automated test sources", category: "test" };
  }

  const appIndex = segments.findIndex((segment) => segment === "app");
  if (appIndex >= 0) {
    const appSegments = withoutRouteGroups(segments.slice(appIndex + 1));
    if (appSegments[0] === "api") {
      const route = appSegments.slice(1, -1).join("/") || "root";
      return { key: `api:${route}`, label: `API ${route === "root" ? "Root" : `/${route}`}`, description: "Next.js API route and its local source files", category: "api" };
    }
    if (/\/(page|layout|loading|error|not-found)\.[cm]?[jt]sx?$/.test(lower)) {
      const route = appSegments.slice(0, -1).join("/") || "root";
      return { key: `route:${route}`, label: route === "root" ? "Root Route" : `Route /${route}`, description: "Next.js application route and layout boundary", category: "route" };
    }
  }

  const pagesIndex = segments.findIndex((segment) => segment === "pages");
  if (pagesIndex >= 0) {
    const pageSegments = segments.slice(pagesIndex + 1);
    if (pageSegments[0] === "api") {
      const route = pageSegments.slice(1).join("/").replace(/\.[^.]+$/, "") || "root";
      return { key: `api:${route}`, label: `API /${route}`, description: "Next.js API route", category: "api" };
    }
    const pagePath = pageSegments.join("/").replace(/\.[^.]+$/, "");
    const route = pagePath === "index" ? "root" : pagePath.replace(/\/index$/, "") || "root";
    return { key: `route:${route}`, label: route === "root" ? "Root Route" : `Route /${route}`, description: "Next.js page route", category: "route" };
  }

  const conventions: Array<{ segment: string; category: NodeCategory; plural: string }> = [
    { segment: "components", category: "component", plural: "Components" },
    { segment: "hooks", category: "hook", plural: "Hooks" },
    { segment: "services", category: "service", plural: "Services" },
    { segment: "context", category: "context", plural: "Context" },
    { segment: "contexts", category: "context", plural: "Context" },
    { segment: "models", category: "model", plural: "Models" },
    { segment: "middleware", category: "middleware", plural: "Middleware" },
    { segment: "utils", category: "utility", plural: "Utilities" },
    { segment: "utilities", category: "utility", plural: "Utilities" },
  ];
  for (const convention of conventions) {
    const index = segments.findIndex((segment) => segment === convention.segment);
    if (index < 0) continue;
    const child = segments[index + 1];
    const directFile = !child || child.includes(".");
    const name = directFile ? base : child;
    return {
      key: `${convention.segment}:${name}`,
      label: directFile ? words(name) : `${words(name)} ${convention.plural}`,
      description: `${convention.plural} grouped from repository structure`,
      category: convention.category,
    };
  }

  const libIndex = segments.findIndex((segment) => segment === "lib");
  if (libIndex >= 0) {
    const child = segments[libIndex + 1];
    const name = !child || child.includes(".") ? base : child;
    return { key: `lib:${name}`, label: words(name), description: "Shared library module", category: "utility" };
  }

  if (CONFIG_NAMES.has(posix.basename(lower))) {
    return { key: "configuration", label: "Configuration", description: "Repository and build configuration", category: "config" };
  }

  const top = segments[0] === "src" && segments.length > 2 ? segments[1] : segments[0];
  const name = top.includes(".") ? base : top;
  return {
    key: `${level}:${name}`,
    label: words(name),
    description: level === "structural" ? "Structurally grouped source module" : "Repository source module",
    category: level === "structural" ? "core" : "default",
  };
}

function secretLike(filePath: string): boolean {
  const base = posix.basename(filePath).toLowerCase();
  return /^\.env(?:\.|$)/.test(base)
    || /(?:^|[._-])(secret|secrets|credentials?|private[-_]?key|id_rsa)(?:[._-]|$)/i.test(base)
    || /\.(pem|key|p12|pfx|jks)$/i.test(base);
}

function classifyFile(node: RepoNode): { bucket: CoverageBucket; reason: string; level?: AnalysisLevel } {
  const lower = node.path.toLowerCase();
  const base = posix.basename(lower);
  const extension = posix.extname(lower);
  const segments = lower.split("/");

  if (secretLike(lower)) return { bucket: "ignored", reason: "credential or secret pattern" };
  if (segments.some((segment) => IGNORE_SEGMENTS.has(segment))) return { bucket: "ignored", reason: "generated, dependency, or build directory" };
  if (LOCK_NAMES.has(base) || base.endsWith(".min.js") || base.endsWith(".map")) return { bucket: "ignored", reason: "lock or generated file" };
  if (ASSET_EXTENSIONS.has(extension)) return { bucket: "ignored", reason: "binary or media asset" };
  if (DOCUMENTATION_EXTENSIONS.has(extension)) return { bucket: "ignored", reason: "documentation is not part of structural dependency analysis" };
  if ((node.size ?? 0) > MAX_ANALYSIS_FILE_BYTES) return { bucket: "oversized", reason: `file exceeds ${MAX_ANALYSIS_FILE_BYTES} bytes` };
  if (SEMANTIC_EXTENSIONS.has(extension)) return { bucket: "analyzed", reason: "JavaScript/TypeScript semantic analysis", level: "semantic" };
  if (CONFIG_NAMES.has(base)) return { bucket: "analyzed", reason: "repository manifest or configuration", level: "manifest" };
  if (STRUCTURAL_EXTENSIONS.has(extension)) return { bucket: "analyzed", reason: "structural-only language analysis", level: "structural" };
  if (extension) return { bucket: "unsupported", reason: `unsupported file type ${extension}` };
  return { bucket: "unclassified", reason: "file type could not be classified" };
}

export function selectSemanticSourceCandidates(nodes: RepoNode[]): RepoNode[] {
  return nodes
    .filter((node) => node.type === "blob")
    .filter((node) => {
      const classification = classifyFile(node);
      return classification.bucket === "analyzed" && (classification.level === "semantic" || classification.level === "manifest");
    });
}

function extractExports(content: string): string[] {
  const names = new Set<string>();
  const pattern = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null && names.size < 50) names.add(match[1]);
  return [...names];
}

function complexityFor(fileCount: number): "low" | "medium" | "high" {
  if (fileCount <= 3) return "low";
  if (fileCount <= 8) return "medium";
  return "high";
}

export function analyzeRepositoryDeterministically(
  repoNodes: RepoNode[],
  sourceRecords: AnalysisSource[],
): DeterministicAnalysis {
  const blobs = repoNodes.filter((node) => node.type === "blob");
  const blobByPath = new Map(blobs.map((node) => [node.path, node]));
  const trustedSourceRecords = sourceRecords.filter((record) => (
    blobByPath.get(record.path)?.sha.toLowerCase() === record.blobSha.toLowerCase()
  ));
  const sourceByPath = new Map(trustedSourceRecords.map((record) => [record.path, record]));
  const coverageLists: Record<CoverageBucket, CoverageFile[]> = {
    analyzed: [], ignored: [], unsupported: [], oversized: [], failed: [], unclassified: [],
  };
  const grouped = new Map<string, {
    descriptor: GroupDescriptor;
    level: AnalysisLevel;
    files: RepoNode[];
    exports: Set<string>;
    dependencies: Set<string>;
  }>();
  const fileToGroup = new Map<string, string>();

  for (const node of blobs) {
    const classification = classifyFile(node);
    if (classification.bucket !== "analyzed" || !classification.level) {
      coverageLists[classification.bucket].push({ path: node.path, reason: classification.reason });
      continue;
    }

    const record = sourceByPath.get(node.path);
    if ((classification.level === "semantic" || classification.level === "manifest") && (!record || record.error || record.content === null)) {
      coverageLists.failed.push({ path: node.path, reason: record?.error || "source content was unavailable" });
      continue;
    }

    coverageLists.analyzed.push({ path: node.path, reason: classification.reason, analysisLevel: classification.level });
    const descriptor = describeGroup(node.path, classification.level);
    const existing = grouped.get(descriptor.key) || {
      descriptor,
      level: classification.level,
      files: [],
      exports: new Set<string>(),
      dependencies: new Set<string>(),
    };
    existing.files.push(node);
    if (existing.level !== "semantic" && classification.level === "semantic") existing.level = "semantic";
    grouped.set(descriptor.key, existing);
    fileToGroup.set(node.path, descriptor.key);

    if (record?.content) extractExports(record.content).forEach((name) => existing.exports.add(name));
  }

  const nodes: DeterministicNode[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => ({
      id: stableId("node", key),
      type: "enhanced",
      position: { x: 0, y: 0 },
      data: {
        label: group.descriptor.label,
        description: group.descriptor.description,
        files: group.files.map((file) => file.path).sort(),
        category: group.descriptor.category,
        complexity: complexityFor(group.files.length),
        dependencies: [],
        exports: [...group.exports].sort(),
        evidence: group.files.map((file) => ({
          path: file.path,
          blobSha: file.sha,
          kind: group.level === "structural" ? "structural" : group.level === "manifest" ? "manifest" : "file-membership",
          confidence: group.level === "structural" ? "medium" : "high",
        })),
        analysisLevel: group.level,
        confidence: group.level === "structural" ? "medium" : "high",
      },
    }));

  const nodeIdByGroup = new Map(nodes.map((node) => [
    fileToGroup.get(node.data.files[0])!,
    node.id,
  ]));
  const edgeEvidence = new Map<string, { source: string; target: string; evidence: EvidenceRef[] }>();
  // Edges come from the blueprint engine's import graph: comment-aware
  // extraction and tsconfig/workspace-aware resolution shared with the gate.
  const fileGraph = buildFileGraph([
    ...trustedSourceRecords.map((record) => ({ path: record.path, content: record.content })),
    ...blobs.filter((node) => !sourceByPath.has(node.path)).map((node) => ({ path: node.path, content: null, size: node.size })),
  ]);
  for (const ref of fileGraph.externals) {
    const sourceGroup = fileToGroup.get(ref.from);
    if (sourceGroup && !ref.pkg.startsWith("node:")) grouped.get(sourceGroup)?.dependencies.add(ref.pkg);
  }
  for (const edge of fileGraph.edges) {
    const sourceGroup = fileToGroup.get(edge.from);
    const targetGroup = fileToGroup.get(edge.to);
    if (!sourceGroup || !targetGroup || targetGroup === sourceGroup) continue;
    const sourceId = nodeIdByGroup.get(sourceGroup);
    const targetId = nodeIdByGroup.get(targetGroup);
    const sourceFile = blobByPath.get(edge.from);
    if (!sourceId || !targetId || !sourceFile || !blobByPath.has(edge.to)) continue;
    const key = `${sourceId}->${targetId}`;
    const aggregate = edgeEvidence.get(key) || { source: sourceId, target: targetId, evidence: [] };
    aggregate.evidence.push({
      path: sourceFile.path,
      blobSha: sourceFile.sha,
      startLine: edge.line,
      endLine: edge.line,
      kind: "import",
      confidence: "high",
    });
    edgeEvidence.set(key, aggregate);
  }

  // Dependencies are collected after node construction, so copy them into the
  // public node data without changing file membership or identifiers.
  for (const node of nodes) {
    const groupKey = fileToGroup.get(node.data.files[0]);
    node.data.dependencies = groupKey ? [...(grouped.get(groupKey)?.dependencies || [])].sort() : [];
  }

  const edges: DeterministicEdge[] = [...edgeEvidence.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, aggregate]) => ({
      id: stableId("edge", key),
      source: aggregate.source,
      target: aggregate.target,
      label: "imports",
      type: "custom",
      animated: false,
      data: {
        label: "imports",
        type: "import",
        strength: aggregate.evidence.length >= 4 ? "strong" : "normal",
        direction: "one-way",
        evidence: aggregate.evidence,
        confidence: "high",
      },
      style: { strokeWidth: aggregate.evidence.length >= 4 ? 3 : 2 },
      markerEnd: { type: "arrowclosed", color: "#64748b" },
    }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  if (edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
    throw new ApiError("ANALYSIS_FAILED", 500, "Analysis produced an invalid relationship graph");
  }
  const repositoryContainsAnalyzableSource = blobs.some((node) => classifyFile(node).bucket === "analyzed");
  if (repositoryContainsAnalyzableSource && nodes.length === 0) {
    throw new ApiError("ANALYSIS_FAILED", 500, "Repository analysis did not produce a usable map");
  }

  const counts = Object.fromEntries(
    (Object.keys(coverageLists) as CoverageBucket[]).map((bucket) => [bucket, coverageLists[bucket].length]),
  ) as Record<CoverageBucket, number>;
  const accounted = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (accounted !== blobs.length) {
    throw new ApiError("ANALYSIS_FAILED", 500, "Repository analysis did not account for every file");
  }

  const warnings: string[] = [];
  if (coverageLists.failed.length > 0) warnings.push(`${coverageLists.failed.length} source files could not be read.`);
  if (coverageLists.oversized.length > 0) warnings.push(`${coverageLists.oversized.length} oversized files were excluded.`);
  if (coverageLists.unsupported.length > 0) warnings.push(`${coverageLists.unsupported.length} unsupported files were not analyzed.`);
  if (coverageLists.analyzed.some((file) => file.analysisLevel === "structural")) {
    warnings.push("Some languages received structural-only analysis; their dependencies are not inferred.");
  }

  return {
    nodes,
    edges,
    coverage: {
      treeComplete: true,
      discovered: blobs.length,
      counts,
      ...coverageLists,
    },
    warnings,
    analyzer: {
      id: "rassam-deterministic",
      version: 1,
      semanticLanguages: ["javascript", "typescript"],
    },
  };
}
