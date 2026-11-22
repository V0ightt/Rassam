// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Edge, Node } from 'reactflow';
import type { ProjectPersistenceToken } from '@/lib/project-store';
import type { ProjectRevisionNotice } from '@/lib/project-revision-channel';
import type { Project } from '@/types';

const mocks = vi.hoisted(() => ({
  listener: null as ((notice: ProjectRevisionNotice) => void) | null,
  publish: vi.fn(),
  initialize: vi.fn(),
  save: vi.fn(),
  loadProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('@/lib/project-revision-channel', () => ({
  createProjectRevisionChannel: (listener: (notice: ProjectRevisionNotice) => void) => {
    mocks.listener = listener;
    return { sourceId: 'local-tab', available: true, publish: mocks.publish, close: vi.fn() };
  },
}));

vi.mock('@/lib/project-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/project-store')>();
  return {
    ...actual,
    initializeProjectStorage: mocks.initialize,
    saveProjectToStore: mocks.save,
    loadProjectFromStore: mocks.loadProject,
    deleteProjectFromStore: mocks.deleteProject,
    saveProjectWithRefreshBackup: vi.fn(),
    listRefreshBackups: vi.fn().mockResolvedValue([]),
    loadRefreshBackup: vi.fn(),
  };
});

vi.mock('@/lib/file-store', () => ({ clearProjectFiles: vi.fn() }));

import { ProjectWriteConflictError, createProjectPersistenceToken } from '@/lib/project-store';
import { useProjects } from './useProjects';

function fixture(label = 'Local', graphRevision = 2): Project {
  const now = new Date('2026-08-04T00:00:00.000Z');
  return {
    schemaVersion: 2,
    graphRevision,
    id: 'project-one',
    name: 'Project one',
    repoUrl: '',
    source: 'empty',
    repoDetails: null,
    nodes: [{
      id: 'node-one',
      type: 'enhanced',
      position: { x: 0, y: 0 },
      data: { label, description: '', files: [], category: 'core' },
    }],
    edges: [],
    layoutDirection: 'TB',
    aiContextSnapshot: null,
    lastSyncedAt: null,
    chatSessions: [{
      id: 'chat-one',
      title: 'Chat 1',
      messages: [],
      createdAt: now,
      updatedAt: now,
    }],
    activeChatSessionId: 'chat-one',
    fileTree: [],
    createdAt: now,
    updatedAt: now,
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

function notice(token: ProjectPersistenceToken, kind: 'saved' | 'deleted' = 'saved'): ProjectRevisionNotice {
  return {
    protocolVersion: 1,
    sourceId: 'remote-tab',
    kind,
    projectId: 'project-one',
    token,
    timestamp: new Date().toISOString(),
  };
}

beforeEach(() => {
  localStorage.clear();
  const project = fixture();
  const token = createProjectPersistenceToken(project);
  mocks.listener = null;
  mocks.publish.mockReset();
  mocks.initialize.mockReset().mockResolvedValue({
    projects: [project],
    persistenceTokens: { [project.id]: token },
    migration: {
      key: 'legacy-localstorage-projects-v1', source: 'legacy-localstorage', status: 'completed',
      total: 0, migrated: 0, skipped: 0, quarantined: 0,
      startedAt: nowIso(), updatedAt: nowIso(),
    },
    quarantined: [],
  });
  mocks.save.mockReset().mockImplementation(async (next: Project) => ({
    projectId: next.id,
    token: createProjectPersistenceToken(next),
  }));
  mocks.loadProject.mockReset().mockResolvedValue({ project, token });
  mocks.deleteProject.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function nowIso() {
  return '2026-08-04T00:00:00.000Z';
}

describe('useProjects cross-tab conflicts', () => {
  test('a remote revision pauses autosave until the project is explicitly reloaded', async () => {
    const remote = fixture('Remote', 3);
    const remoteToken = createProjectPersistenceToken(remote);
    mocks.loadProject.mockResolvedValue({ project: remote, token: remoteToken });
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.storageReady).toBe(true));
    await waitFor(() => expect(mocks.listener).not.toBeNull());

    act(() => mocks.listener?.(notice(remoteToken)));
    expect(result.current.activeProjectConflict).toMatchObject({
      projectId: 'project-one',
      reason: 'newer-revision',
      externalGraphRevision: 3,
    });
    expect(result.current.saveStatus).toBe('error');

    act(() => result.current.updateChatMessages('project-one', 'chat-one', [{
      id: 'message-local', role: 'user', content: 'unsaved', timestamp: new Date(),
    }]));
    await new Promise((resolve) => setTimeout(resolve, 425));
    expect(mocks.save).not.toHaveBeenCalled();

    await act(async () => {
      expect(await result.current.reloadProjectAfterConflict()).toBe(true);
    });
    expect(result.current.activeProject?.nodes[0].data.label).toBe('Remote');
    expect(result.current.activeProjectConflict).toBeNull();
    expect(result.current.saveStatus).toBe('saved');
  });

  test('compare-and-swap failure detects a race even without a broadcast', async () => {
    const local = fixture();
    const expected = createProjectPersistenceToken(local);
    const remote = fixture('Remote', 3);
    const actual = createProjectPersistenceToken(remote);
    mocks.save.mockRejectedValueOnce(new ProjectWriteConflictError(local.id, expected, actual));
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    act(() => result.current.updateChatMessages('project-one', 'chat-one', [{
      id: 'message-local', role: 'user', content: 'race', timestamp: new Date(),
    }]));
    await waitFor(() => expect(result.current.activeProjectConflict).not.toBeNull(), { timeout: 1_500 });

    expect(result.current.activeProjectConflict).toMatchObject({
      reason: 'newer-revision',
      externalChecksum: actual.checksum,
    });
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  test('duplicate recovery preserves local work and restores the remote original separately', async () => {
    const remote = fixture('Remote', 4);
    const remoteToken = createProjectPersistenceToken(remote);
    mocks.loadProject.mockResolvedValue({ project: remote, token: remoteToken });
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.storageReady).toBe(true));
    await waitFor(() => expect(mocks.listener).not.toBeNull());
    act(() => mocks.listener?.(notice(remoteToken)));

    let duplicateId: string | null = null;
    await act(async () => {
      duplicateId = await result.current.duplicateLocalWorkAfterConflict(undefined, 'Recovered local');
    });

    expect(duplicateId).toBeTruthy();
    expect(result.current.projects).toHaveLength(2);
    expect(result.current.projects.find((project) => project.id === 'project-one')?.nodes[0].data.label).toBe('Remote');
    expect(result.current.activeProject?.id).toBe(duplicateId);
    expect(result.current.activeProject?.name).toBe('Recovered local');
    expect(result.current.activeProject?.nodes[0].data.label).toBe('Local');
    expect(result.current.activeProject?.graphRevision).toBe(0);
    expect(result.current.projectConflicts).toEqual({});
  });
});
