import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildPinnedGitHubFileUrl,
  clampSourceLocation,
  HIGHLIGHT_MAX_BYTES,
  HIGHLIGHT_MAX_LINES,
  shouldUsePlainTextViewer,
  verifyFileRevision,
} from './editor-file';

const commitSha = 'a'.repeat(40);
const blobSha = 'b'.repeat(40);

test('pinned revision verification requires exact commit and blob metadata', () => {
  assert.deepEqual(
    verifyFileRevision(
      { expectedCommitSha: commitSha, expectedBlobSha: blobSha },
      { actualCommitSha: commitSha.toUpperCase(), actualBlobSha: blobSha },
    ),
    { verified: true },
  );

  assert.match(
    verifyFileRevision(
      { expectedCommitSha: commitSha, expectedBlobSha: blobSha },
      { actualCommitSha: 'c'.repeat(40), actualBlobSha: blobSha },
    ).error ?? '',
    /different repository revision/i,
  );
  assert.match(
    verifyFileRevision(
      { expectedCommitSha: commitSha, expectedBlobSha: blobSha },
      { actualCommitSha: commitSha },
    ).error ?? '',
    /source blob/i,
  );
});

test('large and unsupported files use the virtual plain-text viewer', () => {
  assert.equal(shouldUsePlainTextViewer({ supportsHighlighting: false, sizeBytes: 10, lineCount: 1 }), true);
  assert.equal(shouldUsePlainTextViewer({ supportsHighlighting: true, sizeBytes: HIGHLIGHT_MAX_BYTES + 1, lineCount: 1 }), true);
  assert.equal(shouldUsePlainTextViewer({ supportsHighlighting: true, sizeBytes: 10, lineCount: HIGHLIGHT_MAX_LINES + 1 }), true);
  assert.equal(shouldUsePlainTextViewer({ supportsHighlighting: true, sizeBytes: 10, lineCount: 20 }), false);
});

test('GitHub links always use the immutable commit and preserve source ranges', () => {
  const url = buildPinnedGitHubFileUrl(
    { owner: 'openai', repo: 'my repo', commitSha },
    { path: 'src/a file.ts', startLine: 12, endLine: 18 },
  );
  assert.equal(
    url,
    `https://github.com/openai/my%20repo/blob/${commitSha}/src/a%20file.ts#L12-L18`,
  );
  assert.equal(
    buildPinnedGitHubFileUrl(
      { owner: 'openai', repo: 'rassam', commitSha: 'main' },
      { path: 'src/index.ts' },
    ),
    null,
  );
  assert.equal(
    buildPinnedGitHubFileUrl(
      { owner: 'openai', repo: 'rassam', commitSha },
      { path: '../private/.env' },
    ),
    null,
  );
});

test('source locations are clamped to the loaded file without losing blob identity', () => {
  assert.deepEqual(
    clampSourceLocation({ path: 'src/index.ts', blobSha, startLine: 80, endLine: 100 }, 42),
    { path: 'src/index.ts', blobSha, startLine: 42, endLine: 42 },
  );
});
