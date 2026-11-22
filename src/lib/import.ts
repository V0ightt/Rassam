import type {
  ChatSession,
  FlowEdge,
  FlowNode,
  NodeData,
  ProjectSource,
  RepoDetails,
  RepoFileEntry,
} from '@/types';
import type { AnalysisCoverage, RepositorySnapshot } from '@/lib/contracts';
import { graphEdgeSchema, graphNodeSchema, nodeCategorySchema } from '@/lib/contracts';
import {
  parseRassamExport,
  projectSourceFromExport,
  restoreBackupChats,
  type RassamExportDocument,
} from '@/lib/project-export';

export interface ImportedProjectData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  repoDetails: RepoDetails | null;
  name: string;
  source: ProjectSource;
  layoutDirection: 'TB' | 'LR';
  graphRevision: number;
  repositorySnapshot?: RepositorySnapshot;
  analysisCoverage?: AnalysisCoverage;
  analysisWarnings?: string[];
  analyzer?: Record<string, unknown>;
  chatSessions?: ChatSession[];
  activeChatSessionId?: string | null;
  fileTree?: RepoFileEntry[];
  createdAt?: Date;
  updatedAt?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const freshId = () => crypto.randomUUID();

function importGraph(
  nodesInput: unknown[],
  edgesInput: unknown[],
  options: { tolerateInvalidLegacyEdges?: boolean } = {},
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (nodesInput.length > 2_000) throw new Error('The imported graph exceeds the 2,000-node limit.');
  if (edgesInput.length > 5_000) throw new Error('The imported graph exceeds the 5,000-edge limit.');

  const idMap = new Map<string, string>();
  const nodes = nodesInput.map((candidate, index): FlowNode => {
    if (!isRecord(candidate)) throw new Error(`Node at index ${index} is not a valid object.`);
    const oldId = String(candidate.id ?? `node-${index}`);
    if (idMap.has(oldId)) throw new Error(`Node at index ${index} has a duplicate ID.`);
    const id = freshId();
    idMap.set(oldId, id);

    const rawPosition = candidate.position;
    const position = isRecord(rawPosition)
      && typeof rawPosition.x === 'number'
      && Number.isFinite(rawPosition.x)
      && typeof rawPosition.y === 'number'
      && Number.isFinite(rawPosition.y)
      ? { x: rawPosition.x, y: rawPosition.y }
      : { x: index * 300, y: index * 150 };

    const rawData = isRecord(candidate.data) ? candidate.data : {};
    const category = nodeCategorySchema.safeParse(rawData.category);
    const data: NodeData = {
      label: typeof rawData.label === 'string' && rawData.label.trim()
        ? rawData.label.slice(0, 120)
        : `Node ${index + 1}`,
      description: typeof rawData.description === 'string' ? rawData.description.slice(0, 4_000) : '',
      files: Array.isArray(rawData.files)
        ? rawData.files.filter((entry): entry is string => typeof entry === 'string').slice(0, 10_000)
        : [],
      category: category.success ? category.data : 'default',
      complexity: rawData.complexity === 'low' || rawData.complexity === 'medium' || rawData.complexity === 'high'
        ? rawData.complexity
        : 'medium',
      dependencies: Array.isArray(rawData.dependencies)
        ? rawData.dependencies.filter((entry): entry is string => typeof entry === 'string').slice(0, 500)
        : [],
      exports: Array.isArray(rawData.exports)
        ? rawData.exports.filter((entry): entry is string => typeof entry === 'string').slice(0, 500)
        : [],
    };

    for (const field of ['evidence', 'confidence', 'analysisLevel', 'provenance'] as const) {
      if (rawData[field] !== undefined) Object.assign(data, { [field]: structuredClone(rawData[field]) });
    }

    const node = {
      id,
      type: typeof candidate.type === 'string' && candidate.type ? candidate.type : 'enhanced',
      position,
      data,
    };
    const validated = graphNodeSchema.safeParse(node);
    if (!validated.success) throw new Error(`Node at index ${index} failed validation.`);
    return validated.data as FlowNode;
  });

  const edgeIds = new Set<string>();
  const edges: FlowEdge[] = [];
  edgesInput.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      if (options.tolerateInvalidLegacyEdges) return;
      throw new Error(`Edge at index ${index} is not a valid object.`);
    }
    const oldId = String(candidate.id ?? `edge-${index}`);
    if (edgeIds.has(oldId)) throw new Error(`Edge at index ${index} has a duplicate ID.`);
    edgeIds.add(oldId);
    const source = idMap.get(String(candidate.source));
    const target = idMap.get(String(candidate.target));
    if (!source || !target) {
      if (options.tolerateInvalidLegacyEdges) return;
      throw new Error(`Edge at index ${index} references a missing node.`);
    }

    const edge = {
      id: freshId(),
      source,
      target,
      type: typeof candidate.type === 'string' && candidate.type ? candidate.type : 'custom',
      animated: typeof candidate.animated === 'boolean' ? candidate.animated : false,
      data: isRecord(candidate.data) ? structuredClone(candidate.data) : {},
    };
    const validated = graphEdgeSchema.safeParse(edge);
    if (!validated.success) throw new Error(`Edge at index ${index} failed validation.`);
    edges.push(validated.data as FlowEdge);
  });

  return { nodes, edges };
}

function repoDetailsFromV2(document: RassamExportDocument): RepoDetails | null {
  if (!document.repository) return null;
  return {
    owner: document.repository.owner,
    repo: document.repository.repo,
    defaultBranch: document.repository.defaultBranch,
    requestedRef: document.repository.requestedRef,
    commitSha: document.repository.commitSha,
    treeSha: document.repository.treeSha,
    fileCount: document.coverage?.discovered
      || document.graph.nodes.reduce((sum, node) => sum + node.data.files.length, 0),
  };
}

function importV2(document: RassamExportDocument): ImportedProjectData {
  const graph = importGraph(document.graph.nodes, document.graph.edges);
  const backupChats = document.format === 'rassam.project-backup'
    ? restoreBackupChats(document)
    : null;
  return {
    ...graph,
    repoDetails: repoDetailsFromV2(document),
    name: document.project.name,
    source: projectSourceFromExport(document),
    layoutDirection: document.graph.layout.direction,
    graphRevision: document.graph.revision,
    repositorySnapshot: document.repository?.snapshot || undefined,
    analysisCoverage: document.coverage || undefined,
    analysisWarnings: document.warnings,
    analyzer: document.analyzer || undefined,
    chatSessions: backupChats?.sessions,
    activeChatSessionId: backupChats?.activeSessionId,
    fileTree: document.format === 'rassam.project-backup' ? document.fileTree : undefined,
    createdAt: document.project.createdAt ? new Date(document.project.createdAt) : undefined,
    updatedAt: document.project.updatedAt ? new Date(document.project.updatedAt) : undefined,
  };
}

function importLegacy(parsed: Record<string, unknown>, fileName?: string): ImportedProjectData {
  const metadata = isRecord(parsed.metadata) ? parsed.metadata : null;
  const version = metadata?.version;
  if (version && version !== '1.0') {
    throw new Error(`Unsupported export version "${String(version)}". Only legacy version 1.0 is supported.`);
  }
  if (!Array.isArray(parsed.nodes)) throw new Error('Missing or invalid "nodes" array in the JSON file.');
  if (!Array.isArray(parsed.edges)) throw new Error('Missing or invalid "edges" array in the JSON file.');

  const graph = importGraph(parsed.nodes, parsed.edges, { tolerateInvalidLegacyEdges: true });
  const repository = metadata && isRecord(metadata.repo) ? metadata.repo : null;
  const repoDetails = repository?.owner && repository.repo
    ? {
        owner: String(repository.owner),
        repo: String(repository.repo),
        fileCount: graph.nodes.reduce((sum, node) => sum + node.data.files.length, 0) || undefined,
      }
    : null;

  return {
    ...graph,
    repoDetails,
    name: repoDetails
      ? `${repoDetails.owner}/${repoDetails.repo}`
      : fileName?.replace(/\.json$/i, '') || 'Imported Project',
    source: 'imported',
    layoutDirection: 'TB',
    graphRevision: 0,
  };
}

/**
 * Parses `rassam.graph` schema v2, privacy-bounded project backups, and the
 * legacy `{ metadata.version: "1.0", nodes, edges }` format.
 */
export function parseAndValidateImportJson(raw: string, fileName?: string): ImportedProjectData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('The file does not contain valid JSON.');
  }
  if (!isRecord(parsed)) throw new Error('Expected a JSON object with graph data.');

  try {
    const v2 = parseRassamExport(parsed);
    return v2 ? importV2(v2) : importLegacy(parsed, fileName);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unsupported Rassam export format')) throw error;
    if (error instanceof Error && error.name !== 'ZodError') throw error;
    throw new Error('The Rassam export is invalid or contains unsupported graph data.');
  }
}
