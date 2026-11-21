import type { RepositoryAnalysisResult } from '@/lib/contracts';
import type { AnalysisProgressUpdate } from '@/lib/analysis-stream';
import type {
  CanvasSyncSnapshot,
  EdgeData,
  FlowEdge,
  FlowNode,
  Project,
} from '@/types';

export interface RefreshAnalysisSummary {
  sourceCommitSha: string;
  targetCommitSha: string;
  revisionChanged: boolean;
  nodes: { before: number; after: number; delta: number };
  edges: { before: number; after: number; delta: number };
  files: {
    before: number;
    after: number;
    analyzed: number;
    excluded: number;
    failed: number;
    unclassified: number;
  };
  warningCount: number;
  enrichmentStatus: RepositoryAnalysisResult['enrichment']['status'];
}

export interface RefreshAnalysisCandidate {
  id: string;
  projectId: string;
  baseGraphRevision: number;
  baseCommitSha: string;
  requestedRef: string;
  startedAt: string;
  completedAt: string;
  result: RepositoryAnalysisResult;
  summary: RefreshAnalysisSummary;
}

export type RefreshAnalysisState =
  | { status: 'idle'; projectId?: undefined; progress?: undefined; candidate?: undefined; error?: undefined }
  | { status: 'running'; projectId: string; progress: AnalysisProgressUpdate; candidate?: undefined; error?: undefined }
  | { status: 'ready'; projectId: string; progress: AnalysisProgressUpdate; candidate: RefreshAnalysisCandidate; error?: undefined }
  | { status: 'applying'; projectId: string; progress: AnalysisProgressUpdate; candidate: RefreshAnalysisCandidate; error?: undefined }
  | { status: 'error'; projectId: string; progress?: AnalysisProgressUpdate; candidate?: RefreshAnalysisCandidate; error: string };

function sameRepository(
  project: Pick<Project, 'repoDetails'>,
  result: RepositoryAnalysisResult,
): boolean {
  const current = project.repoDetails;
  return Boolean(
    current
      && current.owner.toLowerCase() === result.repoDetails.owner.toLowerCase()
      && current.repo.toLowerCase() === result.repoDetails.repo.toLowerCase(),
  );
}

export function createRefreshAnalysisCandidate(
  project: Project,
  result: RepositoryAnalysisResult,
  options: { id?: string; startedAt?: string; completedAt?: string } = {},
): RefreshAnalysisCandidate {
  if (project.source !== 'github' || !project.repoDetails?.commitSha) {
    throw new Error('Only a pinned GitHub project can be refreshed.');
  }
  if (!sameRepository(project, result)) {
    throw new Error('Refresh analysis returned a different repository.');
  }
  const coverage = result.coverage.counts;
  const beforeFiles = project.analysisCoverage?.discovered ?? project.fileTree?.length ?? 0;
  const excluded = coverage.ignored + coverage.unsupported + coverage.oversized;
  const sourceCommitSha = project.repoDetails.commitSha;
  const targetCommitSha = result.snapshot.commitSha;

  return {
    id: options.id ?? crypto.randomUUID(),
    projectId: project.id,
    baseGraphRevision: project.graphRevision,
    baseCommitSha: sourceCommitSha,
    requestedRef: result.snapshot.requestedRef,
    startedAt: options.startedAt ?? new Date().toISOString(),
    completedAt: options.completedAt ?? new Date().toISOString(),
    result,
    summary: {
      sourceCommitSha,
      targetCommitSha,
      revisionChanged: sourceCommitSha.toLowerCase() !== targetCommitSha.toLowerCase(),
      nodes: {
        before: project.nodes.length,
        after: result.nodes.length,
        delta: result.nodes.length - project.nodes.length,
      },
      edges: {
        before: project.edges.length,
        after: result.edges.length,
        delta: result.edges.length - project.edges.length,
      },
      files: {
        before: beforeFiles,
        after: result.coverage.discovered,
        analyzed: coverage.analyzed,
        excluded,
        failed: coverage.failed,
        unclassified: coverage.unclassified,
      },
      warningCount: result.warnings.length,
      enrichmentStatus: result.enrichment.status,
    },
  };
}

export function assertRefreshCandidateApplies(
  project: Project,
  candidate: RefreshAnalysisCandidate,
): void {
  if (project.id !== candidate.projectId) {
    throw new Error('The refresh candidate belongs to a different project.');
  }
  if (project.graphRevision !== candidate.baseGraphRevision) {
    throw new Error('The project graph changed after refresh started. Regenerate the candidate before replacing it.');
  }
  if (project.repoDetails?.commitSha?.toLowerCase() !== candidate.baseCommitSha.toLowerCase()) {
    throw new Error('The project source revision changed after refresh started. Regenerate the candidate.');
  }
}

function cloneNodes(result: RepositoryAnalysisResult): FlowNode[] {
  return result.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: {
      ...node.data,
      files: [...node.data.files],
      evidence: node.data.evidence?.map((evidence) => ({ ...evidence })),
    },
  })) as FlowNode[];
}

function cloneEdges(result: RepositoryAnalysisResult): FlowEdge[] {
  return result.edges.map((edge) => ({
    ...edge,
    data: edge.data
      ? {
          ...edge.data,
          evidence: edge.data.evidence?.map((evidence) => ({ ...evidence })),
        }
      : undefined,
  })) as FlowEdge[];
}

function buildSnapshot(
  project: Project,
  nodes: FlowNode[],
  edges: FlowEdge[],
  graphRevision: number,
  syncedAt: string,
): CanvasSyncSnapshot {
  return {
    syncedAt,
    graphRevision,
    project: {
      id: project.id,
      name: project.name,
      source: project.source,
      repo: project.repoDetails
        ? `${project.repoDetails.owner}/${project.repoDetails.repo}`
        : undefined,
    },
    layoutDirection: 'TB',
    selectedNodeId: null,
    selectedNodeLabel: null,
    nodes: nodes.map((node) => ({
      id: node.id,
      label: node.data.label,
      description: node.data.description,
      category: node.data.category,
      files: [...node.data.files],
      complexity: node.data.complexity,
      dependencies: node.data.dependencies ? [...node.data.dependencies] : undefined,
      exports: node.data.exports ? [...node.data.exports] : undefined,
      evidence: node.data.evidence?.map((evidence) => ({ ...evidence })),
      confidence: node.data.confidence,
      analysisLevel: node.data.analysisLevel,
      position: { ...node.position },
    })),
    edges: edges.map((edge) => {
      const data = edge.data as Partial<EdgeData> | undefined;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: data?.label ?? (typeof edge.label === 'string' ? edge.label : undefined),
        type: data?.type ?? edge.type,
        strength: data?.strength,
        direction: data?.direction,
        evidence: data?.evidence?.map((evidence) => ({ ...evidence })),
        confidence: data?.confidence,
      };
    }),
  };
}

/** Replaces the analyzed graph wholesale. Manual edits are never merged. */
export function buildRefreshedProject(
  project: Project,
  candidate: RefreshAnalysisCandidate,
  now = new Date(),
): Project {
  assertRefreshCandidateApplies(project, candidate);
  const nodes = cloneNodes(candidate.result);
  const edges = cloneEdges(candidate.result);
  const graphRevision = project.graphRevision + 1;
  const syncedAt = now.toISOString();
  const base: Project = {
    ...project,
    graphRevision,
    repoDetails: { ...candidate.result.repoDetails },
    nodes,
    edges,
    layoutDirection: 'TB',
    repositorySnapshot: { ...candidate.result.snapshot },
    analysisCoverage: candidate.result.coverage,
    analysisWarnings: [...candidate.result.warnings],
    analyzer: { ...candidate.result.analyzer },
    fileTree: candidate.result.fileTree.map((entry) => ({ ...entry })),
    aiContextSnapshot: null,
    lastSyncedAt: syncedAt,
    updatedAt: now,
  };
  return {
    ...base,
    aiContextSnapshot: buildSnapshot(base, nodes, edges, graphRevision, syncedAt),
  };
}

export function buildRestoredRefreshProject(
  currentProject: Project,
  backupProject: Project,
  now = new Date(),
): Project {
  if (currentProject.id !== backupProject.id) {
    throw new Error('The selected backup belongs to a different project.');
  }
  const nodes = backupProject.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data, files: [...node.data.files] },
  }));
  const edges = backupProject.edges.map((edge) => ({
    ...edge,
    data: edge.data ? { ...edge.data } : edge.data,
  }));
  const graphRevision = currentProject.graphRevision + 1;
  const syncedAt = now.toISOString();
  const restored: Project = {
    ...backupProject,
    graphRevision,
    nodes,
    edges,
    repoDetails: backupProject.repoDetails
      ? {
          ...backupProject.repoDetails,
          // Grants are short-lived. Reads for a restored revision request a new
          // grant against the immutable commit instead of a branch that moved.
          sourceGrant: undefined,
        }
      : null,
    aiContextSnapshot: null,
    lastSyncedAt: syncedAt,
    updatedAt: now,
  };
  return {
    ...restored,
    aiContextSnapshot: buildSnapshot(restored, nodes, edges, graphRevision, syncedAt),
  };
}
