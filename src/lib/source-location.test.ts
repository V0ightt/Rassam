import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  describeSourceLocation,
  formatSourceLocation,
  isNavigableSourceLocation,
  parseSourceLocation,
  sourceLocationFromEvidence,
} from './source-location';

test('parses repository paths and optional line ranges', () => {
  assert.deepEqual(parseSourceLocation('src/app/page.tsx'), {
    path: 'src/app/page.tsx',
  });
  assert.deepEqual(parseSourceLocation('src/app/page.tsx:42'), {
    path: 'src/app/page.tsx',
    startLine: 42,
  });
  assert.deepEqual(parseSourceLocation('src/app/page.tsx:42-57'), {
    path: 'src/app/page.tsx',
    startLine: 42,
    endLine: 57,
  });
  assert.deepEqual(parseSourceLocation('README.md:3'), {
    path: 'README.md',
    startLine: 3,
  });
});

test('rejects locations outside the repository navigation contract', () => {
  const invalid = [
    'https://github.com/example/repo/file.ts:4',
    '/src/file.ts:4',
    '../src/file.ts:4',
    'src/../file.ts:4',
    'C:\\repo\\file.ts:4',
    'src/file.ts:0',
    'src/file.ts:9-3',
    'src/file.ts:line',
    'Array.prototype',
    'Object.keys',
    'process.env.NODE_ENV',
    'v1.2.3',
    'foo.bar()',
    'not-a-source-reference',
    ' src/file.ts:4',
  ];

  invalid.forEach((value) => assert.equal(parseSourceLocation(value), null, value));
});

test('formats labels and preserves evidence pinning metadata', () => {
  const location = sourceLocationFromEvidence({
    path: 'src/lib/data.ts',
    blobSha: 'a'.repeat(40),
    startLine: 8,
    endLine: 11,
    kind: 'import',
    confidence: 'high',
  });

  assert.equal(formatSourceLocation(location), 'src/lib/data.ts:8-11');
  assert.equal(describeSourceLocation(location), 'Open src/lib/data.ts, lines 8 to 11');
  assert.equal(location.blobSha, 'a'.repeat(40));
});

test('normalizes malformed legacy evidence before navigation', () => {
  const reversed = sourceLocationFromEvidence({
    path: 'src/lib/data.ts',
    blobSha: 'b'.repeat(40),
    startLine: 12,
    endLine: 4,
    kind: 'import',
    confidence: 'high',
  });
  const endOnly = sourceLocationFromEvidence({
    path: 'src/lib/data.ts',
    blobSha: 'b'.repeat(40),
    endLine: 4,
    kind: 'import',
    confidence: 'high',
  });

  assert.equal(formatSourceLocation(reversed), 'src/lib/data.ts:12');
  assert.equal(formatSourceLocation(endOnly), 'src/lib/data.ts');
  assert.equal(isNavigableSourceLocation(reversed), true);
  assert.equal(isNavigableSourceLocation({ path: '../private/file.ts', startLine: 1 }), false);
  assert.equal(isNavigableSourceLocation({ path: 'src/file.ts', endLine: 2 }), false);
});
