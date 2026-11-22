// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { useEditorTabs } from './useEditorTabs';

const getCachedFileRecord = vi.fn();
const cacheFile = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/file-store', () => ({
  getCachedFileRecord: (...args: unknown[]) => getCachedFileRecord(...args),
  cacheFile: (...args: unknown[]) => cacheFile(...args),
}));

const commitSha = 'a'.repeat(40);
const blobSha = 'b'.repeat(40);
const sourceGrant = 'grant'.repeat(20);

function params(projectId = 'project-1') {
  return {
    projectId,
    repoDetails: {
      owner: 'openai',
      repo: 'rassam',
      commitSha,
      sourceGrant,
    },
    fileEntries: [
      { path: 'src/index.ts', type: 'blob' as const, sha: blobSha, size: 20, commitSha },
      { path: 'src/other.ts', type: 'blob' as const, sha: 'c'.repeat(40), size: 20, commitSha },
    ],
  };
}

beforeEach(() => {
  getCachedFileRecord.mockReset().mockResolvedValue(null);
  cacheFile.mockClear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('loads an exact evidence blob and exposes revision metadata and location', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
    path: 'src/index.ts',
    content: 'export const value = 1;',
    commitSha,
    blobSha,
    size: 23,
    binary: false,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const { result } = renderHook(() => useEditorTabs(params()));

  await act(async () => {
    await result.current.openFile({ path: 'src/index.ts', blobSha, startLine: 4, endLine: 6 });
  });

  await waitFor(() => assert.equal(result.current.activeFileContent, 'export const value = 1;'));
  assert.equal(result.current.activeFileRevision?.verified, true);
  assert.equal(result.current.activeFileRevision?.actualBlobSha, blobSha);
  assert.deepEqual(result.current.activeFileViewState?.location, {
    path: 'src/index.ts', blobSha, startLine: 4, endLine: 6,
  });
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  assert.equal(body.blobSha, blobSha);
  assert.equal(body.maxBytes, 2 * 1024 * 1024);
});

test('rejects stale evidence before any source request', async () => {
  const { result } = renderHook(() => useEditorTabs(params()));
  await act(async () => {
    await result.current.openFile({ path: 'src/index.ts', blobSha: 'd'.repeat(40), startLine: 2 });
  });

  assert.match(result.current.activeFileError ?? '', /does not match/i);
  assert.equal(vi.mocked(fetch).mock.calls.length, 0);
});

test('restores each tab scroll position and isolates open tabs by project', async () => {
  const { result, rerender } = renderHook(
    ({ projectId }) => useEditorTabs(params(projectId)),
    { initialProps: { projectId: 'project-1' } },
  );

  await act(async () => {
    await result.current.openFile('src/index.ts', 'index');
    result.current.setFileScrollTop('src/index.ts', 420);
    await result.current.openFile('src/other.ts', 'other');
    result.current.selectTab('src/index.ts');
  });
  assert.equal(result.current.activeFileViewState?.scrollTop, 420);

  rerender({ projectId: 'project-2' });
  await waitFor(() => assert.equal(result.current.activeTabId, '__canvas__'));
  rerender({ projectId: 'project-1' });
  await waitFor(() => assert.equal(result.current.activeTabId, 'src/index.ts'));
  assert.equal(result.current.activeFileViewState?.scrollTop, 420);
});

test('refresh bypasses a valid cache and rejects a mismatched network blob', async () => {
  getCachedFileRecord.mockResolvedValue({
    projectId: 'project-1',
    filePath: 'src/index.ts',
    content: 'cached',
    commitSha,
    blobSha,
    sizeBytes: 6,
    isText: true,
    fetchedAt: new Date().toISOString(),
    lastAccessAt: new Date().toISOString(),
  });
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
    path: 'src/index.ts',
    content: 'wrong',
    commitSha,
    blobSha: 'd'.repeat(40),
    size: 5,
    binary: false,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const { result } = renderHook(() => useEditorTabs(params()));

  await act(async () => { await result.current.openFile('src/index.ts'); });
  assert.equal(result.current.activeFileContent, 'cached');
  await act(async () => { await result.current.refreshFile('src/index.ts'); });
  await waitFor(() => assert.match(result.current.activeFileError ?? '', /different source blob/i));
  assert.equal(result.current.activeFileContent, 'cached');
  assert.equal(vi.mocked(fetch).mock.calls.length, 1);
});
