// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider, type NodeProps } from 'reactflow';
import { afterEach, test, vi } from 'vitest';

import BlueprintCanvas from './BlueprintCanvas';
import { edgeDescription, edgeLabel } from './BlueprintEdge';
import BlueprintInspector from './BlueprintInspector';
import BlueprintNode, { type BlueprintNodeData } from './BlueprintNode';
import EdgePrompt, { type EdgePromptTarget } from './EdgePrompt';
import { Harness, makeBlueprint, makeSession, makeSpies } from './test-fixtures';
import { autoLayout, impactDepths, secretReads, useBlueprintCanvas } from './useBlueprintCanvas';
import type { BlueprintUi } from './useBlueprintUi';

afterEach(cleanup);

function renderPrompt(target: EdgePromptTarget) {
  const spies = makeSpies();
  const onClose = vi.fn();
  const onRevealPanel = vi.fn();
  const navigate = vi.fn();
  let ui!: BlueprintUi;
  render(
    <Harness spies={spies}>
      {(session, currentUi) => {
        ui = currentUi;
        return <EdgePrompt target={target} session={session} ui={currentUi} onClose={onClose} onRevealPanel={onRevealPanel} onNavigateToSource={navigate} />;
      }}
    </Harness>,
  );
  return { spies, onClose, onRevealPanel, navigate, ui: () => ui };
}

test('drawing an edge offers to declare it: adds a human dependency', async () => {
  const user = userEvent.setup();
  const { spies, onClose } = renderPrompt({ from: 'api', to: 'db', status: 'new' });
  const dialog = screen.getByRole('dialog', { name: 'Dependency from API to Database' });
  const declare = within(dialog).getByRole('button', { name: 'Declare dependency' });
  assert.equal(document.activeElement, declare, 'the recommended action has focus');

  await user.click(declare);
  const [next, label] = spies.update.mock.calls[0];
  assert.deepEqual(next.dependencies.at(-1), { from: 'api', to: 'db', kind: 'imports', provenance: { source: 'human' } });
  assert.equal(label, 'Declare API → Database');
  assert.equal(onClose.mock.calls.length, 1);
});

test('drawing an edge offers to forbid it: adds a forbid rule and asks for the reason', async () => {
  const user = userEvent.setup();
  const { spies, onRevealPanel, ui } = renderPrompt({ from: 'api', to: 'db', status: 'new' });
  await user.click(screen.getByRole('button', { name: 'Forbid dependency' }));

  const next = spies.update.mock.calls[0][0];
  assert.deepEqual(next.rules.at(-1), {
    id: 'forbid-api-db',
    kind: 'forbid',
    from: 'api',
    to: 'db',
    severity: 'error',
    reason: '',
    provenance: { source: 'human' },
  });
  assert.equal(ui().tab, 'rules');
  assert.equal(ui().editingRuleId, 'forbid-api-db');
  assert.ok(ui().ruleFocusToken > 0, 'the reason field is asked to take focus');
  assert.equal(onRevealPanel.mock.calls.length, 1);
});

test('an undeclared edge offers the same two rulings', () => {
  renderPrompt({ from: 'ui', to: 'db', status: 'undeclared', count: 1 });
  assert.ok(screen.getByText(/nobody declared it/));
  assert.ok(screen.getByText(/1 import observed/));
  assert.ok(screen.getByRole('button', { name: 'Declare dependency' }));
  assert.ok(screen.getByRole('button', { name: 'Forbid dependency' }));
});

test('a forbidden edge lists the violating imports as file:line links', async () => {
  const user = userEvent.setup();
  const { navigate, spies } = renderPrompt({ from: 'billing', to: 'ui', status: 'forbidden', count: 1 });
  const list = screen.getByRole('list', { name: 'Violating imports' });
  assert.ok(within(list).getByText('Billing must not depend on UI'));
  assert.ok(within(list).getByText(/Billing must stay headless\./));
  await user.click(within(list).getAllByRole('button', { name: 'Open src/billing/charge.ts:2' })[0]);
  assert.deepEqual(navigate.mock.calls[0][0], { path: 'src/billing/charge.ts', line: 2 });
  assert.equal(screen.queryByRole('button', { name: 'Declare dependency' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Forbid dependency' }), null);
  assert.equal(spies.update.mock.calls.length, 0);
});

test('a declared edge can be withdrawn', async () => {
  const user = userEvent.setup();
  const { spies } = renderPrompt({ from: 'billing', to: 'stripe', status: 'missing' });
  assert.ok(screen.getByText(/no code uses it/));
  await user.click(screen.getByRole('button', { name: 'Remove declaration' }));
  const next = spies.update.mock.calls[0][0];
  assert.ok(!next.dependencies.some((dependency) => dependency.from === 'billing' && dependency.to === 'stripe'));
});

function renderNode(data: Partial<BlueprintNodeData> & Pick<BlueprintNodeData, 'component'>) {
  const props = {
    id: data.component.id,
    type: 'blueprint',
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    data: { fileCount: 0, findings: 0, emphasis: 'normal', ...data },
  } as NodeProps<BlueprintNodeData>;
  return render(<ReactFlowProvider><BlueprintNode {...props} /></ReactFlowProvider>);
}

test('a node shows intent, verification, assurance and findings', () => {
  const blueprint = makeBlueprint();
  const billing = blueprint.components.find((component) => component.id === 'billing')!;
  renderNode({ component: billing, fileCount: 1, findings: 2 });
  const node = screen.getByTestId('blueprint-node-billing');
  assert.ok(within(node).getByText('Billing'));
  assert.ok(within(node).getByText('Charges customers.'), 'only the first line of intent');
  assert.equal(within(node).queryByText(/Never renders UI/), null);
  assert.ok(within(node).getByText('verified'));
  assert.equal(within(node).queryByText('derived'), null, 'a verified fact is no longer shown as derived');
  assert.ok(within(node).getByText('tested'));
  assert.ok(within(node).getByLabelText('2 findings'));
  assert.ok(within(node).getByText(/service · 1 file$/));
});

test('a derived node without intent says so; an external node is drawn dashed', () => {
  const blueprint = makeBlueprint();
  renderNode({ component: blueprint.components.find((component) => component.id === 'api')!, fileCount: 1, secrets: ['STRIPE_SECRET_KEY'] });
  const api = screen.getByTestId('blueprint-node-api');
  assert.ok(within(api).getByText('No intent yet'));
  assert.ok(within(api).getByText('derived'));
  assert.equal(within(api).queryByLabelText(/finding/), null);
  assert.ok(within(api).getByLabelText('Reads secrets: STRIPE_SECRET_KEY'));
  assert.equal(api.getAttribute('data-external'), 'false');
  cleanup();

  renderNode({ component: blueprint.components.find((component) => component.id === 'stripe')! });
  const stripe = screen.getByTestId('blueprint-node-stripe');
  assert.equal(stripe.getAttribute('data-external'), 'true');
  assert.ok(stripe.className.includes('border-dashed'));
  assert.ok(within(stripe).getByText(/external-api · external/));
});

test('edge status is carried by text, not colour alone', () => {
  assert.equal(edgeLabel({ status: 'undeclared', count: 3 }), 'undeclared · 3');
  assert.equal(edgeLabel({ status: 'forbidden', count: 1 }), 'forbidden · 1');
  assert.equal(edgeLabel({ status: 'missing' }), 'not observed');
  assert.equal(edgeLabel({ status: 'declared', count: 4 }), '4');
  assert.equal(
    edgeDescription({ from: 'billing', to: 'ui', fromName: 'Billing', toName: 'UI', status: 'forbidden', count: 2 }),
    'Billing to UI: forbidden dependency, 2 imports',
  );
});

test('the canvas model answers the three questions', () => {
  const session = makeSession(makeBlueprint(), { layout: { api: { x: 500, y: 40 } } });
  const view = session.workspace!.graphView();

  const positions = autoLayout(view);
  assert.deepEqual(Object.keys(positions).sort(), ['api', 'billing', 'db', 'ghost', 'stripe', 'ui']);
  assert.ok(positions.billing.y < positions.db.y, 'dependencies flow top to bottom');

  // db is used by billing and ui directly, and by api through them.
  const depths = impactDepths(session.workspace!, view, 'db');
  assert.deepEqual([...depths.entries()].sort(), [['api', 2], ['billing', 1], ['ui', 1]]);
  assert.deepEqual([...secretReads(session.workspace!).entries()], [['api', ['STRIPE_SECRET_KEY']], ['db', ['DATABASE_URL']]]);

  const base = { session, spotlightIds: [], dragPositions: {} };
  const dependencies = renderHook(() => useBlueprintCanvas({ ...base, question: 'dependencies', selectedId: null })).result.current;
  assert.deepEqual(dependencies.nodes.find((node) => node.id === 'api')!.position, { x: 500, y: 40 }, 'saved positions win');
  assert.deepEqual(
    dependencies.edges.map((edge) => `${edge.id}:${edge.data!.status}`).sort(),
    ['api->billing:undeclared', 'api->ui:undeclared', 'billing->db:declared', 'billing->stripe:missing', 'billing->ui:forbidden', 'ui->db:undeclared'],
  );
  assert.ok(dependencies.nodes.every((node) => node.data.emphasis === 'normal'));
  assert.equal(dependencies.nodes.find((node) => node.id === 'billing')!.data.findings, 1);

  const impact = renderHook(() => useBlueprintCanvas({ ...base, question: 'impact', selectedId: 'db' })).result.current;
  const emphasis = Object.fromEntries(impact.nodes.map((node) => [node.id, node.data.emphasis]));
  assert.deepEqual(emphasis, { api: 'highlight', billing: 'highlight', db: 'origin', ui: 'highlight', ghost: 'dim', stripe: 'dim' });
  assert.equal(impact.nodes.find((node) => node.id === 'api')!.data.note, '2 steps away');
  assert.equal(impact.edges.find((edge) => edge.id === 'billing->stripe')!.data!.dim, true);
  assert.match(impact.caption, /3 components depend on this/);

  const reach = renderHook(() => useBlueprintCanvas({ ...base, question: 'reach', selectedId: null })).result.current;
  assert.deepEqual(reach.nodes.filter((node) => node.data.emphasis === 'highlight').map((node) => node.id), ['api', 'db']);
  assert.deepEqual(reach.nodes.find((node) => node.id === 'api')!.data.secrets, ['STRIPE_SECRET_KEY']);
});

test('the inspector summarises a component and makes writing intent the main action', async () => {
  const user = userEvent.setup();
  const session = makeSession(makeBlueprint());
  const onSaveIntent = vi.fn();
  const onOpenEdge = vi.fn();
  render(
    <BlueprintInspector
      componentId="api"
      session={session}
      edgeStatus={() => null}
      onSelectComponent={() => undefined}
      onOpenEdge={onOpenEdge}
      onSaveIntent={onSaveIntent}
      onClose={() => undefined}
    />,
  );
  const panel = screen.getByRole('complementary', { name: 'API details' });
  // Writing intent happens in place: the main action opens the field, saving reports the text.
  await user.click(within(panel).getByRole('button', { name: 'Write intent' }));
  await user.type(within(panel).getByRole('textbox', { name: 'Intent of API' }), 'Handles requests.');
  await user.click(within(panel).getByRole('button', { name: 'Save intent' }));
  assert.deepEqual(onSaveIntent.mock.calls, [['Handles requests.']]);

  const dependsOn = within(panel).getByRole('region', { name: 'Depends on' });
  await user.click(within(dependsOn).getByRole('button', { name: /API to Billing: undeclared/ }));
  assert.deepEqual(onOpenEdge.mock.calls[0], ['api', 'billing']);
  assert.ok(within(panel).getByText('STRIPE_SECRET_KEY'));
  assert.ok(within(panel).getAllByText('src/api/handler.ts', { selector: 'code' }).length > 0, 'files are named even when they cannot be opened');
});

test('without a blueprint the canvas draws nothing and leaves map shortcuts alone', () => {
  // How to open a source is the start screen's job (see studio/Studio.test.tsx).
  const spies = makeSpies();
  const { container } = render(
    <Harness spies={spies} initial={null}>
      {(session, ui) => <BlueprintCanvas session={session} ui={ui} />}
    </Harness>,
  );
  assert.equal(container.querySelector('[data-canvas-shortcuts="on"]'), null);
  assert.equal(screen.queryByRole('heading'), null);
});

test('an empty blueprint says what to do first, with map shortcuts off', () => {
  const spies = makeSpies();
  const empty = makeBlueprint({ version: '0.1', system: { name: 'Empty' }, components: [], dependencies: [], rules: [], invariants: [], decisions: [] });
  const { container } = render(
    <Harness spies={spies} initial={empty}>
      {(session, ui) => <BlueprintCanvas session={session} ui={ui} />}
    </Harness>,
  );
  assert.ok(screen.getByRole('heading', { name: 'This blueprint has no components yet' }));
  assert.equal(container.querySelector('[data-canvas-shortcuts="on"]'), null);
  assert.ok(container.querySelector('[data-canvas-shortcuts="off"]'));
});

test('a ruling drawn on the Studio canvas is staged as a proposal instead of applied', async () => {
  const user = userEvent.setup();
  const spies = makeSpies();
  const onPropose = vi.fn();
  const onClose = vi.fn();
  render(
    <Harness spies={spies}>
      {(session, ui) => <EdgePrompt target={{ from: 'api', to: 'db', status: 'new' }} session={session} ui={ui} onClose={onClose} onPropose={onPropose} />}
    </Harness>,
  );
  await user.click(screen.getByRole('button', { name: 'Declare dependency' }));
  assert.deepEqual(onPropose.mock.calls[0], [[{ op: 'declare_dependency', from: 'api', to: 'db' }], 'Declare API → Database']);
  await user.click(screen.getByRole('button', { name: 'Forbid dependency' }));
  assert.deepEqual(onPropose.mock.calls[1], [[{ op: 'forbid_dependency', from: 'api', to: 'db' }], 'Forbid API → Database']);
  assert.equal(spies.update.mock.calls.length, 0, 'nothing is applied until the preview is accepted');
  assert.equal(onClose.mock.calls.length, 2);
});
