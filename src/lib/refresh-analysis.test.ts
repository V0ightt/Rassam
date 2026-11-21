import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { RepositoryAnalysisResult } from '@/lib/contracts';
import type { Project } from '@/types';
import {
  assertRefreshCandidateApplies,
  buildRefreshedProject,
  buildRestoredRefreshProject,
  createRefreshAnalysisCandidate,
} from './refresh-analysis';

const OLD_SHA = '1'.repeat(40);
const NEW_SHA = '2'.repeat(40);

function projectFixture(): Project {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  return {
    schemaVersion: 2,
    graphRevision: 7,
    id: 'project-one',
    name: 'owner/repo',
    repoUrl: 'https://github.com/owner/repo',
    source: 'github',
    repoDetails: {
      owner: 'owner',
      repo: 'repo',
      requestedRef: 'main',
      defaultBranch: 'main',
      commitSha: OLD_SHA,
      treeSha: '3'.repeat(40),
      sourceGrant: 'old-source-grant'.repeat(4),
    },
    nodes: [{
      id: '11111111-1111-4111-8111-111111111111',
      type: 'enhanced',
      position: { x: 10, y: 20 },
      data: { label: 'Old', description: 'Manual description', files: ['old.ts'], category: 'core' },
    }],
    edges: [],
    layoutDirection: 'LR',
    aiContextSnapshot: null,
    lastSyncedAt: null,
    chatSessions: [],
    activeChatSessionId: null,
    fileTree: [{ path: 'old.ts', type: 'blob', sha: '4'.repeat(40), commitSha: OLD_SHA }],
    repositorySnapshot: {
      host: 'github.com',
      owner: 'owner',
      repo: 'repo',
      requestedRef: 'main',
      defaultBranch: 'main',
      commitSha: OLD_SHA,
      treeSha: '3'.repeat(40),
      visibility: 'public',
      retrievedAt: createdAt.toISOString(),
    },
    analysisCoverage: {
      treeComplete: true,
      discovered: 1,
      counts: { analyzed: 1, ignored: 0, unsupported: 0, oversized: 0, failed: 0, unclassified: 0 },
      analyzed: [{ path: 'old.ts', reason: 'source', analysisLevel: 'semantic' }],
      ignored: [], unsupported: [], oversized: [], failed: [], unclassified: [],
    },
    analysisWarnings: [],
    analyzer: { version: 'old' },
    createdAt,
    updatedAt: createdAt,
  };
}

function resultFixture(): RepositoryAnalysisResult {
  return {
    protocolVersion: 2,
    requestId: 'request-refresh-1',
    nodes: [{
      id: '22222222-2222-4222-8222-222222222222',
      type: 'enhanced',
      position: { x: 100, y: 200 },
      data: { label: 'New', description: 'Analyzed', files: ['src/new.ts'], category: 'service' },
    }],
    edges: [],
    repoDetails: {
      owner: 'owner', repo: 'repo', defaultBranch: 'main', requestedRef: 'main',
      commitSha: NEW_SHA, treeSha: '5'.repeat(40), sourceGrant: 'new-source-grant'.repeat(4), fileCount: 2,
    },
    fileTree: [
      { path: 'src/new.ts', type: 'blob', sha: '6'.repeat(40), size: 100, commitSha: NEW_SHA },
      { path: 'README.md', type: 'blob', sha: '7'.repeat(40), size: 40, commitSha: NEW_SHA },
    ],
    snapshot: {
      host: 'github.com', owner: 'owner', repo: 'repo', requestedRef: 'main', defaultBranch: 'main',
      commitSha: NEW_SHA, treeSha: '5'.repeat(40), visibility: 'public', retrievedAt: '2026-02-01T00:00:00.000Z',
    },
    sourceGrant: 'new-source-grant'.repeat(4),
    coverage: {
      treeComplete: true,
      discovered: 2,
      counts: { analyzed: 1, ignored: 1, unsupported: 0, oversized: 0, failed: 0, unclassified: 0 },
      analyzed: [{ path: 'src/new.ts', reason: 'source', analysisLevel: 'semantic' }],
      ignored: [{ path: 'README.md', reason: 'documentation' }],
      unsupported: [], oversized: [], failed: [], unclassified: [],
    },
    warnings: ['Documentation is excluded from dependency analysis.'],
    analyzer: { version: 'deterministic-v2' },
    enrichment: { requested: false, status: 'not-requested' },
  };
}

describe('refresh analysis candidates', () => {
  test('summarizes a candidate without mutating the current project', () => {
    const project = projectFixture();
    const before = structuredClone(project);
    const candidate = createRefreshAnalysisCandidate(project, resultFixture(), {
      id: 'candidate-one',
      startedAt: '2026-02-01T00:00:00.000Z',
      completedAt: '2026-02-01T00:00:01.000Z',
    });

    assert.equal(candidate.baseGraphRevision, 7);
    assert.equal(candidate.summary.revisionChanged, true);
    assert.deepEqual(candidate.summary.files, {
      before: 1, after: 2, analyzed: 1, excluded: 1, failed: 0, unclassified: 0,
    });
    assert.deepEqual(project, before);
  });

  test('replaces the graph wholesale and increments the revision once', () => {
    const project = projectFixture();
    const candidate = createRefreshAnalysisCandidate(project, resultFixture(), { id: 'candidate-one' });
    const refreshed = buildRefreshedProject(project, candidate, new Date('2026-02-02T00:00:00.000Z'));

    assert.equal(refreshed.id, project.id);
    assert.equal(refreshed.graphRevision, 8);
    assert.equal(refreshed.repoDetails?.commitSha, NEW_SHA);
    assert.equal(refreshed.nodes[0].data.label, 'New');
    assert.equal(refreshed.nodes.some((node) => node.data.label === 'Old'), false);
    assert.equal(refreshed.aiContextSnapshot?.graphRevision, 8);
    assert.equal(project.nodes[0].data.label, 'Old');
  });

  test('rejects replacement after a concurrent graph edit', () => {
    const project = projectFixture();
    const candidate = createRefreshAnalysisCandidate(project, resultFixture(), { id: 'candidate-one' });
    assert.throws(
      () => assertRefreshCandidateApplies({ ...project, graphRevision: 8 }, candidate),
      /graph changed/i,
    );
  });

  test('restores a backup as a new monotonic revision and drops its expired grant', () => {
    const backup = projectFixture();
    const refreshed = { ...backup, graphRevision: 12, repoDetails: { ...backup.repoDetails!, commitSha: NEW_SHA } };
    const restored = buildRestoredRefreshProject(refreshed, backup, new Date('2026-03-01T00:00:00.000Z'));

    assert.equal(restored.graphRevision, 13);
    assert.equal(restored.repoDetails?.commitSha, OLD_SHA);
    assert.equal(restored.repoDetails?.requestedRef, 'main');
    assert.equal(restored.repoDetails?.sourceGrant, undefined);
    assert.equal(restored.aiContextSnapshot?.graphRevision, 13);
  });
});
