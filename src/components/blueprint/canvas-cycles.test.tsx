// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from 'reactflow';
import { afterEach, test, vi } from 'vitest';

import { blueprintSchema, createWorkspace, type SourceFile } from '@/blueprint';
import CanvasOutline from '@/components/studio/CanvasOutline';
import { CanvasLegend } from './BlueprintCanvas';
import { CYCLE_EDGE_STYLE, edgeDescription, edgeLabel, edgeStyle } from './BlueprintEdge';
import BlueprintNode, { findingsLabel, type BlueprintNodeData } from './BlueprintNode';
import { useBlueprintCanvas } from './useBlueprintCanvas';

// One dependency cycle reads as one problem on the canvas: drawn on its edges
// with a warning stroke, a dash-dot line and a "cycle" label, stated in the
// caption and the outline, and never counted on every member's card.

afterEach(cleanup);

const file = (path: string, imports: string[]): SourceFile => ({
  path,
  content: `${imports.map((target, index) => `import { v${index} } from "${target}";`).join('\n')}\nexport const value = 1;\n`,
});

const FILES: SourceFile[] = [
  file('src/api/index.ts', ['../apps/index']),
  file('src/apps/index.ts', ['../api/index', '../lib/index']),
  file('src/lib/index.ts', ['../apps/index']),
  file('src/ui/index.ts', ['../api/index', '../lib/index']),
];

const blueprint = blueprintSchema.parse({
  version: '0.1',
  system: { name: 'Docs' },
  components: [
    { id: 'api', name: 'Api', kind: 'api', paths: ['src/api/**'] },
    { id: 'apps', name: 'Apps', kind: 'route', paths: ['src/apps/**'] },
    { id: 'lib', name: 'Lib', kind: 'core', paths: ['src/lib/**'] },
    { id: 'ui', name: 'UI', kind: 'component', paths: ['src/ui/**'] },
  ],
  dependencies: [
    { from: 'api', to: 'apps' },
    { from: 'apps', to: 'api' },
    { from: 'apps', to: 'lib' },
    { from: 'lib', to: 'apps' },
    { from: 'ui', to: 'api' },
  ],
  rules: [
    { id: 'no-cycles', kind: 'no-cycles' },
    { id: 'ui-not-lib', kind: 'forbid', from: 'ui', to: 'lib' },
  ],
});

const session = { blueprint, workspace: createWorkspace(FILES, blueprint), layout: {} };

test('the canvas draws a cycle on its edges, not as a finding on every member', () => {
  const model = renderHook(() => useBlueprintCanvas({ session, question: 'dependencies', selectedId: null, spotlightIds: [], dragPositions: {} })).result.current;

  const findings = Object.fromEntries(model.nodes.map((node) => [node.id, node.data.findings]));
  assert.deepEqual(findings, { api: 0, apps: 0, lib: 1, ui: 1 }, 'only the forbidden ui → lib import is a finding');
  assert.equal(model.nodes.find((node) => node.id === 'ui')!.data.findingSeverity, 'error');
  assert.equal(model.nodes.find((node) => node.id === 'api')!.data.findingSeverity, undefined);

  // Calm mode (the default) keeps both edges of the loop, even though each is a plain declared dependency.
  const cycle = model.edges.filter((edge) => edge.data!.cycle).map((edge) => edge.id).sort();
  assert.deepEqual(cycle, ['api->apps', 'apps->api']);
  const edge = model.edges.find((candidate) => candidate.id === 'api->apps')!;
  assert.equal(edge.data!.status, 'declared', 'a cycle does not turn a declared edge into a forbidden one');
  assert.deepEqual(edge.markerEnd, { type: 'arrowclosed', color: 'var(--status-warn)', width: 16, height: 16 });
  assert.equal(edge.zIndex, 1);
  // a → b and b → a share a midpoint; both know, so one label moves aside.
  assert.deepEqual(model.edges.filter((candidate) => candidate.data!.reverseDrawn).map((candidate) => candidate.id).sort(), ['api->apps', 'apps->api', 'apps->lib', 'lib->apps']);
  assert.equal(model.edges.find((candidate) => candidate.id === 'ui->lib')!.data!.status, 'forbidden');

  assert.match(model.caption, /· 1 forbidden · 1 dependency cycle\. Draw an edge/);
});

test('cycle edges carry a label and a line pattern, not colour alone', () => {
  assert.equal(edgeLabel({ status: 'declared', count: 4, cycle: true }), 'cycle · 4');
  assert.equal(edgeLabel({ status: 'declared', cycle: true }), 'cycle');
  assert.equal(edgeLabel({ status: 'undeclared', count: 2, cycle: true }), 'undeclared · 2 · cycle');
  assert.equal(edgeLabel({ status: 'declared', count: 4 }), '4');
  assert.equal(
    edgeDescription({ from: 'api', to: 'apps', fromName: 'Api', toName: 'Apps', status: 'declared', count: 1, cycle: true }),
    'Api to Apps: declared dependency, 1 import, part of a dependency cycle',
  );
  assert.equal(edgeStyle({ status: 'declared', cycle: true }), CYCLE_EDGE_STYLE);
  assert.equal(edgeStyle({ status: 'forbidden', cycle: true }).stroke, 'var(--status-bad)', 'a forbidden edge stays red');
  assert.ok(CYCLE_EDGE_STYLE.dash, 'the cycle line is dashed');
  assert.equal(CYCLE_EDGE_STYLE.stroke, 'var(--status-warn)');

  render(<CanvasLegend />);
  const legend = screen.getByRole('list', { name: 'Legend' });
  assert.ok(within(legend).getByText(/Part of a dependency cycle/));
});

test('a card badge says when a finding is an error, in shape and words as well as colour', () => {
  const component = blueprint.components.find((candidate) => candidate.id === 'ui')!;
  const props = {
    id: 'ui', type: 'blueprint', selected: false, dragging: false, zIndex: 0, isConnectable: true, xPos: 0, yPos: 0,
    data: { component, fileCount: 1, findings: 2, findingSeverity: 'error', emphasis: 'normal' },
  } as NodeProps<BlueprintNodeData>;
  render(<ReactFlowProvider><BlueprintNode {...props} /></ReactFlowProvider>);
  const badge = within(screen.getByTestId('blueprint-node-ui')).getByLabelText('2 findings, including errors');
  assert.equal(badge.getAttribute('data-severity'), 'error');
  assert.ok(badge.className.includes('text-bad'));
  assert.equal(findingsLabel(1, 'error'), '1 finding, an error');
  assert.equal(findingsLabel(3, 'warning'), '3 findings');
});

test('the outline states the cycle once and marks its edges', () => {
  render(<CanvasOutline session={session} selectedId={null} onSelect={vi.fn()} onOpenEdge={vi.fn()} onClose={vi.fn()} />);
  const outline = screen.getByRole('navigation', { name: 'Outline' });
  assert.ok(within(outline).getByText(/1 dependency cycle/));
  const cycles = within(outline).getByRole('list', { name: 'Dependency cycles' });
  assert.equal(cycles.textContent, 'Dependency cycle: Api → Apps → Api');
  const fromApi = within(outline).getByRole('list', { name: 'Api depends on' });
  assert.ok(within(fromApi).getByText('cycle'));
  // ui and lib share the forbidden ui → lib import; api and apps, members of the cycle, have no finding.
  assert.equal(within(outline).getAllByText('1 finding, an error').length, 2);
  assert.equal(within(outline).queryAllByText(/finding/).length, 2);
});
