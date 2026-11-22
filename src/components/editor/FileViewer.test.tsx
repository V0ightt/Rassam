// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { axe } from 'vitest-axe';

import FileViewer from './FileViewer';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('reveals and highlights an evidence line range with a pinned GitHub link', async () => {
  const commitSha = 'a'.repeat(40);
  const blobSha = 'b'.repeat(40);
  const content = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n');
  const { container } = render(
    <FileViewer
      filePath="src/a file.txt"
      content={content}
      isLoading={false}
      sourceLocation={{ path: 'src/a file.txt', blobSha, startLine: 40, endLine: 42 }}
      navigationKey={1}
      revision={{
        expectedCommitSha: commitSha,
        expectedBlobSha: blobSha,
        actualCommitSha: commitSha,
        actualBlobSha: blobSha,
        verified: true,
        source: 'network',
      }}
      repoDetails={{ owner: 'openai', repo: 'rassam', commitSha }}
    />,
  );

  assert.ok(screen.getByText('Lines 40 to 42'));
  assert.ok(screen.getByTestId('source-range-highlight'));
  const link = screen.getByRole('link', { name: 'Open this pinned file on GitHub' });
  assert.equal(
    link.getAttribute('href'),
    `https://github.com/openai/rassam/blob/${commitSha}/src/a%20file.txt#L40-L42`,
  );
  assert.ok(screen.getByRole('region', { name: 'src/a file.txt source code' }));

  const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
  assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(', '));
});

test('virtualizes unsupported large text instead of mounting the full document', () => {
  const content = Array.from({ length: 20_001 }, (_, index) => `plain line ${index + 1}`).join('\n');
  const { container } = render(
    <FileViewer filePath="logs/output.unknown" content={content} isLoading={false} />,
  );

  const virtualDocument = container.querySelector('[data-viewer-mode="plain-virtual"]');
  assert.ok(virtualDocument);
  assert.match(virtualDocument.textContent ?? '', /plain line 1\nplain line 2/);
  assert.doesNotMatch(virtualDocument.textContent ?? '', /plain line 20001/);
});

test('file actions support copy, refresh, and retry without hidden click targets', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const refresh = vi.fn();
  const retry = vi.fn();
  render(
    <FileViewer
      filePath="src/index.ts"
      content="export const value = 1;"
      isLoading={false}
      error="A refresh failed."
      onRefresh={refresh}
      onRetry={retry}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Copy path src/index.ts' }));
  assert.deepEqual(writeText.mock.calls[0], ['src/index.ts']);
  assert.ok(screen.getByText('Path copied'));
  await waitFor(() => assert.ok(screen.getByText('typescript')));
  await user.click(screen.getByRole('button', { name: 'Refresh from pinned commit' }));
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  assert.equal(refresh.mock.calls.length, 1);
  assert.equal(retry.mock.calls.length, 1);
});
