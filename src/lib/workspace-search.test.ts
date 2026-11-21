import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import type { FlowEdge, FlowNode, RepoFileEntry } from '@/types';
import {
  buildWorkspaceSearchIndex,
  getNeighborNodeIds,
  getWorkspaceTransientMatches,
  searchWorkspace,
} from './workspace-search';

const nodes: FlowNode[] = [
  {
    id: 'route',
    type: 'enhanced',
    position: { x: 0, y: 0 },
    data: {
      label: 'Repository route',
      description: 'Validates incoming GitHub analysis requests',
      category: 'route',
      files: ['src/app/api/repo/route.ts'],
    },
  },
  {
    id: 'service',
    type: 'enhanced',
    position: { x: 100, y: 0 },
    data: {
      label: 'GitHub service',
      description: 'Fetches the pinned repository tree',
      category: 'service',
      files: ['src/lib/github.ts'],
    },
  },
];

const edges: FlowEdge[] = [{
  id: 'route-service',
  source: 'route',
  target: 'service',
  data: {
    label: 'reads repository',
    type: 'calls',
    evidence: [{
      path: 'src/app/api/repo/route.ts',
      blobSha: 'a'.repeat(40),
      startLine: 20,
      kind: 'import',
      confidence: 'high',
    }],
  },
}];

const files: RepoFileEntry[] = [
  { path: 'src/app/api/repo/route.ts', type: 'blob', sha: 'a'.repeat(40) },
  { path: 'src/lib/github.ts', type: 'blob', sha: 'b'.repeat(40) },
  { path: 'README.md', type: 'blob', sha: 'c'.repeat(40) },
  { path: 'src', type: 'tree' },
];

const index = buildWorkspaceSearchIndex({ nodes, edges, files });

describe('workspace search', () => {
  test('indexes nodes, repository files, relationships, and used categories', () => {
    const response = searchWorkspace(index, '');
    assert.deepEqual(response.counts, {
      all: 8,
      node: 2,
      file: 3,
      relationship: 1,
      category: 2,
    });
    assert.equal(response.results.some((result) => result.id === 'file:README.md'), true);
    assert.equal(response.results.some((result) => result.id === 'relationship:route-service'), true);
  });

  test('ranks exact and title matches ahead of keyword-only matches', () => {
    const response = searchWorkspace(index, 'github service');
    assert.equal(response.results[0].id, 'node:service');
    assert.equal(response.results.some((result) => result.id === 'file:src/lib/github.ts'), true);
  });

  test('supports explicit kind prefixes without confusing the remaining query', () => {
    const response = searchWorkspace(index, 'file: route');
    assert.equal(response.effectiveFilter, 'file');
    assert.deepEqual(response.results.map((result) => result.id), ['file:src/app/api/repo/route.ts']);

    const relationship = searchWorkspace(index, 'edge: reads repository');
    assert.deepEqual(relationship.results.map((result) => result.id), ['relationship:route-service']);
  });

  test('uses all query tokens and normalizes separators and case', () => {
    assert.deepEqual(
      searchWorkspace(index, 'API REPO').results.map((result) => result.id),
      ['file:src/app/api/repo/route.ts', 'node:route', 'relationship:route-service'],
    );
    assert.equal(searchWorkspace(index, 'route missing-token').results.length, 0);
  });

  test('derives transient graph targets without changing graph objects', () => {
    const before = JSON.stringify(nodes);
    const results = searchWorkspace(index, 'repository').results;
    const matches = getWorkspaceTransientMatches(results);

    assert.equal(matches.nodeIds.has('route'), true);
    assert.equal(matches.nodeIds.has('service'), true);
    assert.equal(matches.edgeIds.has('route-service'), true);
    assert.equal(matches.filePaths.has('src/app/api/repo/route.ts'), true);
    assert.equal(JSON.stringify(nodes), before);
  });

  test('finds incoming and outgoing one-hop neighbors with optional self inclusion', () => {
    assert.deepEqual([...getNeighborNodeIds('route', edges)].sort(), ['route', 'service']);
    assert.deepEqual([...getNeighborNodeIds('route', edges, false)], ['service']);
    assert.deepEqual([...getNeighborNodeIds('unknown', edges)], ['unknown']);
  });
});
