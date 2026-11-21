import { describe, expect, it } from 'vitest';

import { analyzeLocalSnapshot, analyzeLocalSnapshotOffThread } from './analysis';

const files = [
  { path: 'package.json', content: JSON.stringify({ name: 'demo' }) },
  { path: 'src/ui/App.tsx', content: 'import { load } from "../data/store";\nexport const App = () => load();' },
  { path: 'src/data/store.ts', content: 'export const load = () => process.env.DATABASE_URL;' },
];

describe('analyzeLocalSnapshot', () => {
  it('derives a draft when the folder has no blueprint', () => {
    const result = analyzeLocalSnapshot({ name: 'demo', files, blueprintText: null });
    expect(result.blueprint).toBeNull();
    expect(result.draft?.system.name).toBe('demo');
    expect(result.graph.edges).toEqual([
      expect.objectContaining({ from: 'src/ui/App.tsx', to: 'src/data/store.ts', line: 1 }),
    ]);
    expect(result.reach.envAccess.map((entry) => entry.name)).toEqual(['DATABASE_URL']);
  });

  it('parses an existing blueprint and reports issues for an invalid one', () => {
    const valid = JSON.stringify({ version: '0.1', system: { name: 'Demo' }, components: [] });
    expect(analyzeLocalSnapshot({ name: 'demo', files, blueprintText: valid })).toMatchObject({ draft: null, issues: [] });
    const invalid = analyzeLocalSnapshot({ name: 'demo', files, blueprintText: '{ "version": "9" }' });
    expect(invalid.blueprint).toBeNull();
    expect(invalid.issues.length).toBeGreaterThan(0);
    expect(invalid.draft).not.toBeNull();
  });

  it('falls back to the main thread without Web Workers and returns a live graph', async () => {
    const result = await analyzeLocalSnapshotOffThread({ name: 'demo', files, blueprintText: null });
    expect(result.graph.facts.get('src/ui/App.tsx')?.language).toBe('typescript');
  });
});
