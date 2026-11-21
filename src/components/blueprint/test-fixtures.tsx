// Test-only helpers: a real engine workspace over a tiny repository and a fake
// `useBlueprint` session whose `update` behaves like the real one.

import { useMemo, useState, type ReactNode } from 'react';
import { vi } from 'vitest';

import {
  blueprintSchema,
  createWorkspace,
  parseBlueprint,
  type Blueprint,
  type BlueprintInput,
  type ReachReport,
  type SourceFile,
} from '@/blueprint';
import type { BlueprintSession } from './session';
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
  };
}

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
    ...overrides,
  };
}

/** Stateful fake of `useBlueprint`: edits are validated and re-evaluated like the real hook. */
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
  const [error, setError] = useState<string | null>(null);
  const ui = useBlueprintUi();
  const session = useMemo(() => makeSession(blueprint, {
    error,
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
      setBlueprint(parsed.blueprint);
    },
    verify: spies.verify,
    adoptDraft: spies.adoptDraft,
    setPosition: spies.setPosition,
    loadFromGitHub: spies.loadFromGitHub,
    openLocalFolder: spies.openLocalFolder,
    ...overrides,
  }), [blueprint, error, overrides, spies]);
  return <>{children(session, ui)}</>;
}
