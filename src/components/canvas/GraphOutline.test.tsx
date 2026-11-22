// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, test, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { Edge, Node } from 'reactflow';

import type { EdgeData, NodeData } from '@/types';
import GraphOutline from './GraphOutline';

afterEach(cleanup);

const nodes: Node<NodeData>[] = [
  { id: 'api', position: { x: 0, y: 0 }, data: { label: 'API route', description: 'Receives requests', category: 'route', files: ['src/app/api/route.ts'] } },
  { id: 'service', position: { x: 100, y: 0 }, data: { label: 'Service', description: 'Loads data', category: 'service', files: ['src/lib/service.ts'] } },
];
const edges: Edge<EdgeData>[] = [{
  id: 'api-service',
  source: 'api',
  target: 'service',
  data: { label: 'imports', type: 'import', confidence: 'high', evidence: [] },
}];

test('provides an accessible keyboard path to every graph element', async () => {
  const user = userEvent.setup();
  const reveal = vi.fn();
  const { container } = render(<GraphOutline nodes={nodes} edges={edges} onReveal={reveal} />);

  await user.click(screen.getByRole('button', { name: 'Open accessible graph outline' }));
  assert.ok(screen.getByRole('dialog', { name: 'Graph outline' }));
  await user.click(screen.getByRole('button', { name: /API route/ }));
  assert.deepEqual(reveal.mock.calls[0][0], { kind: 'node', id: 'api' });

  await user.click(screen.getByRole('button', { name: 'Open accessible graph outline' }));
  await user.click(screen.getByRole('tab', { name: /Relationships/ }));
  await user.click(screen.getByRole('button', { name: /API route to Service: imports/ }));
  assert.deepEqual(reveal.mock.calls[1][0], { kind: 'edge', id: 'api-service' });

  const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
  assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(', '));
});

test('filters components by source path', async () => {
  const user = userEvent.setup();
  render(<GraphOutline nodes={nodes} edges={edges} onReveal={() => undefined} />);
  await user.click(screen.getByRole('button', { name: 'Open accessible graph outline' }));
  await user.type(screen.getByRole('textbox', { name: 'Filter graph outline' }), 'service.ts');
  assert.ok(screen.getByRole('button', { name: /Service/ }));
  assert.equal(screen.queryByRole('button', { name: /API route/ }), null);
});
