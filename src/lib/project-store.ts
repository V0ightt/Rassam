import Dexie, { type Table } from 'dexie';
import type {
  CanvasSyncSnapshot,
  ChatMessage,
  ChatSession,
  FlowEdge,
  FlowNode,
  Project,
  ProjectSource,
  RepoDetails,
  RepoFileEntry,
} from '@/types';

const DATABASE_NAME = 'rassam_workspace';
const LEGACY_MIGRATION_KEY = 'legacy-localstorage-projects-v1';

export const PROJECT_DOCUMENT_SCHEMA_VERSION = 2;

export type ProjectMigrationStatus = 'copying' | 'completed' | 'partial' | 'failed';

export interface StoredProjectRecord {
  id: string;
  schemaVersion: number;
  payload: string;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Opaque version of one persisted project document. Graph revision protects
 * graph commands while the checksum also detects concurrent chat/metadata
 * updates that intentionally do not increment the graph revision.
 */
export interface ProjectPersistenceToken {
  graphRevision: number;
  checksum: string;
}

export interface ProjectSaveReceipt {
  projectId: string;
  token: ProjectPersistenceToken;
}

export class ProjectWriteConflictError extends Error {
  readonly projectId: string;
  readonly expected: ProjectPersistenceToken | null;
  readonly actual: ProjectPersistenceToken | null;

  constructor(
    projectId: string,
    expected: ProjectPersistenceToken | null,
    actual: ProjectPersistenceToken | null,
  ) {
    super(actual
      ? `Project ${projectId} changed in another browser tab.`
      : `Project ${projectId} was removed in another browser tab.`);
    this.name = 'ProjectWriteConflictError';
    this.projectId = projectId;
    this.expected = expected;
    this.actual = actual;
  }
}

export interface ProjectMigrationRecord {
  key: string;
  source: 'legacy-localstorage';
  status: ProjectMigrationStatus;
  total: number;
  migrated: number;
  skipped: number;
  quarantined: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface QuarantinedProjectRecord {
  id: string;
  source: 'legacy-localstorage' | 'indexeddb';
  projectId?: string;
  legacyIndex?: number;
  reason: string;
  raw: string;
  quarantinedAt: string;
}

export interface RefreshBackupRecord {
  id: string;
  projectId: string;
  kind: 'pre-analysis-refresh';
  payload: string;
  checksum: string;
  sourceCommitSha?: string;
  targetCommitSha?: string;
  createdAt: string;
}

export interface RefreshBackupSummary {
  id: string;
  projectId: string;
  kind: RefreshBackupRecord['kind'];
  sourceCommitSha?: string;
  targetCommitSha?: string;
  createdAt: string;
}

export interface ProjectStorageInitialization {
  projects: Project[];
  persistenceTokens: Record<string, ProjectPersistenceToken>;
  migration: ProjectMigrationRecord;
  quarantined: QuarantinedProjectRecord[];
}

export type ProjectNormalizationResult =
  | { ok: true; project: Project; warnings: string[] }
  | { ok: false; reason: string };

class RassamProjectDatabase extends Dexie {
  projects!: Table<StoredProjectRecord, string>;
  migrations!: Table<ProjectMigrationRecord, string>;
  quarantinedProjects!: Table<QuarantinedProjectRecord, string>;
  projectBackups!: Table<RefreshBackupRecord, string>;

  constructor() {
    super(DATABASE_NAME);
    // Keep the deployed v1 schema declaration so Dexie can upgrade existing
    // workspaces in place before adding recoverable refresh backups in v2.
    this.version(1).stores({
      projects: '&id, createdAt, updatedAt, schemaVersion',
      migrations: '&key, status, updatedAt',
      quarantinedProjects: '&id, source, projectId, quarantinedAt',
    });
    this.version(2).stores({
      projects: '&id, createdAt, updatedAt, schemaVersion',
      migrations: '&key, status, updatedAt',
      quarantinedProjects: '&id, source, projectId, quarantinedAt',
      projectBackups: '&id, projectId, [projectId+createdAt], createdAt, kind',
    });
  }
}

let database: RassamProjectDatabase | null = null;

function getDatabase(): RassamProjectDatabase {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this browser context.');
  }
  database ??= new RassamProjectDatabase();
  return database;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  if (!isRecord(value)) return false;
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function toDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return fallback;
}

function normalizeRepoDetails(value: unknown): RepoDetails | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.owner !== 'string' || typeof value.repo !== 'string') {
    return null;
  }

  return {
    ...value,
    owner: value.owner,
    repo: value.repo,
    defaultBranch: typeof value.defaultBranch === 'string' ? value.defaultBranch : undefined,
    requestedRef: typeof value.requestedRef === 'string' ? value.requestedRef : undefined,
    commitSha: typeof value.commitSha === 'string' ? value.commitSha : undefined,
    treeSha: typeof value.treeSha === 'string' ? value.treeSha : undefined,
    sourceGrant: typeof value.sourceGrant === 'string' ? value.sourceGrant : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    stars: typeof value.stars === 'number' ? value.stars : undefined,
    language: typeof value.language === 'string' ? value.language : undefined,
    fileCount: typeof value.fileCount === 'number' ? value.fileCount : undefined,
  } as unknown as RepoDetails;
}

function normalizeNodes(value: unknown, warnings: string[]): FlowNode[] | null {
  if (!Array.isArray(value)) return null;
  const result: FlowNode[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const node = value[index];
    if (!isRecord(node) || typeof node.id !== 'string' || !isFinitePosition(node.position)) {
      warnings.push(`Dropped invalid node at index ${index}.`);
      continue;
    }
    result.push(node as unknown as FlowNode);
  }

  return result;
}

function normalizeEdges(value: unknown, nodeIds: Set<string>, warnings: string[]): FlowEdge[] | null {
  if (!Array.isArray(value)) return null;
  const result: FlowEdge[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const edge = value[index];
    if (
      !isRecord(edge) ||
      typeof edge.id !== 'string' ||
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string' ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target)
    ) {
      warnings.push(`Dropped invalid or dangling edge at index ${index}.`);
      continue;
    }
    result.push(edge as unknown as FlowEdge);
  }

  return result;
}

function normalizeMessage(value: unknown, fallbackTime: Date): ChatMessage | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.role !== 'user' && value.role !== 'assistant') ||
    typeof value.content !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    role: value.role,
    content: value.content,
    timestamp: toDate(value.timestamp, fallbackTime),
    context: isRecord(value.context)
      ? {
          nodeLabel: typeof value.context.nodeLabel === 'string' ? value.context.nodeLabel : undefined,
          files: Array.isArray(value.context.files)
            ? value.context.files.filter((item): item is string => typeof item === 'string')
            : undefined,
        }
      : undefined,
  };
}

function normalizeSessions(value: unknown, fallbackTime: Date, warnings: string[]): ChatSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: ChatSession[] = [];

  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') {
      warnings.push(`Dropped invalid chat session at index ${index}.`);
      return;
    }

    const createdAt = toDate(candidate.createdAt, fallbackTime);
    const updatedAt = toDate(candidate.updatedAt, createdAt);
    const rawMessages = Array.isArray(candidate.messages) ? candidate.messages : [];
    const messages = rawMessages
      .map((message) => normalizeMessage(message, updatedAt))
      .filter((message): message is ChatMessage => message !== null);
    if (messages.length !== rawMessages.length) {
      warnings.push(`Dropped invalid messages from chat session ${candidate.id}.`);
    }

    sessions.push({
      id: candidate.id,
      title: typeof candidate.title === 'string' ? candidate.title : 'Chat',
      messages,
      createdAt,
      updatedAt,
    });
  });

  return sessions;
}

function normalizeFileTree(value: unknown): RepoFileEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.path !== 'string' ||
      (candidate.type !== 'blob' && candidate.type !== 'tree')
    ) {
      return [];
    }
    return [{
      ...candidate,
      path: candidate.path,
      type: candidate.type,
      sha: typeof candidate.sha === 'string' ? candidate.sha : undefined,
      size: typeof candidate.size === 'number' ? candidate.size : undefined,
      mode: typeof candidate.mode === 'string' ? candidate.mode : undefined,
      commitSha: typeof candidate.commitSha === 'string' ? candidate.commitSha : undefined,
    } as RepoFileEntry];
  });
}

function normalizeSource(value: unknown, repoDetails: RepoDetails | null): ProjectSource {
  if (value === 'github' || value === 'empty' || value === 'imported') return value;
  return repoDetails ? 'github' : 'empty';
}

/**
 * Tolerantly validates one legacy/stored project. Corrupt children are dropped
 * with warnings so one malformed chat or edge does not destroy an otherwise
 * recoverable project. Missing project identity or graph arrays quarantine only
 * that project, never the entire legacy payload.
 */
export function normalizeProjectDocument(value: unknown): ProjectNormalizationResult {
  if (!isRecord(value)) return { ok: false, reason: 'Project is not an object.' };
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: 'Project is missing a stable string id.' };
  }

  const warnings: string[] = [];
  const nodes = normalizeNodes(value.nodes, warnings);
  if (!nodes) return { ok: false, reason: 'Project nodes must be an array.' };
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeEdges(value.edges, nodeIds, warnings);
  if (!edges) return { ok: false, reason: 'Project edges must be an array.' };

  const fallbackTime = new Date(0);
  const createdAt = toDate(value.createdAt, fallbackTime);
  const updatedAt = toDate(value.updatedAt, createdAt);
  const repoDetails = normalizeRepoDetails(value.repoDetails);
  const chatSessions = normalizeSessions(value.chatSessions, updatedAt, warnings);
  const requestedActiveSession = typeof value.activeChatSessionId === 'string'
    ? value.activeChatSessionId
    : null;
  const activeChatSessionId = requestedActiveSession && chatSessions.some((session) => session.id === requestedActiveSession)
    ? requestedActiveSession
    : chatSessions[0]?.id ?? null;

  return {
    ok: true,
    warnings,
    project: {
      ...value,
      schemaVersion: 2,
      graphRevision: typeof value.graphRevision === 'number' && Number.isSafeInteger(value.graphRevision) && value.graphRevision >= 0
        ? value.graphRevision
        : 0,
      id: value.id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name : 'Recovered Project',
      repoUrl: typeof value.repoUrl === 'string' ? value.repoUrl : '',
      source: normalizeSource(value.source, repoDetails),
      repoDetails,
      nodes,
      edges,
      layoutDirection: value.layoutDirection === 'LR' ? 'LR' : 'TB',
      aiContextSnapshot: isRecord(value.aiContextSnapshot)
        ? value.aiContextSnapshot as unknown as CanvasSyncSnapshot
        : null,
      lastSyncedAt: typeof value.lastSyncedAt === 'string' ? value.lastSyncedAt : null,
      chatSessions,
      activeChatSessionId,
      fileTree: normalizeFileTree(value.fileTree),
      createdAt,
      updatedAt,
    } as Project,
  };
}

export function parseLegacyProjectPayload(raw: string | null): {
  projects: Project[];
  failures: Array<{ index: number; reason: string; raw: string }>;
  rootError?: string;
} {
  if (!raw) return { projects: [], failures: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { projects: [], failures: [], rootError: 'Legacy project data is not valid JSON.' };
  }

  if (!Array.isArray(parsed)) {
    return { projects: [], failures: [], rootError: 'Legacy project data must be an array.' };
  }

  const projects: Project[] = [];
  const failures: Array<{ index: number; reason: string; raw: string }> = [];
  const seenIds = new Set<string>();

  parsed.forEach((candidate, index) => {
    const normalized = normalizeProjectDocument(candidate);
    if (!normalized.ok) {
      failures.push({ index, reason: normalized.reason, raw: safeStringify(candidate) });
      return;
    }
    if (seenIds.has(normalized.project.id)) {
      failures.push({
        index,
        reason: `Duplicate project id ${normalized.project.id}.`,
        raw: safeStringify(candidate),
      });
      return;
    }
    seenIds.add(normalized.project.id);
    projects.push(normalized.project);
  });

  return { projects, failures };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable project data]';
  }
}

export function checksumProjectPayload(payload: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function serializeProject(project: Project): StoredProjectRecord {
  const normalized = normalizeProjectDocument(project);
  if (!normalized.ok) throw new Error(normalized.reason);
  const payload = JSON.stringify(normalized.project);
  return {
    id: normalized.project.id,
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    payload,
    checksum: checksumProjectPayload(payload),
    createdAt: normalized.project.createdAt.toISOString(),
    updatedAt: normalized.project.updatedAt.toISOString(),
  };
}

function tokenFromStoredRecord(record: StoredProjectRecord): ProjectPersistenceToken {
  const normalized = deserializeProject(record);
  if (!normalized.ok) throw new Error(normalized.reason);
  return {
    graphRevision: normalized.project.graphRevision,
    checksum: record.checksum,
  };
}

export function createProjectPersistenceToken(project: Project): ProjectPersistenceToken {
  const record = serializeProject(project);
  return {
    graphRevision: project.graphRevision,
    checksum: record.checksum,
  };
}

export function projectPersistenceTokensMatch(
  actual: ProjectPersistenceToken | null,
  expected: ProjectPersistenceToken | null,
): boolean {
  if (actual === null || expected === null) return actual === expected;
  return actual.graphRevision === expected.graphRevision && actual.checksum === expected.checksum;
}

function assertProjectWritePrecondition(
  projectId: string,
  actual: ProjectPersistenceToken | null,
  expected: ProjectPersistenceToken | null,
  desired: ProjectPersistenceToken,
): void {
  if (evaluateProjectWritePrecondition(actual, expected, desired) === 'conflict') {
    throw new ProjectWriteConflictError(projectId, expected, actual);
  }
}

export function evaluateProjectWritePrecondition(
  actual: ProjectPersistenceToken | null,
  expected: ProjectPersistenceToken | null,
  desired: ProjectPersistenceToken,
): 'write' | 'idempotent' | 'conflict' {
  // A retry that already committed the exact payload is safe and idempotent.
  if (expected !== null && actual?.checksum === desired.checksum) return 'idempotent';
  return projectPersistenceTokensMatch(actual, expected) ? 'write' : 'conflict';
}

function deserializeProject(record: StoredProjectRecord): ProjectNormalizationResult {
  if (checksumProjectPayload(record.payload) !== record.checksum) {
    return { ok: false, reason: 'Stored project checksum does not match its payload.' };
  }
  try {
    return normalizeProjectDocument(JSON.parse(record.payload) as unknown);
  } catch {
    return { ok: false, reason: 'Stored project payload is not valid JSON.' };
  }
}

function quarantineId(source: QuarantinedProjectRecord['source'], key: string, raw: string): string {
  return `${source}:${key}:${checksumProjectPayload(raw)}`;
}

async function migrateLegacyPayload(raw: string | null): Promise<ProjectMigrationRecord> {
  const db = getDatabase();
  const startedAt = new Date().toISOString();
  const parsed = parseLegacyProjectPayload(raw);
  const existingIds = new Set((await db.projects.toCollection().primaryKeys()).map(String));
  const records = parsed.projects
    .filter((project) => !existingIds.has(project.id))
    .map(serializeProject);
  const skipped = parsed.projects.length - records.length;
  const quarantined: QuarantinedProjectRecord[] = parsed.failures.map((failure) => ({
    id: quarantineId('legacy-localstorage', String(failure.index), failure.raw),
    source: 'legacy-localstorage',
    legacyIndex: failure.index,
    reason: failure.reason,
    raw: failure.raw,
    quarantinedAt: startedAt,
  }));

  if (parsed.rootError && raw) {
    quarantined.push({
      id: quarantineId('legacy-localstorage', 'root', raw),
      source: 'legacy-localstorage',
      reason: parsed.rootError,
      raw,
      quarantinedAt: startedAt,
    });
  }

  const copying: ProjectMigrationRecord = {
    key: LEGACY_MIGRATION_KEY,
    source: 'legacy-localstorage',
    status: 'copying',
    total: parsed.projects.length + parsed.failures.length + (parsed.rootError ? 1 : 0),
    migrated: records.length,
    skipped,
    quarantined: quarantined.length,
    startedAt,
    updatedAt: startedAt,
  };

  await db.transaction(
    'rw',
    db.projects,
    db.migrations,
    db.quarantinedProjects,
    async () => {
      await db.migrations.put(copying);
      if (records.length > 0) await db.projects.bulkPut(records);
      if (quarantined.length > 0) await db.quarantinedProjects.bulkPut(quarantined);
    },
  );

  const stored = await db.projects.bulkGet(records.map((record) => record.id));
  const verified = stored.every((record, index) => (
    record !== undefined &&
    record.checksum === records[index].checksum &&
    checksumProjectPayload(record.payload) === record.checksum
  ));
  const completedAt = new Date().toISOString();
  const completed: ProjectMigrationRecord = {
    ...copying,
    status: verified
      ? (quarantined.length > 0 ? 'partial' : 'completed')
      : 'failed',
    updatedAt: completedAt,
    completedAt: verified ? completedAt : undefined,
    error: verified ? undefined : 'One or more copied projects failed checksum verification.',
  };
  await db.migrations.put(completed);
  return completed;
}

export async function loadProjectsFromStore(): Promise<Project[]> {
  const db = getDatabase();
  const records = await db.projects.orderBy('createdAt').toArray();
  const projects: Project[] = [];
  const corrupt: Array<{ record: StoredProjectRecord; reason: string }> = [];

  records.forEach((record) => {
    const normalized = deserializeProject(record);
    if (normalized.ok) projects.push(normalized.project);
    else corrupt.push({ record, reason: normalized.reason });
  });

  if (corrupt.length > 0) {
    const now = new Date().toISOString();
    await db.transaction('rw', db.projects, db.quarantinedProjects, async () => {
      for (const item of corrupt) {
        await db.quarantinedProjects.put({
          id: quarantineId('indexeddb', item.record.id, item.record.payload),
          source: 'indexeddb',
          projectId: item.record.id,
          reason: item.reason,
          raw: item.record.payload,
          quarantinedAt: now,
        });
        await db.projects.delete(item.record.id);
      }
    });
  }

  return projects;
}

export async function initializeProjectStorage(
  legacyPayload: string | null,
): Promise<ProjectStorageInitialization> {
  const db = getDatabase();
  let migration = await db.migrations.get(LEGACY_MIGRATION_KEY);
  if (!migration || migration.status === 'copying' || migration.status === 'failed') {
    migration = await migrateLegacyPayload(legacyPayload);
  }

  const projects = await loadProjectsFromStore();
  const persistenceTokens = Object.fromEntries(
    projects.map((project) => [project.id, createProjectPersistenceToken(project)]),
  );
  const quarantined = await db.quarantinedProjects.orderBy('quarantinedAt').toArray();
  return { projects, persistenceTokens, migration, quarantined };
}

/**
 * Save one project with an IndexedDB compare-and-swap. Passing `null` means
 * the caller expects to create a new record. Replacements must provide the
 * exact token returned by the previous load/save.
 */
export async function saveProjectToStore(
  project: Project,
  expected: ProjectPersistenceToken | null,
): Promise<ProjectSaveReceipt> {
  const db = getDatabase();
  const record = serializeProject(project);
  const desired = tokenFromStoredRecord(record);
  await db.transaction('rw', db.projects, async () => {
    const current = await db.projects.get(project.id);
    const actual = current ? tokenFromStoredRecord(current) : null;
    assertProjectWritePrecondition(project.id, actual, expected, desired);
    await db.projects.put(record);
  });
  return { projectId: project.id, token: desired };
}

export async function loadProjectFromStore(
  projectId: string,
): Promise<{ project: Project; token: ProjectPersistenceToken } | null> {
  const record = await getDatabase().projects.get(projectId);
  if (!record) return null;
  const normalized = deserializeProject(record);
  if (!normalized.ok) throw new Error(normalized.reason);
  return { project: normalized.project, token: tokenFromStoredRecord(record) };
}

const MAX_REFRESH_BACKUPS_PER_PROJECT = 5;

function refreshBackupSummary(record: RefreshBackupRecord): RefreshBackupSummary {
  const { payload, checksum, ...summary } = record;
  void payload;
  void checksum;
  return summary;
}

/**
 * Atomically stores the pre-refresh document and its replacement. If either
 * write or checksum verification fails, Dexie aborts the entire transaction.
 */
export async function saveProjectWithRefreshBackup(
  previousProject: Project,
  refreshedProject: Project,
  expected: ProjectPersistenceToken,
): Promise<RefreshBackupSummary & { persistenceToken: ProjectPersistenceToken }> {
  if (previousProject.id !== refreshedProject.id) {
    throw new Error('A refresh replacement must retain the project identity.');
  }
  const db = getDatabase();
  const previousRecord = serializeProject(previousProject);
  const refreshedRecord = serializeProject(refreshedProject);
  const desired = tokenFromStoredRecord(refreshedRecord);
  const createdAt = new Date().toISOString();
  const backup: RefreshBackupRecord = {
    id: crypto.randomUUID(),
    projectId: previousProject.id,
    kind: 'pre-analysis-refresh',
    payload: previousRecord.payload,
    checksum: previousRecord.checksum,
    sourceCommitSha: previousProject.repoDetails?.commitSha,
    targetCommitSha: refreshedProject.repoDetails?.commitSha,
    createdAt,
  };

  await db.transaction('rw', db.projects, db.projectBackups, async () => {
    const current = await db.projects.get(previousProject.id);
    const actual = current ? tokenFromStoredRecord(current) : null;
    assertProjectWritePrecondition(previousProject.id, actual, expected, desired);
    await db.projectBackups.put(backup);
    await db.projects.put(refreshedRecord);

    const [storedBackup, storedProject] = await Promise.all([
      db.projectBackups.get(backup.id),
      db.projects.get(refreshedProject.id),
    ]);
    if (
      !storedBackup
      || storedBackup.checksum !== checksumProjectPayload(storedBackup.payload)
      || !storedProject
      || storedProject.checksum !== checksumProjectPayload(storedProject.payload)
    ) {
      throw new Error('Refresh backup verification failed.');
    }

    const backups = (await db.projectBackups
      .where('projectId')
      .equals(previousProject.id)
      .sortBy('createdAt'))
      .reverse();
    const staleIds = backups
      .slice(MAX_REFRESH_BACKUPS_PER_PROJECT)
      .map((record) => record.id);
    if (staleIds.length > 0) await db.projectBackups.bulkDelete(staleIds);
  });

  return { ...refreshBackupSummary(backup), persistenceToken: desired };
}

export async function listRefreshBackups(projectId: string): Promise<RefreshBackupSummary[]> {
  const records = (await getDatabase().projectBackups
    .where('projectId')
    .equals(projectId)
    .sortBy('createdAt'))
    .reverse();
  return records.map(refreshBackupSummary);
}

export async function loadRefreshBackup(backupId: string): Promise<Project> {
  const record = await getDatabase().projectBackups.get(backupId);
  if (!record) throw new Error('The refresh backup no longer exists.');
  if (checksumProjectPayload(record.payload) !== record.checksum) {
    throw new Error('The refresh backup checksum does not match its payload.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.payload) as unknown;
  } catch {
    throw new Error('The refresh backup payload is not valid JSON.');
  }
  const normalized = normalizeProjectDocument(parsed);
  if (!normalized.ok) throw new Error(normalized.reason);
  if (normalized.project.id !== record.projectId) {
    throw new Error('The refresh backup belongs to a different project.');
  }
  return normalized.project;
}

export async function deleteProjectFromStore(
  projectId: string,
  expected: ProjectPersistenceToken,
): Promise<void> {
  const db = getDatabase();
  await db.transaction('rw', db.projects, db.projectBackups, async () => {
    const current = await db.projects.get(projectId);
    const actual = current ? tokenFromStoredRecord(current) : null;
    if (!projectPersistenceTokensMatch(actual, expected)) {
      throw new ProjectWriteConflictError(projectId, expected, actual);
    }
    await db.projects.delete(projectId);
    await db.projectBackups.where('projectId').equals(projectId).delete();
  });
}

export async function getProjectMigrationRecord(): Promise<ProjectMigrationRecord | null> {
  return (await getDatabase().migrations.get(LEGACY_MIGRATION_KEY)) ?? null;
}

export async function getQuarantinedProjects(): Promise<QuarantinedProjectRecord[]> {
  return getDatabase().quarantinedProjects.orderBy('quarantinedAt').toArray();
}

export function closeProjectStorage(): void {
  database?.close();
  database = null;
}
