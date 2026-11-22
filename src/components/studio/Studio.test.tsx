// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { createWorkspace, type SystemStatus } from '@/blueprint';
import BlueprintInspector from '@/components/blueprint/BlueprintInspector';
import type { BlueprintSession } from '@/components/blueprint/session';
import { FILES, Harness, IDLE_LIVE, makeBlueprint, makeProposal, makeSession, makeSpies } from '@/components/blueprint/test-fixtures';

import AttentionSheet from './AttentionSheet';
import { buildCommands, filterCommands, type CommandContext } from './commands';
import { describeHealth } from './health';
import HealthPill from './HealthPill';
import IntentBar from './IntentBar';
import { deltaCounts, describeFindingsChange, findingsChange, touchedComponents } from './proposal';
import ProposalCard from './ProposalCard';
import { SAMPLE_NAME } from './sample';
import SourcePill from './SourcePill';
import SourceSheet from './SourceSheet';
import StartScreen from './StartScreen';
import { normalizeRepositoryUrl, useSourceActions } from './useSourceActions';

vi.mock('@/lib/blueprint-client/local-folder', async (original) => ({
  ...(await original<typeof import('@/lib/blueprint-client/local-folder')>()),
  isLocalFolderSupported: () => true,
  recallLocalFolder: async () => ({ kind: 'directory', name: 'my-repo', values: () => [] }),
}));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const noCommands: CommandContext = {
  watching: false, canUndo: true, canRedo: false, canSave: false, theme: 'dark',
  openSettings: vi.fn(), openClassicMap: vi.fn(), toggleWatch: vi.fn(), fitView: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  save: vi.fn(), switchTheme: vi.fn(), openAttention: vi.fn(), openSource: vi.fn(), toggleOutline: vi.fn(), openManual: vi.fn(),
};

function renderBar(options: { selection?: string[]; commands?: CommandContext; overrides?: Partial<BlueprintSession> } = {}) {
  const spies = makeSpies();
  const onRemoveScope = vi.fn();
  let latest!: BlueprintSession;
  render(
    <Harness spies={spies} overrides={options.overrides}>
      {(session) => {
        latest = session;
        return <IntentBar session={session} selection={options.selection ?? []} onRemoveScope={onRemoveScope} commands={buildCommands(options.commands ?? noCommands)} />;
      }}
    </Harness>,
  );
  const input = screen.getByRole('combobox', { name: 'Tell Rassam what to change' });
  return { spies, input, onRemoveScope, session: () => latest };
}

// ── Intent bar ────────────────────────────────────────────────

test('idle and focused, the intent bar offers suggestions for this blueprint', async () => {
  const user = userEvent.setup();
  const { input, spies } = renderBar();
  assert.equal(input.getAttribute('placeholder'), 'Tell Rassam what to change…');
  assert.ok(screen.queryByRole('listbox') === null, 'nothing is shown until the bar has focus');

  await user.click(input);
  const list = screen.getByRole('listbox', { name: 'Suggestions' });
  const options = within(list).getAllByRole('option');
  assert.ok(options.length > 0 && options.length <= 5);
  assert.ok(within(list).getByRole('option', { name: 'declare api -> billing' }));

  // Arrow keys move through the suggestions; Enter sends the active one.
  await user.keyboard('{ArrowDown}{Enter}');
  assert.equal(spies.proposeIntent.mock.calls[0][0], options[0].textContent);
  await screen.findByRole('region', { name: 'Proposed changes' });
});

test('an instruction is sent with the canvas selection as its scope, and acknowledged while it is worked out', async () => {
  const user = userEvent.setup();
  const proposeIntent = vi.fn(async () => undefined);
  const { input, onRemoveScope } = renderBar({
    selection: ['ui', 'db'],
    overrides: { proposeIntent, intent: { status: 'thinking', instruction: 'forbid ui from importing db' } },
  });
  const scope = screen.getByRole('list', { name: 'Scope' });
  assert.deepEqual(within(scope).getAllByRole('listitem').map((item) => item.textContent), ['UI', 'Database']);
  await user.click(within(scope).getByRole('button', { name: 'Remove UI from scope' }));
  assert.deepEqual(onRemoveScope.mock.calls[0], ['ui']);

  assert.match(screen.getByTestId('intent-thinking').textContent ?? '', /Working out what “forbid ui from importing db” changes across 6 components/);

  await user.type(input, 'no cycles{Enter}');
  assert.deepEqual(proposeIntent.mock.calls[0], ['no cycles', { selection: ['ui', 'db'] }]);
  assert.equal((input as HTMLInputElement).value, '');
});

test('a proposal is applied with Enter and leaves a receipt whose Undo restores the draft', async () => {
  const user = userEvent.setup();
  const { input, spies, session } = renderBar();
  const before = session().blueprint!;

  await user.type(input, 'forbid ui from importing db{Enter}');
  const card = await screen.findByRole('region', { name: 'Proposed changes' });
  assert.ok(within(card).getByText(/Forbade "UI" from depending on "Database"/));
  assert.match(within(card).getByTestId('findings-change').textContent ?? '', /Introduces 1 finding/);
  assert.equal(session().blueprint, before, 'nothing is applied while the proposal is staged');
  assert.ok(document.activeElement === input, 'the keyboard answers the proposal');

  await user.keyboard('{Enter}');
  assert.equal(spies.applyProposal.mock.calls.length, 1);
  assert.ok(session().blueprint!.rules.some((rule) => rule.kind === 'forbid' && rule.from === 'ui' && rule.to === 'db'));
  assert.ok(screen.queryByRole('region', { name: 'Proposed changes' }) === null);

  const receipt = screen.getByTestId('receipt');
  assert.match(receipt.textContent ?? '', /Forbade "UI" from depending on "Database"/);
  await user.click(within(receipt).getByRole('button', { name: 'Undo' }));
  assert.deepEqual(session().blueprint, before);
  assert.match(screen.getByTestId('receipt').textContent ?? '', /Undone/);
  await user.click(within(screen.getByTestId('receipt')).getByRole('button', { name: 'Redo' }));
  assert.ok(session().blueprint!.rules.some((rule) => rule.kind === 'forbid' && rule.from === 'ui' && rule.to === 'db'));
});

test('Escape discards a staged proposal and changes nothing', async () => {
  const user = userEvent.setup();
  const { input, spies, session } = renderBar();
  const before = session().blueprint!;
  await user.type(input, 'declare api -> billing{Enter}');
  await screen.findByRole('region', { name: 'Proposed changes' });
  await user.keyboard('{Escape}');
  assert.ok(screen.queryByRole('region', { name: 'Proposed changes' }) === null);
  assert.equal(spies.applyProposal.mock.calls.length, 0);
  assert.equal(session().blueprint, before);
  assert.ok(screen.queryByTestId('receipt') === null);
});

test('a change that loosens the contract is never applied by Enter: it takes the explicit button', async () => {
  const user = userEvent.setup();
  const { input, spies, session } = renderBar();
  await user.type(input, 'remove rule billing-headless{Enter}');
  const card = await screen.findByRole('region', { name: 'Proposed changes' });
  assert.ok(within(card).getByText('Loosens the contract'));
  assert.match(within(card).getByRole('note').textContent ?? '', /human-approved label/);
  assert.ok(within(card).queryByTestId('confirm-weaken') === null);

  await user.keyboard('{Enter}');
  assert.equal(spies.applyProposal.mock.calls.length, 0, 'the first Enter only asks for confirmation');
  const confirm = within(card).getByTestId('confirm-weaken');
  assert.equal(confirm.textContent, 'Loosen the contract');
  await user.keyboard('{Enter}');
  assert.equal(spies.applyProposal.mock.calls.length, 0, 'Enter is not a default for loosening the contract');
  assert.ok(session().blueprint!.rules.some((rule) => rule.id === 'billing-headless'));

  await user.click(confirm);
  assert.equal(spies.applyProposal.mock.calls.length, 1);
  assert.equal(session().blueprint!.rules.some((rule) => rule.id === 'billing-headless'), false);
  assert.ok(screen.getByTestId('receipt'));
});

test('an ambiguous instruction asks which reading was meant', async () => {
  const user = userEvent.setup();
  const proposal = makeProposal(makeBlueprint(), [{ op: 'declare_dependency', from: 'api', to: 'db' }], 'declare api -> d');
  const chooseIntentOption = vi.fn();
  renderBar({
    overrides: {
      chooseIntentOption,
      intent: {
        status: 'ambiguous',
        instruction: 'declare api -> d',
        message: '"d" could mean "Database" or "Domain". Which one did you mean?',
        options: [{ label: 'Declare API → Database.', edits: proposal.edits }, { label: 'Declare API → Domain.', edits: proposal.edits }],
      },
    },
  });
  const panel = screen.getByTestId('intent-ambiguous');
  assert.ok(within(panel).getByText(/Which one did you mean/));
  await user.click(within(panel).getByRole('option', { name: 'Declare API → Domain.' }));
  assert.deepEqual(chooseIntentOption.mock.calls[0], [1]);
});

test('an instruction that is not understood says so and offers examples that fill the box', async () => {
  const user = userEvent.setup();
  const { input, spies } = renderBar();
  await user.type(input, 'make it better{Enter}');
  const panel = await screen.findByTestId('intent-unknown');
  const examples = within(panel).getAllByRole('option');
  assert.ok(examples.length > 0);
  await user.click(examples[0]);
  assert.equal((input as HTMLInputElement).value, examples[0].textContent);
  assert.equal(spies.proposeIntent.mock.calls.length, 1, 'an example is put in the box, not sent');
});

test('an error is announced and can be dismissed', async () => {
  const user = userEvent.setup();
  const discardProposal = vi.fn();
  renderBar({ overrides: { discardProposal, intent: { status: 'error', instruction: 'x', message: 'The model could not be reached.' } } });
  assert.match(screen.getByRole('alert').textContent ?? '', /The model could not be reached./);
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  assert.equal(discardProposal.mock.calls.length, 1);
});

test('typing ">" turns the bar into a command palette', async () => {
  const user = userEvent.setup();
  const context = { ...noCommands, openSettings: vi.fn(), redo: vi.fn(), switchTheme: vi.fn() };
  const { input, spies } = renderBar({ commands: context });
  await user.type(input, '>');
  const list = screen.getByRole('listbox', { name: 'Commands' });
  for (const name of ['Open settings', 'Open classic map', 'Watch for new commits', 'Fit view', 'Undo', 'Redo', 'Download blueprint.json', 'Switch to light theme']) {
    assert.ok(within(list).getByRole('option', { name: new RegExp(`^${name}`) }), name);
  }
  assert.equal(within(list).getByRole('option', { name: /^Redo/ }).getAttribute('aria-disabled'), 'true');

  await user.type(input, 'settings{Enter}');
  assert.equal(context.openSettings.mock.calls.length, 1);
  assert.equal(spies.proposeIntent.mock.calls.length, 0, 'a command is never sent as an instruction');
  assert.equal((input as HTMLInputElement).value, '');

  assert.deepEqual(filterCommands(buildCommands(noCommands), 'theme').map((command) => command.id), ['theme']);
  assert.deepEqual(filterCommands(buildCommands(noCommands), 'nothing matches this'), []);
});

// ── Proposal helpers ──────────────────────────────────────────

test('the review card says what a proposal does to the check', () => {
  const blueprint = makeBlueprint();
  const session = makeSession(blueprint);
  const declare = makeProposal(blueprint, [{ op: 'declare_dependency', from: 'api', to: 'billing' }]);
  const fixed = findingsChange(session.report, declare.previewReport);
  assert.deepEqual({ fixes: fixed?.fixes, introduces: fixed?.introduces }, { fixes: 1, introduces: 0 });
  assert.equal(describeFindingsChange(fixed), 'Fixes 1 finding.');
  assert.equal(describeFindingsChange(null), 'The preview could not be checked.');
  assert.equal(describeFindingsChange({ fixes: 0, introduces: 0, remaining: 3 }), 'No change to the findings.');
  assert.equal(describeFindingsChange({ fixes: 2, introduces: 1, remaining: 3 }), 'Fixes 2, introduces 1 findings.');
  assert.deepEqual(deltaCounts(declare), { added: 1, changed: 0, removed: 0 });

  const removal = makeProposal(blueprint, [{ op: 'remove_rule', id: 'billing-headless' }]);
  assert.equal(removal.weakens, true);
  assert.deepEqual(deltaCounts(removal), { added: 0, changed: 0, removed: 1 });
  assert.deepEqual(touchedComponents(removal, blueprint).sort(), ['billing', 'ui'], 'a removed rule still points at its components');

  const onApply = vi.fn();
  render(<ProposalCard proposal={declare} report={session.report} confirming={false} onApply={onApply} onConfirmWeakening={vi.fn()} onDiscard={vi.fn()} />);
  const card = screen.getByRole('region', { name: 'Proposed changes' });
  assert.ok(within(card).getByLabelText('1 added, 0 changed, 0 removed'));
  assert.equal(within(card).getByRole('list', { name: 'Changes' }).children.length, 1);
  assert.ok(within(card).queryByRole('note') === null, 'no loosening note for a change that tightens');
});

// ── Health pill ───────────────────────────────────────────────

function withRuntime() {
  const input = structuredClone(makeBlueprint());
  for (const id of ['api', 'billing']) {
    input.components.find((component) => component.id === id)!.runtime = { health: { url: `https://example.test/${id}` } };
  }
  return makeBlueprint(input);
}

function statusOf(states: Record<string, 'up' | 'degraded' | 'down'>, checkedAt = '2026-11-22T10:00:00.000Z'): SystemStatus {
  return {
    version: 1,
    checkedAt,
    components: Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { state, source: 'health-check' as const }])),
  };
}

test('one indicator combines the contract verdict and the runtime status, by glyph and label', () => {
  const now = Date.parse('2026-11-22T10:05:00.000Z');
  const failing = makeSession(withRuntime());
  const clean = structuredClone(withRuntime());
  clean.rules = [];
  clean.policy.undeclaredDependencies = 'off';
  clean.policy.unmappedFiles = 'off';
  clean.components = clean.components.filter((component) => component.id !== 'ghost');
  delete clean.components.find((component) => component.id === 'billing')!.assurance;
  const passingBlueprint = makeBlueprint(clean);
  // No agent configuration in this one: the fixture's committed credential is a finding of its own.
  const passing = { blueprint: passingBlueprint, report: createWorkspace(FILES, passingBlueprint).check() };
  assert.deepEqual(passing.report!.findings.filter((finding) => finding.severity !== 'info').map((finding) => finding.title), []);

  const onTrack = describeHealth({ blueprint: passing.blueprint, report: passing.report, status: statusOf({ api: 'up', billing: 'up' }), now });
  assert.deepEqual([onTrack.tone, onTrack.label, onTrack.detail], ['ok', 'On track', null]);

  const rulings = failing.report!.summary.errors + failing.report!.summary.warnings;
  const needsRuling = describeHealth({ blueprint: failing.blueprint, report: failing.report, status: null, now });
  assert.deepEqual([needsRuling.tone, needsRuling.label], ['bad', `${rulings} need a ruling`]);

  const outage = describeHealth({ blueprint: failing.blueprint, report: failing.report, status: statusOf({ api: 'down', billing: 'up' }), now });
  assert.deepEqual([outage.tone, outage.label, outage.detail], ['bad', 'Outage: API down', `${rulings} need a ruling`]);

  const degraded = describeHealth({ blueprint: passing.blueprint, report: passing.report, status: statusOf({ api: 'up', billing: 'degraded' }), now });
  assert.deepEqual([degraded.tone, degraded.label], ['warn', 'Degraded: Billing']);

  const stale = describeHealth({ blueprint: passing.blueprint, report: passing.report, status: statusOf({ api: 'up', billing: 'up' }, '2026-11-22T08:00:00.000Z'), now });
  assert.deepEqual([stale.tone, stale.stale, stale.detail], ['ok', true, 'Runtime status is stale']);

  const unknown = describeHealth({ blueprint: null, report: null, status: null, now });
  assert.deepEqual([unknown.tone, unknown.label], ['unknown', 'Not checked yet']);

  const onOpen = vi.fn();
  render(<HealthPill health={{ ...outage, humanPercent: 62 }} onOpen={onOpen} />);
  const pill = screen.getByTestId('health-pill');
  assert.equal(pill.getAttribute('data-tone'), 'bad');
  assert.ok(within(pill).getByText('Outage: API down'), 'the label is text, not colour');
  assert.ok(pill.querySelector('[data-status="bad"] svg'), 'and it carries a glyph');
  assert.ok(within(pill).getByText('62% human'));
  assert.match(pill.getAttribute('aria-label') ?? '', /Health: Outage: API down\. .*need a ruling\. 62% human-authored/);
});

test('the attention sheet ranks findings, stages rulings as proposals and never shows MCP commands', async () => {
  const user = userEvent.setup();
  const spies = makeSpies();
  const onPropose = vi.fn();
  const onOpenChange = vi.fn();
  const blueprint = withRuntime();
  const status = statusOf({ api: 'down' }, '2020-01-01T00:00:00.000Z');
  render(
    <Harness spies={spies} initial={blueprint} overrides={{ systemStatus: status }}>
      {(session, ui) => (
        <AttentionSheet
          open
          onOpenChange={onOpenChange}
          session={session}
          ui={ui}
          health={describeHealth({ blueprint: session.blueprint, report: session.report, status })}
          onShowOnCanvas={vi.fn()}
          onPropose={onPropose}
        />
      )}
    </Harness>,
  );
  const sheet = screen.getByRole('dialog', { name: 'Attention' });
  assert.equal(within(within(sheet).getByRole('list', { name: 'Top findings' })).getAllByRole('listitem').filter((item) => item.parentElement?.getAttribute('aria-label') === 'Top findings').length, 5);

  await user.click(within(sheet).getAllByRole('button', { name: 'Forbid' })[0]);
  assert.equal(spies.update.mock.calls.length, 0, 'a ruling is previewed first, never applied directly');
  assert.equal(onPropose.mock.calls[0][0][0].op, 'forbid_dependency');
  assert.deepEqual(onOpenChange.mock.calls[0], [false], 'the sheet steps aside so the preview is visible');

  const runtime = within(sheet).getByRole('list', { name: 'Runtime status' });
  assert.ok(within(runtime).getByText('Down'));
  assert.ok(within(runtime).getByText('Status unknown'), 'a monitored component without an entry is unknown, not healthy');
  assert.ok(within(sheet).getByText('stale'));
  assert.ok(within(sheet).getByText(/as of/));

  assert.ok(within(sheet).getByRole('region', { name: 'MCP servers' }));
  assert.ok(within(sheet).getByTestId('secret-preview'));
  assert.equal(sheet.textContent?.includes('SUPERSECRETVALUE123'), false);
  assert.equal(sheet.textContent?.includes('npx server'), false);
});

// ── Source pill and sheet ─────────────────────────────────────

test('the source pill names the system, the source and the commit, and marks a newer commit', () => {
  const session = makeSession(makeBlueprint(), {
    live: { ...IDLE_LIVE, behind: true, current: { sha: 'abcdef1234567890' }, latest: { sha: 'fedcba9876543210', message: 'Add payouts' } },
  });
  render(<SourcePill session={session} onOpen={vi.fn()} />);
  const pill = screen.getByTestId('source-pill');
  assert.ok(within(pill).getByText('Shop'));
  assert.ok(within(pill).getByText('acme/shop'));
  assert.equal(within(pill).getByTestId('source-commit').textContent, 'abcdef1');
  assert.ok(within(pill).getByTestId('source-dot'));
  assert.match(pill.getAttribute('aria-label') ?? '', /A newer commit is available/);
});

function SourceHarness({ session }: { session: BlueprintSession }) {
  const actions = useSourceActions(session);
  return <SourceSheet open onOpenChange={() => undefined} session={session} actions={actions} />;
}

test('the source sheet offers Sync when behind, toggles watching and lists the commits seen', async () => {
  const user = userEvent.setup();
  const syncToLatest = vi.fn(async () => undefined);
  const setWatching = vi.fn();
  const diff = makeProposal(makeBlueprint(), [{ op: 'declare_dependency', from: 'api', to: 'billing' }]).graphDiff!;
  const session = makeSession(makeBlueprint(), {
    syncToLatest,
    setWatching,
    live: {
      watching: false,
      checking: false,
      behind: true,
      current: { sha: 'abcdef1234567890' },
      latest: { sha: 'fedcba9876543210', message: 'Add payouts\n\nBody' },
      lastChange: { fromSha: '1111111', toSha: 'abcdef1234567890', diff, at: '2026-11-22T10:00:00.000Z' },
      history: [{ sha: 'abcdef1234567890', message: 'Tighten billing', summary: '1 dependency became declared' }],
    },
  });
  render(<SourceHarness session={session} />);
  const sheet = screen.getByRole('dialog', { name: 'Shop' });
  assert.ok(within(sheet).getByText('A newer commit is available'));
  assert.ok(within(sheet).getByText(/Add payouts/));
  assert.ok(within(sheet).queryByText(/Body/) === null);
  await user.click(within(sheet).getByRole('button', { name: 'Sync to latest' }));
  assert.equal(syncToLatest.mock.calls.length, 1);

  const watch = within(sheet).getByRole('switch', { name: 'Watch for changes' });
  assert.equal(watch.getAttribute('aria-checked'), 'false');
  await user.click(watch);
  assert.deepEqual(setWatching.mock.calls[0], [true]);

  assert.match(within(sheet).getByTestId('last-change').textContent ?? '', new RegExp(diff.summary));
  const timeline = within(sheet).getByRole('list', { name: 'Commit timeline' });
  assert.ok(within(timeline).getByText('Tighten billing'));
  assert.ok(within(timeline).getByText('1 dependency became declared'));
  assert.equal(within(sheet).getByRole('link', { name: 'Classic map' }).getAttribute('href'), '/map');
  assert.equal(within(sheet).getByRole('link', { name: 'Settings' }).getAttribute('href'), '/settings');
  assert.ok(within(sheet).queryByRole('button', { name: 'Save to folder' }) === null, 'saving to disk is only for local folders');
  assert.ok(within(sheet).getByRole('button', { name: 'Download' }));

  await user.click(within(sheet).getByRole('radio', { name: 'Light' }));
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  await user.click(within(sheet).getByRole('switch', { name: 'Solid surfaces' }));
  assert.equal(document.documentElement.getAttribute('data-solid'), 'true');
  document.documentElement.removeAttribute('data-solid');
  document.documentElement.setAttribute('data-theme', 'dark');
});

test('without a newer commit there is no Sync offer', () => {
  render(<SourceHarness session={makeSession(makeBlueprint(), { live: { ...IDLE_LIVE, watching: true } })} />);
  assert.ok(screen.queryByRole('button', { name: 'Sync to latest' }) === null);
  assert.equal(screen.getByRole('switch', { name: 'Watch for changes' }).getAttribute('aria-checked'), 'true');
});

// ── Start screen ──────────────────────────────────────────────

function StartHarness({ session }: { session: BlueprintSession }) {
  const actions = useSourceActions(session);
  return <StartScreen session={session} actions={actions} />;
}

test('repository addresses are normalised before they are sent', () => {
  assert.equal(normalizeRepositoryUrl(' acme/shop '), 'https://github.com/acme/shop');
  assert.equal(normalizeRepositoryUrl('github.com/acme/shop.git'), 'https://github.com/acme/shop');
  assert.equal(normalizeRepositoryUrl('https://github.com/acme/shop/tree/main/src'), 'https://github.com/acme/shop');
  assert.equal(normalizeRepositoryUrl('https://gitlab.com/acme/shop'), null);
  assert.equal(normalizeRepositoryUrl('just words'), null);
});

test('submitting a URL opens the repository through the open API, wires live grants, then loads it', async () => {
  const user = userEvent.setup();
  const order: string[] = [];
  const loadFromGitHub = vi.fn(async () => { order.push('load'); });
  const configureLive = vi.fn<BlueprintSession['configureLive']>(() => { order.push('configure'); });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { url: string; ref?: string };
    return new Response(JSON.stringify({
      owner: 'acme', repo: 'shop', defaultBranch: 'main',
      commitSha: body.ref ?? 'a'.repeat(40),
      sourceGrant: body.ref ? 'grant-for-new-commit' : 'grant-1',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<StartHarness session={makeSession(null, { loadFromGitHub, configureLive })} />);

  assert.ok(screen.getByRole('heading', { name: 'Is the project on track?' }));
  const input = screen.getByRole('textbox', { name: 'GitHub repository URL' });
  assert.equal(input.getAttribute('placeholder'), 'Paste a GitHub repository URL');
  assert.ok(document.activeElement === input);
  assert.equal((screen.getByRole('button', { name: /^Open$/ }) as HTMLButtonElement).disabled, true);

  await user.type(input, 'acme/shop{Enter}');
  await waitFor(() => assert.equal(loadFromGitHub.mock.calls.length, 1));
  assert.equal(fetchMock.mock.calls[0][0], '/api/blueprint/open');
  assert.deepEqual(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)), { url: 'https://github.com/acme/shop' });
  assert.deepEqual(loadFromGitHub.mock.calls[0], [{ owner: 'acme', repo: 'shop', commitSha: 'a'.repeat(40), sourceGrant: 'grant-1', ref: 'main' }]);
  assert.deepEqual(order, ['configure', 'load'], 'live grants are wired before the repository loads');

  // Following the repository to a newer commit asks the same route for that commit.
  const grant = await configureLive.mock.calls[0][0].getSourceGrant!('b'.repeat(40));
  assert.equal(grant, 'grant-for-new-commit');
  assert.deepEqual(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)), { url: 'https://github.com/acme/shop', ref: 'b'.repeat(40) });
});

test('a repository that cannot be opened is explained in plain words and nothing is loaded', async () => {
  const user = userEvent.setup();
  const loadFromGitHub = vi.fn(async () => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'REPOSITORY_PRIVATE', message: 'x' }), { status: 403 })));
  render(<StartHarness session={makeSession(null, { loadFromGitHub })} />);
  await user.type(screen.getByRole('textbox', { name: 'GitHub repository URL' }), 'https://github.com/acme/secret{Enter}');
  assert.match((await screen.findByRole('alert')).textContent ?? '', /Private repositories are not supported/);
  assert.equal(loadFromGitHub.mock.calls.length, 0);

  await user.clear(screen.getByRole('textbox', { name: 'GitHub repository URL' }));
  await user.type(screen.getByRole('textbox', { name: 'GitHub repository URL' }), 'not a repository{Enter}');
  assert.match((await screen.findByRole('alert')).textContent ?? '', /https:\/\/github\.com\/owner\/repository/);
});

test('the start screen opens a folder, reopens the last one and loads the bundled sample', async () => {
  const user = userEvent.setup();
  const picked: string[] = [];
  const openLocalFolder = vi.fn(async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<{ name: string }> }).showDirectoryPicker;
    picked.push(picker ? (await picker()).name : 'real picker');
  });
  const reopenLocalFolder = vi.fn(async () => true);
  render(<StartHarness session={makeSession(null, { openLocalFolder, reopenLocalFolder })} />);

  await user.click(await screen.findByRole('button', { name: 'Reopen my-repo' }));
  assert.equal(reopenLocalFolder.mock.calls.length, 1);

  await user.click(screen.getByRole('button', { name: 'Open a local folder' }));
  await waitFor(() => assert.deepEqual(picked, ['real picker']));

  await user.click(screen.getByRole('button', { name: 'Try the sample' }));
  await waitFor(() => assert.deepEqual(picked, ['real picker', SAMPLE_NAME]));
  assert.equal('showDirectoryPicker' in window, false, 'the browser picker is put back after the sample loads');
  assert.equal(JSON.parse(window.localStorage.getItem('rassam_studio_last_source') ?? 'null')?.kind, 'sample');
  assert.ok(document.querySelector('[data-canvas-shortcuts="on"]') === null, 'map shortcuts stay off outside the map');
});

test('while a source loads the start screen says what is happening', () => {
  render(<StartHarness session={makeSession(null, { status: 'loading', progress: { phase: 'Reading files', completed: 12, total: 40 } })} />);
  assert.ok(screen.getByText('Reading files · 12/40'));
  assert.equal((screen.getByRole('button', { name: 'Try the sample' }) as HTMLButtonElement).disabled, true);
});

// ── Inspector ─────────────────────────────────────────────────

test('intent is written inline in the inspector and saved as one change', async () => {
  const user = userEvent.setup();
  const onSaveIntent = vi.fn();
  const session = makeSession(makeBlueprint());
  const { rerender } = render(
    <BlueprintInspector componentId="api" session={session} edgeStatus={() => null} onSelectComponent={vi.fn()} onOpenEdge={vi.fn()} onSaveIntent={onSaveIntent} onClose={vi.fn()} />,
  );
  const panel = screen.getByRole('complementary', { name: 'API details' });
  assert.ok(within(panel).getByText(/Nobody has said what this component is for/));
  await user.click(within(panel).getByRole('button', { name: 'Write intent' }));
  const field = within(panel).getByRole('textbox', { name: 'Intent of API' });
  assert.ok(document.activeElement === field);
  await user.type(field, 'Serves HTTP requests.');
  await user.keyboard('{Control>}{Enter}{/Control}');
  assert.deepEqual(onSaveIntent.mock.calls[0], ['Serves HTTP requests.']);
  assert.ok(within(panel).queryByRole('textbox') === null);

  // An existing intent is the hero text; clicking it edits in place, Escape cancels.
  rerender(
    <BlueprintInspector componentId="ui" session={session} edgeStatus={() => null} onSelectComponent={vi.fn()} onOpenEdge={vi.fn()} onSaveIntent={onSaveIntent} onClose={vi.fn()} />,
  );
  const ui = screen.getByRole('complementary', { name: 'UI details' });
  await user.click(within(ui).getByRole('button', { name: 'Edit intent: Renders views.' }));
  const edit = within(ui).getByRole('textbox', { name: 'Intent of UI' }) as HTMLTextAreaElement;
  assert.equal(edit.value, 'Renders views.');
  await user.type(edit, ' More.');
  await user.keyboard('{Escape}');
  assert.equal(onSaveIntent.mock.calls.length, 1, 'Escape does not save');
  assert.ok(within(ui).getByText('Renders views.'));

  const boundaries = within(ui).getByRole('region', { name: 'Boundaries' });
  assert.ok(within(boundaries).getByText('UI has no declared dependencies.'));
});

test('the inspector states boundaries in plain sentences and offers sign-off and the full forms', async () => {
  const user = userEvent.setup();
  const onVerify = vi.fn();
  const onOpenManual = vi.fn();
  render(
    <BlueprintInspector componentId="billing" session={makeSession(makeBlueprint())} edgeStatus={() => null} onSelectComponent={vi.fn()} onOpenEdge={vi.fn()} onVerify={onVerify} onOpenManual={onOpenManual} onClose={vi.fn()} />,
  );
  const panel = screen.getByRole('complementary', { name: 'Billing details' });
  const boundaries = within(panel).getByRole('region', { name: 'Boundaries' });
  assert.ok(within(boundaries).getByText('Billing may depend on Database and Stripe.'));
  assert.ok(within(boundaries).getByText('It must not depend on UI.'));
  assert.ok(within(within(panel).getByRole('region', { name: 'Rules' })).getByText('“Billing must stay headless.”'));

  await user.click(within(panel).getByRole('button', { name: 'Verify again' }));
  await user.type(within(panel).getByRole('textbox', { name: 'Your name' }), 'Dana');
  await user.click(within(panel).getByRole('button', { name: 'Sign off' }));
  assert.deepEqual(onVerify.mock.calls[0], ['Dana', undefined]);

  await user.click(within(panel).getByRole('button', { name: /^More/ }));
  assert.equal(onOpenManual.mock.calls.length, 1);
});
