import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseAndValidateImportJson } from './import';

test('import normalizes node defaults and remaps valid edge endpoints', () => {
  const imported = parseAndValidateImportJson(JSON.stringify({
    metadata: { version: '1.0', repo: { owner: 'openai', repo: 'example' } },
    nodes: [
      { id: 'old-a', position: { x: 12, y: 34 }, data: { label: 'A', files: ['a.ts'] } },
      { id: 'old-b', data: {} },
    ],
    edges: [
      { id: 'old-edge', source: 'old-a', target: 'old-b', animated: true },
      { id: 'dangling', source: 'old-a', target: 'missing' },
    ],
  }), 'backup.json');

  assert.equal(imported.name, 'openai/example');
  assert.equal(imported.repoDetails?.fileCount, 1);
  assert.equal(imported.nodes.length, 2);
  assert.equal(imported.nodes[0].data.label, 'A');
  assert.equal(imported.nodes[1].data.label, 'Node 2');
  assert.equal(imported.nodes[1].data.category, 'default');
  assert.deepEqual(imported.nodes[1].position, { x: 300, y: 150 });
  assert.notEqual(imported.nodes[0].id, 'old-a');
  assert.equal(imported.edges.length, 1);
  assert.equal(imported.edges[0].source, imported.nodes[0].id);
  assert.equal(imported.edges[0].target, imported.nodes[1].id);
  assert.equal(imported.edges[0].animated, true);
});

test('import derives a project name from the JSON filename', () => {
  const imported = parseAndValidateImportJson(JSON.stringify({ nodes: [], edges: [] }), 'diagram.JSON');
  assert.equal(imported.name, 'diagram');
  assert.equal(imported.repoDetails, null);
});

test('import rejects malformed roots, nodes, and unsupported versions', () => {
  assert.throws(() => parseAndValidateImportJson('null'), /Expected a JSON object/);
  assert.throws(
    () => parseAndValidateImportJson(JSON.stringify({ metadata: { version: '2.0' }, nodes: [], edges: [] })),
    /Unsupported export version/,
  );
  assert.throws(
    () => parseAndValidateImportJson(JSON.stringify({ nodes: [null], edges: [] })),
    /Node at index 0/,
  );
  assert.throws(
    () => parseAndValidateImportJson(JSON.stringify({ nodes: [] })),
    /edges.*array/i,
  );
});
