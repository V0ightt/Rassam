// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Edge, Node } from 'reactflow';
import type { RepositoryAnalysisResult } from '@/lib/contracts';
import type { Project } from '@/types';

const storeMocks = vi.hoisted(() => ({
  projects: [] as Project[],
  initialize: vi.fn(),
  save: vi.fn(),
  saveWithBackup: vi.fn(),
  listBackups: vi.fn(),
  loadBackup: vi.fn(),
  loadProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('@/lib/project-store', () => ({
  initializeProjectStorage: storeMocks.initialize,
  createProjectPersistenceToken: (project: Project) => ({
    graphRevision: project.graphRevision,
    checksum: '11111111',
  }),
  saveProjectToStore: storeMocks.save,
  saveProjectWithRefreshBackup: storeMocks.saveWithBackup,
  listRefreshBackups: storeMocks.listBackups,
  loadRefreshBackup: storeMocks.loadBackup,
  loadProjectFromStore: storeMocks.loadProject,
  deleteProjectFromStore: storeMocks.deleteProject,
  ProjectWriteConflictError: class ProjectWriteConflictError extends Error {},
  parseLegacyProjectPayload: vi.fn(() => ({ projects: [], failures: [] })),
}));

vi.mock('@/lib/project-revision-channel', () => ({
  createProjectRevisionChannel: () => ({ sourceId: 'test', available: false, publish: vi.fn(), close: vi.fn() }),
}));

vi.mock('@/lib/file-store', () => ({ clearProjectFiles: vi.fn() }));

import { useProjects } from './useProjects';

const OLD_SHA = '1'.repeat(40);
const NEW_SHA = '2'.repeat(40);

function projectFixture(): Project {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    schemaVersion: 2,
    graphRevision: 3,
    id: 'project-one',
    name: 'owner/repo',
    repoUrl: 'https://github.com/owner/repo',
    source: 'github',
    repoDetails: {
      owner: 'owner', repo: 'repo', defaultBranch: 'main', requestedRef: 'main', commitSha: OLD_SHA,
      treeSha: '3'.repeat(40), sourceGrant: 'old-source-grant'.repeat(4),
    },
    nodes: [{
      id: '11111111-1111-4111-8111-111111111111',
      type: 'enhanced',
      position: { x: 0, y: 0 },
      data: { label: 'Old', description: '', files: ['old.ts'], category: 'core' },
    }],
    edges: [],
    layoutDirection: 'TB',
    aiContextSnapshot: null,
    lastSyncedAt: null,
    chatSessions: [],
    activeChatSessionId: null,
    fileTree: [{ path: 'old.ts', type: 'blob', sha: '4'.repeat(40), commitSha: OLD_SHA }],
    repositorySnapshot: {
      host: 'github.com', owner: 'owner', repo: 'repo', requestedRef: 'main', defaultBranch: 'main',
      commitSha: OLD_SHA, treeSha: '3'.repeat(40), visibility: 'public', retrievedAt: now.toISOString(),
    },
    analysisCoverage: {
      treeComplete: true, discovered: 1,
      counts: { analyzed: 1, ignored: 0, unsupported: 0, oversized: 0, failed: 0, unclassified: 0 },
      analyzed: [{ path: 'old.ts', reason: 'source', analysisLevel: 'semantic' }],
      ignored: [], unsupported: [], oversized: [], failed: [], unclassified: [],
    },
    analysisWarnings: [],
    analyzer: { version: 'old' },
    createdAt: now,
    updatedAt: now,
  };
}

function analysisResult(): RepositoryAnalysisResult {
  return {
    protocolVersion: 2,
    requestId: 'request-refresh-hook',
    nodes: [{
      id: '22222222-2222-4222-8222-222222222222', type: 'enhanced', position: { x: 50, y: 75 },
      data: { label: 'New', description: '', files: ['new.ts'], category: 'service' },
    }],
    edges: [],
    repoDetails: {
      owner: 'owner', repo: 'repo', defaultBranch: 'main', requestedRef: 'main', commitSha: NEW_SHA,
      treeSha: '5'.repeat(40), sourceGrant: 'new-source-grant'.repeat(4), fileCount: 1,
    },
    fileTree: [{ path: 'new.ts', type: 'blob', sha: '6'.repeat(40), size: 10, commitSha: NEW_SHA }],
    snapshot: {
      host: 'github.com', owner: 'owner', repo: 'repo', requestedRef: 'main', defaultBranch: 'main',
      commitSha: NEW_SHA, treeSha: '5'.repeat(40), visibility: 'public', retrievedAt: '2026-02-01T00:00:00.000Z',
    },
    sourceGrant: 'new-source-grant'.repeat(4),
    coverage: {
      treeComplete: true, discovered: 1,
      counts: { analyzed: 1, ignored: 0, unsupported: 0, oversized: 0, failed: 0, unclassified: 0 },
      analyzed: [{ path: 'new.ts', reason: 'source', analysisLevel: 'semantic' }],
      ignored: [], unsupported: [], oversized: [], failed: [], unclassified: [],
    },
    warnings: [],
    analyzer: { version: 'new' },
    enrichment: { requested: false, status: 'not-requested' },
  };
}

function useHarness() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [, setSelectedNode] = useState<Node | null>(null);
  return useProjects({
    nodes,
    edges,
    setNodes,
    setEdges,
    layoutDirection,
    setLayoutDirection,
    setSelectedNode,
    fitView: vi.fn(),
  });
}

beforeEach(() => {
  localStorage.clear();
  const project = projectFixture();
  storeMocks.projects = [project];
  storeMocks.initialize.mockReset().mockResolvedValue({
    projects: storeMocks.projects,
    migration: {
      key: 'legacy-localstorage-projects-v1', source: 'legacy-localstorage', status: 'completed',
      total: 0, migrated: 0, skipped: 0, quarantined: 0,
      startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    quarantined: [],
    persistenceTokens: { 'project-one': { graphRevision: 3, checksum: '11111111' } },
  });
  storeMocks.save.mockReset().mockImplementation(async (project: Project) => ({
    projectId: project.id,
    token: { graphRevision: project.graphRevision, checksum: '11111111' },
  }));
  storeMocks.saveWithBackup.mockReset().mockImplementation(async (previous: Project, next: Project) => ({
    id: 'backup-one', projectId: previous.id, kind: 'pre-analysis-refresh',
    sourceCommitSha: previous.repoDetails?.commitSha,
    targetCommitSha: next.repoDetails?.commitSha,
    createdAt: '2026-02-01T00:00:00.000Z',
    persistenceToken: { graphRevision: next.graphRevision, checksum: '22222222' },
  }));
  storeMocks.listBackups.mockReset().mockResolvedValue([]);
  storeMocks.loadBackup.mockReset().mockResolvedValue(project);
  storeMocks.loadProject.mockReset().mockResolvedValue({
    project,
    token: { graphRevision: project.graphRevision, checksum: '11111111' },
  });
  storeMocks.deleteProject.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(analysisResult()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useProjects refresh workflow', () => {
  test('keeps the current graph intact until replacement is explicitly confirmed', async () => {
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.activeProject?.id).toBe('project-one'));

    await act(async () => {
      await result.current.startRefreshAnalysis();
    });

    expect(result.current.refreshAnalysis.status).toBe('ready');
    expect(result.current.activeProject?.repoDetails?.commitSha).toBe(OLD_SHA);
    expect(result.current.activeProject?.nodes[0].data.label).toBe('Old');
    expect(storeMocks.saveWithBackup).not.toHaveBeenCalled();

    await act(async () => {
      expect(await result.current.replaceWithRefreshCandidate()).toBe(true);
    });

    expect(storeMocks.saveWithBackup).toHaveBeenCalledTimes(1);
    expect(result.current.activeProject?.repoDetails?.commitSha).toBe(NEW_SHA);
    expect(result.current.activeProject?.nodes[0].data.label).toBe('New');
    expect(result.current.activeProject?.graphRevision).toBe(4);
    expect(result.current.refreshBackups[0]?.id).toBe('backup-one');
  });

  test('duplicates a candidate without replacing the source project', async () => {
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.activeProject?.id).toBe('project-one'));
    await act(async () => { await result.current.startRefreshAnalysis(); });

    let duplicateId: string | null = null;
    await act(async () => {
      duplicateId = await result.current.duplicateRefreshCandidate('Refreshed copy');
    });

    expect(duplicateId).toBeTruthy();
    expect(result.current.projects).toHaveLength(2);
    expect(result.current.projects.find((project) => project.id === 'project-one')?.repoDetails?.commitSha).toBe(OLD_SHA);
    expect(result.current.activeProject?.id).toBe(duplicateId);
    expect(result.current.activeProject?.repoDetails?.commitSha).toBe(NEW_SHA);
    expect(storeMocks.saveWithBackup).not.toHaveBeenCalled();
  });

  test('cancels an in-flight candidate without changing the graph', async () => {
    vi.mocked(fetch).mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.activeProject?.id).toBe('project-one'));

    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = result.current.startRefreshAnalysis();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.refreshAnalysis.status).toBe('running'));
    act(() => result.current.cancelRefreshAnalysis());
    await act(async () => { await pending; });

    expect(result.current.refreshAnalysis.status).toBe('error');
    expect(result.current.activeProject?.repoDetails?.commitSha).toBe(OLD_SHA);
    expect(result.current.activeProject?.nodes[0].data.label).toBe('Old');
    expect(storeMocks.saveWithBackup).not.toHaveBeenCalled();
  });
});
