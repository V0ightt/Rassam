import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DEFAULT_FILE_CACHE_LIMIT_BYTES,
  isCachedFileForRevision,
  selectFileCacheEvictions,
  type CachedFileRecord,
} from './file-store';

function record(
  filePath: string,
  sizeBytes: number,
  lastAccessAt: string,
  projectId = 'project-1',
): CachedFileRecord {
  return {
    projectId,
    filePath,
    content: '',
    sizeBytes,
    isText: true,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    lastAccessAt,
  };
}

test('file cache defaults to a 100 MiB budget', () => {
  assert.equal(DEFAULT_FILE_CACHE_LIMIT_BYTES, 100 * 1024 * 1024);
});

test('LRU eviction removes oldest records until the byte budget is met', () => {
  const records = [
    record('oldest.ts', 40, '2026-01-01T00:00:00.000Z'),
    record('middle.ts', 40, '2026-01-02T00:00:00.000Z'),
    record('newest.ts', 40, '2026-01-03T00:00:00.000Z'),
  ];

  assert.deepEqual(selectFileCacheEvictions(records, 70), [
    { projectId: 'project-1', filePath: 'oldest.ts' },
    { projectId: 'project-1', filePath: 'middle.ts' },
  ]);
});

test('LRU selection does not mutate caller ordering', () => {
  const records = [
    record('new.ts', 10, '2026-02-01T00:00:00.000Z'),
    record('old.ts', 10, '2026-01-01T00:00:00.000Z'),
  ];

  selectFileCacheEvictions(records, 10);
  assert.deepEqual(records.map((item) => item.filePath), ['new.ts', 'old.ts']);
});

test('a zero-byte budget evicts every record across projects', () => {
  const records = [
    record('a.ts', 10, '2026-01-01T00:00:00.000Z', 'a'),
    record('b.ts', 10, '2026-01-02T00:00:00.000Z', 'b'),
  ];

  assert.deepEqual(selectFileCacheEvictions(records, 0), [
    { projectId: 'a', filePath: 'a.ts' },
    { projectId: 'b', filePath: 'b.ts' },
  ]);
});

test('revision-aware cache checks reject legacy and stale source records', () => {
  const current = { commitSha: 'ABC123' };
  assert.equal(isCachedFileForRevision(current, 'abc123'), true);
  assert.equal(isCachedFileForRevision(current, 'def456'), false);
  assert.equal(isCachedFileForRevision({}, 'abc123'), false);
  assert.equal(isCachedFileForRevision({}, undefined), true);
});
