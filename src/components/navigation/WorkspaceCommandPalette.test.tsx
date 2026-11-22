// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, test, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { FlowEdge, FlowNode, RepoFileEntry } from '@/types';
import WorkspaceCommandPalette from './WorkspaceCommandPalette';

afterEach(cleanup);

const nodes: FlowNode[] = [
  {
    id: 'route',
    type: 'enhanced',
    position: { x: 0, y: 0 },
    data: {
      label: 'Repository route',
      description: 'Accepts repository requests',
      category: 'route',
      files: ['src/app/api/repo/route.ts'],
    },
  },
  {
    id: 'github',
    type: 'enhanced',
    position: { x: 100, y: 0 },
    data: {
      label: 'GitHub service',
      description: 'Reads the pinned source tree',
      category: 'service',
      files: ['src/lib/github.ts'],
    },
  },
];

const edges: FlowEdge[] = [{
  id: 'route-github',
  source: 'route',
  target: 'github',
  data: { label: 'fetches tree', type: 'calls' },
}];

const files: RepoFileEntry[] = [
  { path: 'src/app/api/repo/route.ts', type: 'blob' },
  { path: 'src/lib/github.ts', type: 'blob' },
  { path: 'README.md', type: 'blob' },
];

test('searches every workspace kind and reveals the keyboard-selected result', async () => {
  const user = userEvent.setup();
  const reveal = vi.fn();
  render(
    <WorkspaceCommandPalette
      nodes={nodes}
      edges={edges}
      files={files}
      open
      onRevealResult={reveal}
    />,
  );

  const input = screen.getByRole('combobox', { name: 'Search workspace' });
  await user.type(input, 'github service');
  assert.ok(screen.getByRole('option', { name: /^GitHub service/ }));
  assert.ok(screen.getByText(/results?$/));

  await user.keyboard('{Enter}');
  assert.equal(reveal.mock.calls.length, 1);
  assert.equal(reveal.mock.calls[0][0].id, 'node:github');
});

test('supports next, previous, isolate-neighbors, and clear-filter actions', async () => {
  const user = userEvent.setup();
  const isolate = vi.fn();
  const clearFilters = vi.fn();
  render(
    <WorkspaceCommandPalette
      nodes={nodes}
      edges={edges}
      files={files}
      open
      onRevealResult={() => undefined}
      onIsolateNeighbors={isolate}
      onClearFilters={clearFilters}
      activeGraphFilterLabel="Neighbors of GitHub service"
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Nodes, 2 results' }));
  await user.click(screen.getByRole('button', { name: 'Next result' }));
  await user.click(screen.getByRole('button', { name: 'Previous result' }));
  await user.click(screen.getByRole('button', { name: /Isolate neighbors of GitHub service/ }));
  assert.deepEqual(isolate.mock.calls[0], ['github']);

  await user.click(screen.getByRole('button', { name: /Clear filters/ }));
  assert.equal(clearFilters.mock.calls.length, 1);
});

test('publishes transient match sets only while the palette has a query', async () => {
  const user = userEvent.setup();
  const matches = vi.fn();
  render(
    <WorkspaceCommandPalette
      nodes={nodes}
      edges={edges}
      files={files}
      open
      onRevealResult={() => undefined}
      onTransientMatchesChange={matches}
    />,
  );

  await user.type(screen.getByRole('combobox', { name: 'Search workspace' }), 'fetches tree');
  const latest = matches.mock.calls.at(-1)?.[0];
  assert.equal(latest.edgeIds.has('route-github'), true);
  assert.equal(latest.nodeIds.has('route'), true);
  assert.equal(latest.nodeIds.has('github'), true);

  await user.click(screen.getByRole('button', { name: 'Clear search query' }));
  assert.equal(matches.mock.calls.at(-1)?.[0], null);
});

test('opens with Ctrl+K and has no serious automated accessibility violations', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <WorkspaceCommandPalette
      nodes={nodes}
      edges={edges}
      files={files}
      showTrigger={false}
      onRevealResult={() => undefined}
    />,
  );

  assert.equal(screen.queryByRole('dialog'), null);
  await user.keyboard('{Control>}k{/Control}');
  assert.ok(screen.getByRole('dialog'));

  const accessibility = await axe(container.ownerDocument.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  assert.equal(accessibility.violations.length, 0, accessibility.violations.map((item) => item.id).join(', '));
});
