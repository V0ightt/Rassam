// Test-only helpers: a real engine workspace over a tiny repository and a fake
// `useBlueprint` session whose `update` behaves like the real one.

import { useMemo, useState, type ReactNode } from 'react';
import { vi } from 'vitest';

import {
  applyBlueprintEdits,
  blueprintSchema,
  createWorkspace,
  diffArchitecture,
  parseBlueprint,
  parseIntent,
  suggestIntents,
  summarizeBlueprintDelta,
  type Blueprint,
  type BlueprintEdit,
  type BlueprintEditInput,
  type BlueprintInput,
  type ReachReport,
  type SourceFile,
} from '@/blueprint';
import type { BlueprintProposal, BlueprintReceipt, BlueprintSession, IntentState, LiveState } from './session';
import { useBlueprintUi, type BlueprintUi } from './useBlueprintUi';

export const FILES: SourceFile[] = [
  {
    path: 'src/api/handler.ts',
    content: "import { charge } from '../billing/charge';\nimport { render } from '../ui/view';\nexport const key = process.env.STRIPE_SECRET_KEY;\nexport const run = () => charge() + render();\n",
  },
  {
    path: 'src/billing/charge.ts',
    content: "import { db } from '../db/client';\nimport { render } from '../ui/view';\nexport const charge = () => (db ? render() : 0);\n",
  },
  { path: 'src/db/client.ts', content: 'export const db = { url: process.env.DATABASE_URL };\n' },
  { path: 'src/ui/view.ts', content: "import { db } from '../db/client';\nexport const render = () => (db ? 1 : 0);\n" },
  { path: 'src/misc/one.ts', content: 'export const one = 1;\n' },
  { path: 'src/misc/two.ts', content: 'export const two = 2;\n' },
  { path: 'src/misc/three.ts', content: 'export const three = 3;\n' },
];

export const BLUEPRINT_INPUT: BlueprintInput = {
  version: '0.1',
  system: { name: 'Shop' },
  components: [
    { id: 'api', name: 'API', kind: 'api', paths: ['src/api/**'], provenance: { source: 'derived' } },
    {
      id: 'billing',
      name: 'Billing',
      kind: 'service',
      paths: ['src/billing/**'],
      intent: 'Charges customers.\nNever renders UI.',
      assurance: 'tested',
      provenance: { source: 'derived' },
      verified: { by: 'Sam', at: '2026-01-02T00:00:00.000Z' },
    },
    { id: 'db', name: 'Database', kind: 'database', paths: ['src/db/**'], provenance: { source: 'derived' } },
    { id: 'ui', name: 'UI', kind: 'component', paths: ['src/ui/**'], intent: 'Renders views.', provenance: { source: 'human' } },
    { id: 'ghost', name: 'Ghost', kind: 'default', paths: ['src/ghost/**'], provenance: { source: 'derived' } },
    { id: 'stripe', name: 'Stripe', kind: 'external-api', paths: [], external: true, provenance: { source: 'derived' } },
  ],
  dependencies: [
    { from: 'billing', to: 'db', kind: 'imports', provenance: { source: 'derived' } },
    { from: 'billing', to: 'stripe', kind: 'calls', provenance: { source: 'derived' } },
  ],
  rules: [
    { id: 'billing-headless', kind: 'forbid', from: 'billing', to: 'ui', severity: 'error', reason: 'Billing must stay headless.', provenance: { source: 'human' } },
    { id: 'no-loops', kind: 'no-cycles', provenance: { source: 'derived' } },
  ],
  invariants: [{ id: 'idempotent-charges', statement: 'Charges are idempotent.', components: ['billing'], provenance: { source: 'derived' } }],
  decisions: [],
};

/** The MCP command embeds a credential on purpose: the UI must never render it. */
export const LEAKY_COMMAND = 'npx server --token=SUPERSECRETVALUE123';

export const REACH: ReachReport = {
  configs: [{ path: '.mcp.json', type: 'mcp', agent: 'Claude Code' }],
  mcpServers: [{ name: 'github', configPath: '.mcp.json', agent: 'Claude Code', transport: 'stdio', command: LEAKY_COMMAND, url: 'https://user:SUPERSECRETVALUE123@example.test', env: ['GITHUB_TOKEN'] }],
  inlineSecrets: [{ path: '.mcp.json', line: 7, location: 'mcpServers.github.env.GITHUB_TOKEN', preview: 'ghp_…a1b2 (40 chars)', kind: 'GitHub token' }],
  permissions: [
    { path: '.claude/settings.json', agent: 'Claude Code', effect: 'allow', rule: 'Bash(*)', broad: true },
    { path: '.claude/settings.json', agent: 'Claude Code', effect: 'allow', rule: 'Read(src/**)', broad: false },
  ],
  envAccess: [
    { name: 'STRIPE_SECRET_KEY', secretLike: true, readers: ['api'], files: ['src/api/handler.ts'] },
    { name: 'DATABASE_URL', secretLike: false, readers: ['db'], files: ['src/db/client.ts'] },
  ],
};

export function makeBlueprint(input: BlueprintInput = BLUEPRINT_INPUT): Blueprint {
  return blueprintSchema.parse(structuredClone(input));
}

export interface SessionSpies {
  update: ReturnType<typeof vi.fn<(next: Blueprint, label?: string) => void>>;
  rejected: ReturnType<typeof vi.fn<(message: string) => void>>;
  verify: ReturnType<typeof vi.fn<BlueprintSession['verify']>>;
  adoptDraft: ReturnType<typeof vi.fn<BlueprintSession['adoptDraft']>>;
  setPosition: ReturnType<typeof vi.fn<BlueprintSession['setPosition']>>;
  loadFromGitHub: ReturnType<typeof vi.fn<BlueprintSession['loadFromGitHub']>>;
  openLocalFolder: ReturnType<typeof vi.fn<BlueprintSession['openLocalFolder']>>;
  proposeIntent: ReturnType<typeof vi.fn<(instruction: string, options?: { selection?: string[] }) => void>>;
  proposeEdits: ReturnType<typeof vi.fn<BlueprintSession['proposeEdits']>>;
  applyProposal: ReturnType<typeof vi.fn<(proposal: BlueprintProposal) => void>>;
  applyEditsNow: ReturnType<typeof vi.fn<BlueprintSession['applyEditsNow']>>;
}

export function makeSpies(): SessionSpies {
  return {
    update: vi.fn(),
    rejected: vi.fn(),
    verify: vi.fn<BlueprintSession['verify']>(),
    adoptDraft: vi.fn<BlueprintSession['adoptDraft']>(),
    setPosition: vi.fn<BlueprintSession['setPosition']>(),
    loadFromGitHub: vi.fn<BlueprintSession['loadFromGitHub']>(async () => undefined),
    openLocalFolder: vi.fn<BlueprintSession['openLocalFolder']>(async () => undefined),
    proposeIntent: vi.fn(),
    proposeEdits: vi.fn<BlueprintSession['proposeEdits']>(),
    applyProposal: vi.fn(),
    applyEditsNow: vi.fn<BlueprintSession['applyEditsNow']>(),
  };
}

export const IDLE_LIVE: LiveState = { watching: false, checking: false, current: null, latest: null, behind: false, lastChange: null, history: [] };

/** Build a ready session around a blueprint, evaluated by the real engine. */
export function makeSession(blueprint: Blueprint | null, overrides: Partial<BlueprintSession> = {}): BlueprintSession {
  const workspace = blueprint ? createWorkspace(FILES, blueprint, { reach: REACH }) : null;
  const noop = () => undefined;
  return {
    status: blueprint ? 'ready' : 'idle',
    progress: null,
    error: null,
    source: blueprint ? { kind: 'github', owner: 'acme', repo: 'shop', commitSha: 'abcdef1234567890' } : null,
    blueprint,
    origin: blueprint ? 'repository' : null,
    savedText: null,
    issues: [],
    dirty: false,
    workspace,
    report: workspace ? workspace.check() : null,
    layout: {},
    canSaveToDisk: false,
    canUndo: false,
    canRedo: false,
    intent: { status: 'idle' },
    suggestions: [],
    live: IDLE_LIVE,
    systemStatus: null,
    receipts: [],
    loadFromGitHub: async () => undefined,
    openLocalFolder: async () => undefined,
    reopenLocalFolder: async () => false,
    rescan: async () => undefined,
    startEmpty: noop,
    adoptDraft: noop,
    update: noop,
    setPosition: noop,
    verify: noop,
    undo: noop,
    redo: noop,
    saveToDisk: async () => undefined,
    download: noop,
    copyToClipboard: async () => undefined,
    discardChanges: noop,
    close: noop,
    proposeIntent: async () => undefined,
    proposeEdits: noop,
    chooseIntentOption: noop,
    applyProposal: noop,
    discardProposal: noop,
    applyEditsNow: noop,
    setWatching: noop,
    syncToLatest: async () => undefined,
    configureLive: noop,
    ...overrides,
  };
}

/** A proposal for `edits` over `blueprint`, built the way the data layer builds one. */
export function makeProposal(blueprint: Blueprint, edits: BlueprintEditInput[], instruction = 'test', source: BlueprintProposal['source'] = 'parser'): BlueprintProposal {
  const before = createWorkspace(FILES, blueprint, { reach: REACH });
  const result = applyBlueprintEdits(blueprint, edits);
  const after = createWorkspace(FILES, result.blueprint, { reach: REACH });
  return {
    id: `proposal-${instruction}`,
    instruction,
    source,
    edits: edits as BlueprintEdit[],
    applied: result.applied,
    interpretation: result.applied.map((edit) => edit.summary).join(' '),
    preview: result.blueprint,
    delta: summarizeBlueprintDelta(blueprint, result.blueprint),
    previewReport: after.check(),
    graphDiff: diffArchitecture(before.graphView(), after.graphView()),
    weakens: result.applied.some((edit) => edit.weakens),
  };
}

/**
 * Stateful fake of `useBlueprint`: edits are validated and re-evaluated like
 * the real hook, and instructions go through the engine's own parser, so the
 * propose, apply, undo loop behaves as it does in the app.
 */
export function Harness({
  initial = makeBlueprint(),
  spies,
  overrides,
  children,
}: {
  initial?: Blueprint | null;
  spies: SessionSpies;
  overrides?: Partial<BlueprintSession>;
  children: (session: BlueprintSession, ui: BlueprintUi) => ReactNode;
}) {
  const [blueprint, setBlueprint] = useState(initial);
  const [past, setPast] = useState<Blueprint[]>([]);
  const [future, setFuture] = useState<Blueprint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<IntentState>({ status: 'idle' });
  const [receipts, setReceipts] = useState<BlueprintReceipt[]>([]);
  const ui = useBlueprintUi();
  const session = useMemo(() => {
    const commit = (next: Blueprint, label: string, receipt: boolean) => {
      if (!blueprint) return;
      setPast((current) => [...current, blueprint]);
      setFuture([]);
      setBlueprint(next);
      if (receipt) setReceipts((current) => [{ id: `receipt-${current.length + 1}`, label, at: '2026-11-22T10:00:00.000Z' }, ...current]);
    };
    const stage = (edits: BlueprintEditInput[], instruction: string, source: BlueprintProposal['source']) => {
      if (!blueprint) return;
      try {
        setIntent({ status: 'proposed', proposal: makeProposal(blueprint, edits, instruction, source) });
      } catch (failure) {
        setIntent({ status: 'error', instruction, message: failure instanceof Error ? failure.message : 'failed' });
      }
    };
    return makeSession(blueprint, {
      error,
      intent,
      receipts,
      suggestions: blueprint ? suggestIntents(blueprint, createWorkspace(FILES, blueprint).graphView()) : [],
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      update: (recipe, label) => {
        if (!blueprint) return;
        const draft = structuredClone(blueprint);
        const parsed = parseBlueprint(recipe(draft) ?? draft);
        if (!parsed.ok) {
          const message = `Change rejected: ${parsed.issues.map((issue) => issue.message).join('; ')}`;
          spies.rejected(message);
          setError(message);
          return;
        }
        spies.update(parsed.blueprint, label);
        setError(null);
        commit(parsed.blueprint, label ?? '', false);
      },
      undo: () => {
        const previous = past.at(-1);
        if (!previous || !blueprint) return;
        setPast(past.slice(0, -1));
        setFuture([blueprint, ...future]);
        setBlueprint(previous);
      },
      redo: () => {
        const [next, ...rest] = future;
        if (!next || !blueprint) return;
        setFuture(rest);
        setPast([...past, blueprint]);
        setBlueprint(next);
      },
      proposeIntent: async (instruction, options) => {
        spies.proposeIntent(instruction, options);
        if (!blueprint) return;
        const result = parseIntent(instruction, blueprint);
        if (result.status === 'ok') stage(result.edits, instruction, 'parser');
        else if (result.status === 'ambiguous') setIntent({ status: 'ambiguous', instruction, message: result.message, options: result.options });
        else setIntent({ status: 'unknown', instruction, message: result.message, examples: result.examples });
      },
      proposeEdits: (edits, label) => {
        spies.proposeEdits(edits, label);
        stage(edits, label, 'manual');
      },
      chooseIntentOption: (index) => {
        if (intent.status === 'ambiguous') stage(intent.options[index].edits, intent.instruction, 'parser');
      },
      applyProposal: () => {
        if (intent.status !== 'proposed') return;
        spies.applyProposal(intent.proposal);
        commit(intent.proposal.preview, intent.proposal.applied.map((edit) => edit.summary).join(' '), true);
        setIntent({ status: 'idle' });
      },
      discardProposal: () => setIntent({ status: 'idle' }),
      applyEditsNow: (edits, label) => {
        spies.applyEditsNow(edits, label);
        if (!blueprint) return;
        commit(applyBlueprintEdits(blueprint, edits).blueprint, label, true);
      },
      verify: spies.verify,
      adoptDraft: spies.adoptDraft,
      setPosition: spies.setPosition,
      loadFromGitHub: spies.loadFromGitHub,
      openLocalFolder: spies.openLocalFolder,
      ...overrides,
    });
  }, [blueprint, error, future, intent, overrides, past, receipts, spies]);
  return <>{children(session, ui)}</>;
}
