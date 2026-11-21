// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, test, vi } from 'vitest';
import { axe } from 'vitest-axe';

import EvidenceInspector, {
  type EvidenceEdge,
  type EvidenceNode,
} from './EvidenceInspector';

afterEach(cleanup);

const sourceEvidence = {
  path: 'src/app/page.tsx',
  blobSha: 'a'.repeat(40),
  startLine: 12,
  endLine: 14,
  kind: 'import' as const,
  confidence: 'high' as const,
};

const nodes: EvidenceNode[] = [
  {
    id: 'route',
    type: 'enhanced',
    position: { x: 0, y: 0 },
    data: {
      label: 'App route',
      description: 'Handles the primary route.',
      category: 'route',
      files: ['src/app/page.tsx'],
      evidence: [sourceEvidence],
      confidence: 'high',
      analysisLevel: 'semantic',
    },
  },
  {
    id: 'service',
    type: 'enhanced',
    position: { x: 100, y: 0 },
    data: {
      label: 'Repository service',
      description: 'Loads repository data.',
      category: 'service',
      files: ['src/lib/repository.ts'],
    },
  },
];

const edges: EvidenceEdge[] = [
  {
    id: 'route-service',
    source: 'route',
    target: 'service',
    type: 'custom',
    data: {
      label: 'imports',
      type: 'import',
      direction: 'one-way',
      confidence: 'high',
      evidence: [sourceEvidence],
    },
  },
];

test('node inspector exposes files, provenance, and keyboard-operable relationships', async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  const reveal = vi.fn();
  const { container } = render(
    <EvidenceInspector
      selection={{ kind: 'node', id: 'route' }}
      nodes={nodes}
      edges={edges}
      onNavigateToSource={navigate}
      onRevealGraphElement={reveal}
    />,
  );

  assert.ok(screen.getByRole('complementary', { name: 'Evidence inspector' }));
  assert.ok(screen.getByText('Handles the primary route.'));
  assert.ok(screen.getByText('Semantic analysis'));
  assert.ok(screen.getByText('Repository service'));

  const sourceButtons = screen.getAllByRole('button', {
    name: 'Open src/app/page.tsx, lines 12 to 14',
  });
  await user.click(sourceButtons[0]);
  assert.deepEqual(navigate.mock.calls[0][0], {
    path: 'src/app/page.tsx',
    blobSha: 'a'.repeat(40),
    startLine: 12,
    endLine: 14,
  });

  const relationship = screen.getByRole('button', {
    name: 'Reveal imports relationship with Repository service',
  });
  relationship.focus();
  await user.keyboard('{Enter}');
  assert.deepEqual(reveal.mock.calls[0][0], { kind: 'edge', id: 'route-service' });

  const results = await axe(container, {
    // JSDOM has no canvas context, so axe cannot evaluate computed color contrast.
    rules: { 'color-contrast': { enabled: false } },
  });
  assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(', '));
});

test('edge inspector exposes endpoints and every evidence reference', async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  const reveal = vi.fn();
  render(
    <EvidenceInspector
      selection={{ kind: 'edge', id: 'route-service' }}
      nodes={nodes}
      edges={edges}
      onNavigateToSource={navigate}
      onRevealGraphElement={reveal}
    />,
  );

  assert.ok(screen.getByRole('heading', { name: 'imports' }));
  assert.ok(screen.getByText('1 reference'));
  await user.click(screen.getByRole('button', { name: 'Reveal target node Repository service' }));
  assert.deepEqual(reveal.mock.calls[0][0], { kind: 'node', id: 'service' });

  await user.click(screen.getByRole('button', {
    name: 'Open src/app/page.tsx, lines 12 to 14',
  }));
  assert.equal(navigate.mock.calls[0][0].blobSha, 'a'.repeat(40));
});

test('read-only mode renders source locations without dead buttons', () => {
  render(
    <EvidenceInspector
      selection={{ kind: 'edge', id: 'route-service' }}
      nodes={nodes}
      edges={edges}
    />,
  );

  assert.equal(screen.queryByRole('button'), null);
  assert.ok(screen.getByText('src/app/page.tsx:12-14'));
});

test('large file lists use progressive disclosure', async () => {
  const user = userEvent.setup();
  const files = Array.from({ length: 51 }, (_, index) => `src/generated/file-${index}.ts`);
  const largeNode: EvidenceNode = {
    ...nodes[0],
    data: { ...nodes[0].data, files, evidence: [] },
  };

  render(
    <EvidenceInspector
      selection={{ kind: 'node', id: 'route' }}
      nodes={[largeNode, nodes[1]]}
      edges={edges}
    />,
  );

  const fileList = screen.getByRole('list', { name: 'Associated files' });
  assert.equal(within(fileList).getAllByRole('listitem').length, 50);
  await user.click(screen.getByRole('button', { name: 'Show 1 more file' }));
  assert.equal(within(fileList).getAllByRole('listitem').length, 51);
  assert.equal(screen.queryByRole('button', { name: /Show .* more files?/ }), null);
});

test('bidirectional relationships appear in both directions for either endpoint', () => {
  const twoWayEdges: EvidenceEdge[] = [{
    ...edges[0],
    data: { ...edges[0].data, direction: 'two-way' },
  }];

  render(
    <EvidenceInspector
      selection={{ kind: 'node', id: 'service' }}
      nodes={nodes}
      edges={twoWayEdges}
      onRevealGraphElement={() => undefined}
    />,
  );

  assert.equal(screen.getAllByRole('button', {
    name: 'Reveal imports relationship with App route',
  }).length, 2);
});

test('unsafe legacy evidence paths never become navigation controls', () => {
  const unsafeEdge: EvidenceEdge = {
    ...edges[0],
    data: {
      ...edges[0].data,
      evidence: [{ ...sourceEvidence, path: '../private/.env' }],
    },
  };

  render(
    <EvidenceInspector
      selection={{ kind: 'edge', id: 'route-service' }}
      nodes={nodes}
      edges={[unsafeEdge]}
      onNavigateToSource={() => undefined}
    />,
  );

  assert.ok(screen.getByText('../private/.env:12-14'));
  assert.equal(screen.queryByRole('button'), null);
});
