// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, test, vi } from 'vitest';
import { axe } from 'vitest-axe';

import BlueprintPanel, { type BlueprintPanelProps } from './BlueprintPanel';
import { ATTENTION_LIMIT, removeComponent } from './model';
import { Harness, LEAKY_COMMAND, makeBlueprint, makeSession, makeSpies, type SessionSpies } from './test-fixtures';
import type { BlueprintSession } from './session';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderPanel(options: {
  spies?: SessionSpies;
  overrides?: Partial<BlueprintSession>;
  initial?: ReturnType<typeof makeBlueprint> | null;
  props?: Partial<BlueprintPanelProps>;
} = {}) {
  const spies = options.spies ?? makeSpies();
  const view = render(
    <Harness spies={spies} overrides={options.overrides} initial={options.initial === undefined ? makeBlueprint() : options.initial}>
      {(session, ui) => <BlueprintPanel session={session} ui={ui} {...options.props} />}
    </Harness>,
  );
  return { spies, ...view };
}

test('attention shows the verdict, the human-authored share and only the top five findings', async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  const showOnCanvas = vi.fn();
  const reference = makeSession(makeBlueprint());
  const total = reference.report!.findings.length;
  assert.ok(total > ATTENTION_LIMIT, 'fixture must produce more findings than the attention list shows');

  const { container } = renderPanel({ props: { onNavigateToSource: navigate, onShowOnCanvas: showOnCanvas } });

  assert.equal(screen.getByTestId('verdict-chip').getAttribute('data-verdict'), 'fail');
  assert.equal(screen.getByTestId('blueprint-source').textContent, 'acme/shop@abcdef1');
  assert.ok(screen.getByText('Human-authored 27%'));
  assert.equal(screen.getByRole('meter').getAttribute('aria-valuenow'), '27');
  assert.ok(screen.getByText('Derived facts are guesses until a person confirms them.'));

  const top = container.querySelectorAll('ol[aria-label="Top findings"] > li');
  assert.equal(top.length, ATTENTION_LIMIT);
  assert.ok(screen.getByText(`top ${ATTENTION_LIMIT} of ${total}`));
  const first = top[0] as HTMLElement;
  assert.ok(within(first).getByText('Billing must not depend on UI'));
  assert.ok(within(first).getByText(/Billing must stay headless\./), 'the rule reason is quoted');

  await user.click(within(first).getByRole('button', { name: 'Open src/billing/charge.ts:2' }));
  assert.deepEqual(navigate.mock.calls[0][0], { path: 'src/billing/charge.ts', line: 2 });
  await user.click(within(first).getByRole('button', { name: /Show on canvas/ }));
  assert.deepEqual(showOnCanvas.mock.calls[0][0], ['billing', 'ui']);

  // Everything past the top five is collapsed into groups whose counts add up.
  const rest = screen.getByRole('region', { name: 'Remaining findings' });
  const groups = rest.querySelectorAll('details');
  assert.ok(groups.length > 0);
  assert.ok([...groups].every((group) => !group.open));
  const counted = [...groups].reduce((sum, group) => sum + Number(group.querySelector('summary span:last-child')!.textContent), 0);
  assert.equal(counted, total - ATTENTION_LIMIT);

  const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
  assert.equal(results.violations.length, 0, results.violations.map((item) => `${item.id}: ${item.nodes[0]?.html}`).join('\n'));
});

test('a ruling on an undeclared dependency is one click from the attention list', async () => {
  const user = userEvent.setup();
  const { spies, container } = renderPanel();
  const undeclared = [...container.querySelectorAll('ol[aria-label="Top findings"] > li')]
    .find((item) => item.textContent?.includes('Undeclared dependency: UI → Database')) as HTMLElement;
  await user.click(within(undeclared).getByRole('button', { name: 'Declare' }));
  const next = spies.update.mock.calls[0][0];
  assert.deepEqual(next.dependencies.at(-1), { from: 'ui', to: 'db', kind: 'imports', provenance: { source: 'human' } });
});

test('a derived draft says so and can be adopted', async () => {
  const user = userEvent.setup();
  const { spies } = renderPanel({ overrides: { origin: 'derived' } });
  const banner = screen.getByRole('note', { name: 'Derived draft' });
  assert.ok(within(banner).getByText('This is a draft derived from code. It becomes a contract when you confirm it.'));
  await user.click(within(banner).getByRole('button', { name: 'Adopt draft' }));
  assert.equal(spies.adoptDraft.mock.calls.length, 1);
});

test('no derived banner for a blueprint read from the repository', () => {
  renderPanel();
  assert.equal(screen.queryByRole('note', { name: 'Derived draft' }), null);
});

test('components without intent get a prominent call to write it', async () => {
  const user = userEvent.setup();
  const { spies } = renderPanel();
  await user.click(screen.getByRole('tab', { name: 'Components' }));

  const list = screen.getByRole('list', { name: 'Components' });
  // Billing and UI have intent; API, Database, Ghost and Stripe do not.
  assert.equal(within(list).getAllByRole('button', { name: /^Write intent for / }).length, 4);
  assert.ok(within(list).getByText('Charges customers.'), 'first line of intent is shown');
  assert.equal(within(list).queryByRole('button', { name: 'Write intent for Billing' }), null);
  const billingRow = within(list).getByRole('button', { name: 'Edit Billing' }).closest('li') as HTMLElement;
  assert.ok(within(billingRow).getByText('verified'));
  const apiRow = within(list).getByRole('button', { name: 'Edit API' }).closest('li') as HTMLElement;
  assert.ok(within(apiRow).getByText('derived'));
  assert.ok(within(apiRow).getByText(/1 file/));

  await user.click(within(list).getByRole('button', { name: 'Write intent for API' }));
  const intent = screen.getByRole('textbox', { name: /^Intent/ });
  assert.equal(document.activeElement, intent, 'the intent field takes focus');
  assert.ok(screen.getByText('matches 1 file'));

  await user.type(intent, 'Accepts HTTP requests.');
  await user.click(screen.getByRole('button', { name: 'Save component' }));
  const next = spies.update.mock.calls[0][0];
  assert.equal(next.components.find((component) => component.id === 'api')!.intent, 'Accepts HTTP requests.');
  assert.deepEqual(next.components.find((component) => component.id === 'api')!.provenance, { source: 'derived' });
});

test('the component editor previews glob matches and signs off with a remembered name', async () => {
  const user = userEvent.setup();
  const { spies } = renderPanel();
  await user.click(screen.getByRole('tab', { name: 'Components' }));
  await user.click(screen.getByRole('button', { name: 'Edit Database' }));

  const paths = screen.getByRole('textbox', { name: /Paths/ });
  await user.clear(paths);
  await user.type(paths, 'src/misc/**');
  assert.ok(screen.getByText(/matches 3 files \(preview, save to apply\)/));
  assert.ok(screen.getByText('Save your changes before signing off.'));
  await user.clear(paths);
  await user.type(paths, 'src/db/**');

  await user.click(screen.getByRole('button', { name: 'Verify (sign off)' }));
  await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Robin');
  await user.click(screen.getByRole('button', { name: 'Sign off' }));
  assert.deepEqual(spies.verify.mock.calls[0], ['db', 'Robin', undefined]);
  assert.equal(window.localStorage.getItem('rassam_blueprint_verifier'), 'Robin');

  await user.click(screen.getByRole('button', { name: 'Verify (sign off)' }));
  assert.equal((screen.getByRole('textbox', { name: 'Your name' }) as HTMLInputElement).value, 'Robin');
});

test('deleting a component removes every reference to it', () => {
  const blueprint = makeBlueprint();
  const next = removeComponent('billing')(blueprint);
  assert.ok(!next.components.some((component) => component.id === 'billing'));
  assert.deepEqual(next.dependencies, []);
  assert.deepEqual(next.rules.map((rule) => rule.id), ['no-loops'], 'a forbid rule with no "from" left is dropped');
  assert.deepEqual(next.invariants[0].components, []);
});

test('the rule form builds a forbid rule with component and free-text selectors', async () => {
  const user = userEvent.setup();
  const { spies } = renderPanel();
  await user.click(screen.getByRole('tab', { name: 'Rules' }));
  assert.ok(screen.getByText(/must not depend on/), 'rules are listed with their summary');
  assert.ok(screen.getByText(/No reason yet/), 'a rule without a reason asks for one');

  await user.click(screen.getByRole('button', { name: 'Add rule' }));
  const form = screen.getByRole('form', { name: 'New rule' });

  // Saving an empty rule explains what is missing instead of calling update.
  await user.click(within(form).getByRole('button', { name: 'Add rule' }));
  assert.ok(within(form).getByRole('alert'));
  assert.equal(spies.update.mock.calls.length, 0);

  const from = within(form).getByRole('group', { name: 'From' });
  await user.click(within(from).getByRole('checkbox', { name: 'API' }));
  const to = within(form).getByRole('group', { name: 'Must not depend on' });
  await user.click(within(to).getByRole('checkbox', { name: 'Database' }));
  const free = within(to).getByRole('textbox', { name: /Add tag:, path:, package:/ });
  await user.type(free, 'pg{Enter}');
  assert.ok(within(to).getByRole('alert'), 'a bare word is not a selector');
  await user.clear(free);
  await user.type(free, 'package:pg{Enter}');
  await user.type(free, '!path:src/db/generated/**{Enter}');
  await user.type(within(form).getByRole('textbox', { name: 'Why does this rule exist?' }), 'Only the data layer talks to Postgres.');
  await user.click(within(form).getByRole('button', { name: 'Add rule' }));

  assert.equal(spies.update.mock.calls.length, 1);
  const next = spies.update.mock.calls[0][0];
  assert.deepEqual(next.rules.at(-1), {
    id: 'forbid-api-db-package-pg',
    kind: 'forbid',
    from: 'api',
    to: ['db', 'package:pg', '!path:src/db/generated/**'],
    severity: 'error',
    reason: 'Only the data layer talks to Postgres.',
    provenance: { source: 'human' },
  });
  // Back on the list, the new rule is described in words.
  await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Edit rule forbid-api-db-package-pg' })));
});

test('the rule form covers layers, protect and secret-access', async () => {
  const user = userEvent.setup();
  const { spies } = renderPanel();
  await user.click(screen.getByRole('tab', { name: 'Rules' }));

  await user.click(screen.getByRole('button', { name: 'Add rule' }));
  let form = screen.getByRole('form', { name: 'New rule' });
  await user.selectOptions(within(form).getByRole('combobox', { name: 'Kind' }), 'layers');
  await user.click(within(within(form).getByRole('group', { name: 'Layer 1 (top)' })).getByRole('checkbox', { name: 'API' }));
  await user.click(within(within(form).getByRole('group', { name: 'Layer 2 (bottom)' })).getByRole('checkbox', { name: 'Database' }));
  await user.selectOptions(within(form).getByRole('combobox', { name: 'Severity' }), 'warning');
  await user.click(within(form).getByRole('button', { name: 'Add rule' }));
  assert.deepEqual(spies.update.mock.calls[0][0].rules.at(-1), {
    id: 'layers', kind: 'layers', layers: ['api', 'db'], severity: 'warning', provenance: { source: 'human' },
  });

  await user.click(screen.getByRole('button', { name: 'Add rule' }));
  form = screen.getByRole('form', { name: 'New rule' });
  await user.selectOptions(within(form).getByRole('combobox', { name: 'Kind' }), 'protect');
  await user.type(within(form).getByRole('textbox', { name: /Protected paths/ }), 'migrations/**');
  await user.click(within(form).getByRole('button', { name: 'Add rule' }));
  assert.deepEqual(spies.update.mock.calls[1][0].rules.at(-1), {
    id: 'protect-migrations', kind: 'protect', paths: ['migrations/**'], severity: 'error', provenance: { source: 'human' },
  });

  await user.click(screen.getByRole('button', { name: 'Add rule' }));
  form = screen.getByRole('form', { name: 'New rule' });
  await user.selectOptions(within(form).getByRole('combobox', { name: 'Kind' }), 'secret-access');
  await user.type(within(form).getByRole('textbox', { name: /Secrets/ }), 'STRIPE_*');
  await user.click(within(within(form).getByRole('group', { name: 'May be read by' })).getByRole('checkbox', { name: 'Billing' }));
  await user.click(within(form).getByRole('button', { name: 'Add rule' }));
  assert.deepEqual(spies.update.mock.calls[2][0].rules.at(-1), {
    id: 'secret-access-stripe', kind: 'secret-access', secrets: ['STRIPE_*'], allow: 'billing', severity: 'error', provenance: { source: 'human' },
  });
});

test('an error from the session is announced', () => {
  renderPanel({ overrides: { error: 'Change rejected: rules[2] references unknown component "nope"' } });
  assert.ok(within(screen.getByRole('complementary', { name: 'Blueprint' })).getByText(/Change rejected: rules\[2\]/).closest('[role="alert"]'));
});

test('invariants and decisions can be written down', async () => {
  const user = userEvent.setup();
  const { spies } = renderPanel();
  await user.click(screen.getByRole('tab', { name: 'Intent' }));
  assert.ok(screen.getByText('Charges are idempotent.'));

  await user.click(screen.getByRole('button', { name: 'Add invariant' }));
  let form = screen.getByRole('form', { name: 'New invariant' });
  await user.type(within(form).getByRole('textbox', { name: 'What must always be true?' }), 'Prices are never negative.');
  await user.click(within(form).getByRole('checkbox', { name: 'Billing' }));
  await user.type(within(form).getByRole('textbox', { name: /Check command/ }), 'npm test -- prices');
  await user.click(within(form).getByRole('button', { name: 'Add invariant' }));
  assert.deepEqual(spies.update.mock.calls[0][0].invariants.at(-1), {
    id: 'prices-are-never-negative',
    provenance: { source: 'human' },
    statement: 'Prices are never negative.',
    components: ['billing'],
    check: { run: 'npm test -- prices' },
  });

  await user.click(screen.getByRole('button', { name: 'Add decision' }));
  form = screen.getByRole('form', { name: 'New decision' });
  await user.type(within(form).getByRole('textbox', { name: 'Title' }), 'Use Postgres');
  await user.type(within(form).getByRole('textbox', { name: 'Decision' }), 'Postgres is the only store.');
  await user.click(within(form).getByRole('button', { name: 'Add decision' }));
  const decision = spies.update.mock.calls[1][0].decisions.at(-1)!;
  assert.equal(decision.id, 'use-postgres');
  assert.equal(decision.status, 'accepted');
  assert.equal(decision.decision, 'Postgres is the only store.');
  assert.deepEqual(decision.provenance, { source: 'human' });
});

test('reach shows names and redacted previews, never commands or values', async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  const { container } = renderPanel({ props: { onNavigateToSource: navigate } });
  await user.click(screen.getByRole('tab', { name: 'Reach' }));

  const secrets = screen.getByRole('region', { name: 'Inline secrets' });
  const previews = within(secrets).getAllByTestId('secret-preview');
  assert.deepEqual(previews.map((preview) => preview.textContent), ['ghp_…a1b2 (40 chars)']);
  await user.click(within(secrets).getByRole('button', { name: 'Open .mcp.json:7' }));
  assert.deepEqual(navigate.mock.calls[0][0], { path: '.mcp.json', line: 7 });

  const servers = screen.getByRole('region', { name: 'MCP servers' });
  assert.ok(within(servers).getByText('github'));
  assert.ok(within(servers).getByText('stdio'));
  assert.ok(within(servers).getByText('GITHUB_TOKEN'));
  assert.ok(within(servers).getByRole('button', { name: 'Open .mcp.json' }));

  const permissions = screen.getByRole('region', { name: 'Broad permissions' });
  assert.ok(within(permissions).getByText('Bash(*)'));
  assert.equal(within(permissions).queryByText('Read(src/**)'), null, 'narrow grants are not listed');

  const env = screen.getByRole('region', { name: 'Environment access' });
  const stripeRow = within(env).getByRole('rowheader', { name: /STRIPE_SECRET_KEY/ }).closest('tr') as HTMLElement;
  assert.ok(within(stripeRow).getByText('secret-like'));
  assert.ok(within(stripeRow).getByText('API'), 'readers are shown by component name');
  assert.ok(within(stripeRow).getByRole('button', { name: 'Open src/api/handler.ts' }));

  const text = container.textContent ?? '';
  assert.ok(!text.includes('SUPERSECRETVALUE123'));
  assert.ok(!text.includes(LEAKY_COMMAND));
  assert.ok(!container.innerHTML.includes('SUPERSECRETVALUE123'), 'not even in an attribute');
});

test('with a GitHub project open and no blueprint, loading uses a fresh source grant', async () => {
  const user = userEvent.setup();
  const refreshSourceGrant = vi.fn(async () => 'fresh-grant');
  const { spies } = renderPanel({
    initial: null,
    props: { githubProject: { owner: 'acme', repo: 'shop', commitSha: 'abcdef1234567890', sourceGrant: 'stale-grant', refreshSourceGrant } },
  });
  assert.equal(screen.queryByRole('tablist'), null);
  await user.click(screen.getByRole('button', { name: 'Load blueprint' }));
  await waitFor(() => assert.equal(spies.loadFromGitHub.mock.calls.length, 1));
  assert.deepEqual(spies.loadFromGitHub.mock.calls[0][0], {
    owner: 'acme', repo: 'shop', commitSha: 'abcdef1234567890', sourceGrant: 'fresh-grant',
  });

  await user.click(screen.getByRole('button', { name: 'Open local folder' }));
  assert.equal(spies.openLocalFolder.mock.calls.length, 1);
});

test('header actions follow the session: save only for local folders, undo and redo when possible', async () => {
  const user = userEvent.setup();
  const saveToDisk = vi.fn(async () => undefined);
  const undo = vi.fn();
  renderPanel({
    overrides: { source: { kind: 'local', name: 'shop' }, dirty: true, canSaveToDisk: true, canUndo: true, canRedo: false, saveToDisk, undo },
  });
  assert.equal(screen.getByTestId('blueprint-source').textContent, 'shop');
  assert.ok(screen.getByText('Unsaved'));
  await user.click(screen.getByRole('button', { name: 'Save to disk' }));
  assert.equal(saveToDisk.mock.calls.length, 1);
  await user.click(screen.getByRole('button', { name: 'Undo blueprint change' }));
  assert.equal(undo.mock.calls.length, 1);
  assert.ok((screen.getByRole('button', { name: 'Redo blueprint change' }) as HTMLButtonElement).disabled);
  assert.ok(screen.getByRole('button', { name: 'Download blueprint' }));
  assert.ok(screen.getByRole('button', { name: 'Copy blueprint JSON' }));
  assert.ok(screen.getByRole('button', { name: 'Rescan source files' }));
});
