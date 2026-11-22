import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { Project } from '@/types';
import {
  createRassamGraphExport,
  createRassamProjectBackup,
  parseRassamExport,
  rassamGraphExportSchema,
  serializeRassamExport,
} from './project-export';
import { parseAndValidateImportJson } from './import';

const nodeA = '11111111-1111-4111-8111-111111111111';
const nodeB = '22222222-2222-4222-8222-222222222222';
const edgeId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';
const commitSha = 'a'.repeat(40);
const treeSha = 'b'.repeat(40);
const blobSha = 'c'.repeat(40);

function fixtureProject(): Project {
  const createdAt = new Date('2026-01-02T03:04:05.000Z');
  const updatedAt = new Date('2026-02-03T04:05:06.000Z');
  return {
    schemaVersion: 2,
    graphRevision: 7,
    id: projectId,
    name: 'openai/example',
    repoUrl: 'https://github.com/openai/example',
    source: 'github',
    repoDetails: {
      owner: 'openai',
      repo: 'example',
      defaultBranch: 'main',
      requestedRef: 'v0.3.0',
      commitSha,
      treeSha,
      sourceGrant: 'signed-source-grant-that-must-not-leave-the-browser',
      fileCount: 2,
    },
    nodes: [
      {
        id: nodeA,
        type: 'enhanced',
        position: { x: 10, y: 20 },
        data: {
          label: 'Entry point',
          description: 'Starts the application.',
          files: ['src/index.ts'],
          category: 'core',
          confidence: 'high',
          analysisLevel: 'semantic',
          evidence: [{
            path: 'src/index.ts',
            blobSha,
            startLine: 1,
            endLine: 4,
            kind: 'file-membership',
            confidence: 'high',
          }],
        },
      },
      {
        id: nodeB,
        type: 'enhanced',
        position: { x: 350, y: 20 },
        data: {
          label: 'Service',
          description: 'Provides a service.',
          files: ['src/service.ts'],
          category: 'service',
        },
      },
    ],
    edges: [{
      id: edgeId,
      source: nodeA,
      target: nodeB,
      type: 'custom',
      data: {
        label: 'imports',
        type: 'import',
        confidence: 'high',
        evidence: [{
          path: 'src/index.ts',
          blobSha,
          startLine: 2,
          endLine: 2,
          kind: 'import',
          confidence: 'high',
        }],
      },
    }],
    layoutDirection: 'LR',
    aiContextSnapshot: null,
    lastSyncedAt: null,
    chatSessions: [{
      id: 'chat-1',
      title: 'Architecture',
      messages: [{
        id: 'message-1',
        role: 'user',
        content: 'Sensitive discussion text',
        timestamp: createdAt,
      }],
      createdAt,
      updatedAt,
    }],
    activeChatSessionId: 'chat-1',
    fileTree: [
      { path: 'src/index.ts', type: 'blob', sha: blobSha, size: 120, commitSha },
      { path: 'src/service.ts', type: 'blob', sha: 'd'.repeat(40), size: 240, commitSha },
    ],
    repositorySnapshot: {
      host: 'github.com',
      owner: 'openai',
      repo: 'example',
      requestedRef: 'v0.3.0',
      defaultBranch: 'main',
      commitSha,
      treeSha,
      visibility: 'public',
      retrievedAt: '2026-01-02T03:04:05.000Z',
    },
    analysisCoverage: {
      treeComplete: true,
      discovered: 2,
      counts: { analyzed: 2, ignored: 0, unsupported: 0, oversized: 0, failed: 0, unclassified: 0 },
      analyzed: [
        { path: 'src/index.ts', reason: 'TypeScript source', analysisLevel: 'semantic' },
        { path: 'src/service.ts', reason: 'TypeScript source', analysisLevel: 'semantic' },
      ],
      ignored: [],
      unsupported: [],
      oversized: [],
      failed: [],
      unclassified: [],
    },
    analysisWarnings: ['One optional manifest was not present.'],
    analyzer: { id: 'rassam-typescript', version: '2' },
    createdAt,
    updatedAt,
  };
}

describe('rassam.graph schema v2', () => {
  test('exports revision-pinned graph, evidence, layout, coverage, and current app metadata', () => {
    const project = fixtureProject();
    const exported = createRassamGraphExport({
      nodes: project.nodes,
      edges: project.edges,
      project,
      generatedAt: new Date('2026-03-04T05:06:07.000Z'),
    });

    assert.equal(exported.format, 'rassam.graph');
    assert.equal(exported.schemaVersion, 2);
    assert.equal(exported.appVersion, '0.3.0');
    assert.equal(exported.generatedAt, '2026-03-04T05:06:07.000Z');
    assert.equal(exported.graph.revision, 7);
    assert.equal(exported.graph.layout.direction, 'LR');
    assert.equal(exported.repository?.requestedRef, 'v0.3.0');
    assert.equal(exported.repository?.commitSha, commitSha);
    assert.equal(exported.repository?.snapshot?.treeSha, treeSha);
    assert.equal(exported.graph.edges[0].data?.evidence?.[0].startLine, 2);
    assert.equal(exported.coverage?.counts.analyzed, 2);
    assert.deepEqual(exported.analyzer, { id: 'rassam-typescript', version: '2' });

    const serialized = serializeRassamExport(exported);
    assert.doesNotMatch(serialized, /signed-source-grant/);
    assert.doesNotMatch(serialized, /Sensitive discussion text/);
    assert.doesNotMatch(serialized, /cachedSource|sourceGrant|providerCredentials/);
  });

  test('round-trips through import while remapping graph IDs and retaining evidence', () => {
    const project = fixtureProject();
    const serialized = serializeRassamExport(createRassamGraphExport({
      nodes: project.nodes,
      edges: project.edges,
      project,
    }));
    const imported = parseAndValidateImportJson(serialized, 'example.rassam.json');

    assert.equal(imported.name, 'openai/example');
    assert.equal(imported.source, 'imported');
    assert.equal(imported.graphRevision, 7);
    assert.equal(imported.layoutDirection, 'LR');
    assert.equal(imported.repositorySnapshot?.commitSha, commitSha);
    assert.equal(imported.analysisCoverage?.discovered, 2);
    assert.notEqual(imported.nodes[0].id, nodeA);
    assert.equal(imported.edges[0].source, imported.nodes[0].id);
    assert.equal(imported.nodes[0].data.evidence?.[0].blobSha, blobSha);
    assert.equal(imported.edges[0].data?.evidence?.[0].kind, 'import');
    assert.equal(imported.repoDetails?.sourceGrant, undefined);
  });

  test('rejects duplicate IDs, dangling edges, and unknown top-level data', () => {
    const project = fixtureProject();
    const valid = createRassamGraphExport({ nodes: project.nodes, edges: project.edges, project });
    assert.equal(rassamGraphExportSchema.safeParse({ ...valid, unexpected: true }).success, false);
    assert.equal(rassamGraphExportSchema.safeParse({
      ...valid,
      graph: { ...valid.graph, nodes: [valid.graph.nodes[0], valid.graph.nodes[0]] },
    }).success, false);
    assert.equal(rassamGraphExportSchema.safeParse({
      ...valid,
      graph: {
        ...valid.graph,
        edges: [{ ...valid.graph.edges[0], target: '55555555-5555-4555-8555-555555555555' }],
      },
    }).success, false);
  });
});

describe('privacy-bounded project backup', () => {
  test('excludes chats by default and always excludes cached source and credentials', () => {
    const backup = createRassamProjectBackup(fixtureProject(), { includeChats: false });
    const serialized = serializeRassamExport(backup);

    assert.equal(backup.format, 'rassam.project-backup');
    assert.equal(backup.privacy.includesChats, false);
    assert.equal(backup.privacy.includesCachedSource, false);
    assert.equal(backup.privacy.includesProviderCredentials, false);
    assert.deepEqual(backup.chats, []);
    assert.equal(backup.activeChatSessionId, null);
    assert.doesNotMatch(serialized, /Sensitive discussion text|signed-source-grant/);
    assert.equal(backup.fileTree.length, 2);
  });

  test('includes and restores chats only after explicit selection', () => {
    const backup = createRassamProjectBackup(fixtureProject(), { includeChats: true });
    const parsed = parseRassamExport(JSON.parse(serializeRassamExport(backup)));
    assert.equal(parsed?.format, 'rassam.project-backup');
    if (!parsed || parsed.format !== 'rassam.project-backup') throw new Error('Expected a project backup.');
    assert.equal(parsed.privacy.includesChats, true);
    assert.equal(parsed.chats[0].messages[0].content, 'Sensitive discussion text');

    const imported = parseAndValidateImportJson(serializeRassamExport(parsed));
    assert.equal(imported.chatSessions?.[0].messages[0].content, 'Sensitive discussion text');
    assert.notEqual(imported.chatSessions?.[0].id, 'chat-1');
    assert.equal(imported.activeChatSessionId, imported.chatSessions?.[0].id);
    assert.equal(imported.fileTree?.length, 2);
  });
});
