import { z } from 'zod';
import type { ChatSession, FlowEdge, FlowNode, Project, RepoDetails } from '@/types';
import {
  analysisCoverageSchema,
  graphEdgeSchema,
  graphNodeSchema,
  repositorySnapshotSchema,
} from '@/lib/contracts';
import { APP_VERSION } from '@/lib/version';

const isoDateSchema = z.string().datetime();

const exportProjectMetadataSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(300),
  source: z.enum(['github', 'empty', 'imported']),
  createdAt: isoDateSchema.nullable(),
  updatedAt: isoDateSchema.nullable(),
}).strict();

const exportedRepositorySchema = z.object({
  owner: z.string().min(1).max(39),
  repo: z.string().min(1).max(100),
  url: z.string().url(),
  defaultBranch: z.string().min(1).max(255).optional(),
  requestedRef: z.string().min(1).max(255).optional(),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  snapshot: repositorySnapshotSchema.nullable(),
}).strict().superRefine((repository, context) => {
  if (repository.snapshot) {
    if (
      repository.owner !== repository.snapshot.owner
      || repository.repo !== repository.snapshot.repo
      || (repository.commitSha && repository.commitSha !== repository.snapshot.commitSha)
      || (repository.treeSha && repository.treeSha !== repository.snapshot.treeSha)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Repository metadata does not match its immutable snapshot.',
      });
    }
  }
});

const graphPayloadSchema = z.object({
  revision: z.number().int().nonnegative(),
  layout: z.object({
    direction: z.enum(['TB', 'LR']),
    engine: z.literal('dagre'),
  }).strict(),
  nodes: z.array(graphNodeSchema).max(2_000),
  edges: z.array(graphEdgeSchema).max(5_000),
}).strict().superRefine((graph, context) => {
  const nodeIds = new Set<string>();
  graph.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      context.addIssue({ code: 'custom', path: ['nodes', index, 'id'], message: 'Duplicate node ID.' });
    }
    nodeIds.add(node.id);
  });

  const edgeIds = new Set<string>();
  graph.edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id)) {
      context.addIssue({ code: 'custom', path: ['edges', index, 'id'], message: 'Duplicate edge ID.' });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      context.addIssue({ code: 'custom', path: ['edges', index], message: 'Dangling edge endpoint.' });
    }
  });
});

const analyzerSchema = z.record(z.string(), z.unknown()).nullable();

export const rassamGraphExportSchema = z.object({
  format: z.literal('rassam.graph'),
  schemaVersion: z.literal(2),
  appVersion: z.string().min(1).max(50),
  generatedAt: isoDateSchema,
  project: exportProjectMetadataSchema,
  repository: exportedRepositorySchema.nullable(),
  graph: graphPayloadSchema,
  coverage: analysisCoverageSchema.nullable(),
  analyzer: analyzerSchema,
  warnings: z.array(z.string().max(2_000)).max(1_000),
}).strict();

const backupMessageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(100_000),
  timestamp: isoDateSchema,
  context: z.object({
    nodeLabel: z.string().max(120).optional(),
    files: z.array(z.string().max(4_096)).max(1_000).optional(),
  }).strict().optional(),
}).strict();

const backupChatSessionSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  messages: z.array(backupMessageSchema).max(10_000),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).strict();

const backupFileTreeEntrySchema = z.object({
  path: z.string().min(1).max(4_096),
  type: z.enum(['blob', 'tree']),
  sha: z.string().max(100).optional(),
  size: z.number().int().nonnegative().optional(),
  mode: z.string().max(20).optional(),
  commitSha: z.string().max(100).optional(),
}).strict();

export const rassamProjectBackupSchema = rassamGraphExportSchema.omit({ format: true }).extend({
  format: z.literal('rassam.project-backup'),
  privacy: z.object({
    includesChats: z.boolean(),
    includesCachedSource: z.literal(false),
    includesProviderCredentials: z.literal(false),
    notice: z.string().min(1).max(1_000),
  }).strict(),
  chats: z.array(backupChatSessionSchema).max(1_000),
  activeChatSessionId: z.string().min(1).max(200).nullable(),
  fileTree: z.array(backupFileTreeEntrySchema).max(100_000),
}).strict().superRefine((backup, context) => {
  if (!backup.privacy.includesChats && backup.chats.length > 0) {
    context.addIssue({ code: 'custom', path: ['chats'], message: 'Chat data was included without explicit consent.' });
  }
  if (backup.activeChatSessionId && !backup.chats.some((session) => session.id === backup.activeChatSessionId)) {
    context.addIssue({
      code: 'custom',
      path: ['activeChatSessionId'],
      message: 'The active chat session is not included in this backup.',
    });
  }
});

export type RassamGraphExport = z.infer<typeof rassamGraphExportSchema>;
export type RassamProjectBackup = z.infer<typeof rassamProjectBackupSchema>;
export type RassamExportDocument = RassamGraphExport | RassamProjectBackup;

export interface GraphExportContext {
  nodes: FlowNode[];
  edges: FlowEdge[];
  project?: Project | null;
  repoDetails?: RepoDetails | null;
  layoutDirection?: 'TB' | 'LR';
  generatedAt?: Date;
}

function cloneEvidence<T>(value: T): T {
  return structuredClone(value);
}

function persistentNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => {
    const data = node.data;
    return {
      id: node.id,
      type: node.type || 'enhanced',
      position: { x: node.position.x, y: node.position.y },
      data: {
        label: data.label,
        description: data.description,
        files: [...data.files],
        category: data.category,
        ...(data.complexity ? { complexity: data.complexity } : {}),
        ...(data.linesOfCode !== undefined ? { linesOfCode: data.linesOfCode } : {}),
        ...(data.dependencies ? { dependencies: [...data.dependencies] } : {}),
        ...(data.exports ? { exports: [...data.exports] } : {}),
        ...(data.evidence ? { evidence: cloneEvidence(data.evidence) } : {}),
        ...(data.confidence ? { confidence: data.confidence } : {}),
        ...(data.analysisLevel ? { analysisLevel: data.analysisLevel } : {}),
        ...(data.provenance ? { provenance: data.provenance } : {}),
      },
    };
  });
}

function persistentEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.map((edge) => {
    const data = edge.data;
    const label = data?.label || (typeof edge.label === 'string' ? edge.label : undefined);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type || 'custom',
      animated: Boolean(edge.animated),
      data: {
        ...(label ? { label } : {}),
        ...(data?.type ? { type: data.type } : {}),
        ...(data?.strength ? { strength: data.strength } : {}),
        ...(data?.direction ? { direction: data.direction } : {}),
        ...(data?.labelOffset ? { labelOffset: { ...data.labelOffset } } : {}),
        ...(data?.evidence ? { evidence: cloneEvidence(data.evidence) } : {}),
        ...(data?.confidence ? { confidence: data.confidence } : {}),
      },
    };
  });
}

function sanitizedRepository(
  repoDetails: RepoDetails | null | undefined,
  project: Project | null | undefined,
): RassamGraphExport['repository'] {
  const details = repoDetails || project?.repoDetails;
  const snapshot = project?.repositorySnapshot || null;
  if (!details && !snapshot) return null;

  const owner = snapshot?.owner || details?.owner;
  const repo = snapshot?.repo || details?.repo;
  if (!owner || !repo) return null;

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    defaultBranch: snapshot?.defaultBranch || details?.defaultBranch,
    requestedRef: snapshot?.requestedRef || details?.requestedRef,
    commitSha: snapshot?.commitSha || details?.commitSha,
    treeSha: snapshot?.treeSha || details?.treeSha,
    snapshot,
  };
}

function projectMetadata(
  project: Project | null | undefined,
  repository: RassamGraphExport['repository'],
): RassamGraphExport['project'] {
  return {
    id: project?.id || null,
    name: project?.name || (repository ? `${repository.owner}/${repository.repo}` : 'Untitled diagram'),
    source: project?.source || (repository ? 'github' : 'empty'),
    createdAt: project?.createdAt?.toISOString() || null,
    updatedAt: project?.updatedAt?.toISOString() || null,
  };
}

/**
 * Creates a portable graph document. Chats, cached source, source grants, and
 * provider credentials are deliberately absent from this format.
 */
export function createRassamGraphExport(context: GraphExportContext): RassamGraphExport {
  const repository = sanitizedRepository(context.repoDetails, context.project);
  const candidate = {
    format: 'rassam.graph' as const,
    schemaVersion: 2 as const,
    appVersion: APP_VERSION,
    generatedAt: (context.generatedAt || new Date()).toISOString(),
    project: projectMetadata(context.project, repository),
    repository,
    graph: {
      revision: context.project?.graphRevision || 0,
      layout: {
        direction: context.project?.layoutDirection || context.layoutDirection || 'TB',
        engine: 'dagre' as const,
      },
      nodes: persistentNodes(context.nodes),
      edges: persistentEdges(context.edges),
    },
    coverage: context.project?.analysisCoverage || null,
    analyzer: context.project?.analyzer || null,
    warnings: context.project?.analysisWarnings || [],
  };

  return rassamGraphExportSchema.parse(candidate);
}

const BACKUP_PRIVACY_NOTICE = 'This backup includes repository paths and graph evidence. Cached source content, source grants, and provider credentials are excluded. Chat text is included only when explicitly selected.';

/** Creates a local project backup. Cached source is never included. */
export function createRassamProjectBackup(
  project: Project,
  options: { includeChats: boolean; generatedAt?: Date },
): RassamProjectBackup {
  const graph = createRassamGraphExport({
    nodes: project.nodes,
    edges: project.edges,
    project,
    generatedAt: options.generatedAt,
  });
  const chats = options.includeChats
    ? project.chatSessions.map((session) => ({
        id: session.id,
        title: session.title,
        messages: session.messages.map((message) => ({
          ...message,
          timestamp: message.timestamp.toISOString(),
          context: message.context ? cloneEvidence(message.context) : undefined,
        })),
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      }))
    : [];

  return rassamProjectBackupSchema.parse({
    ...graph,
    format: 'rassam.project-backup',
    privacy: {
      includesChats: options.includeChats,
      includesCachedSource: false,
      includesProviderCredentials: false,
      notice: BACKUP_PRIVACY_NOTICE,
    },
    chats,
    activeChatSessionId: options.includeChats ? project.activeChatSessionId : null,
    fileTree: project.fileTree || [],
  });
}

export function serializeRassamExport(document: RassamExportDocument): string {
  const parsed = document.format === 'rassam.graph'
    ? rassamGraphExportSchema.parse(document)
    : rassamProjectBackupSchema.parse(document);
  return JSON.stringify(parsed, null, 2);
}

export function parseRassamExport(value: unknown): RassamExportDocument | null {
  if (!value || typeof value !== 'object' || !('format' in value)) return null;
  const format = (value as { format?: unknown }).format;
  if (format === 'rassam.graph') return rassamGraphExportSchema.parse(value);
  if (format === 'rassam.project-backup') return rassamProjectBackupSchema.parse(value);
  throw new Error(`Unsupported Rassam export format "${String(format)}".`);
}

export function restoreBackupChats(backup: RassamProjectBackup): {
  sessions: ChatSession[];
  activeSessionId: string | null;
} {
  const sessionIds = new Map<string, string>();
  const sessions = backup.chats.map((session) => {
    const id = crypto.randomUUID();
    sessionIds.set(session.id, id);
    return {
      id,
      title: session.title,
      messages: session.messages.map((message) => ({
        ...message,
        id: crypto.randomUUID(),
        timestamp: new Date(message.timestamp),
      })),
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
    } satisfies ChatSession;
  });

  return {
    sessions,
    activeSessionId: backup.activeChatSessionId
      ? sessionIds.get(backup.activeChatSessionId) || null
      : null,
  };
}

export function projectSourceFromExport(document: RassamExportDocument): 'imported' {
  void document;
  return 'imported';
}
