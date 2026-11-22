'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { BlueprintSession } from '@/components/blueprint/session';
import { recallLocalFolder } from '@/lib/blueprint-client/local-folder';

import { SAMPLE_NAME, openSample } from './sample';

const LAST_SOURCE_KEY = 'rassam_studio_last_source';

export type LastSource = { kind: 'sample' } | { kind: 'github'; url: string; label: string } | { kind: 'local'; name: string };

interface OpenResponse {
  owner: string;
  repo: string;
  commitSha: string;
  defaultBranch: string;
  sourceGrant: string;
}

const OPEN_ERRORS: Record<string, string> = {
  INVALID_GITHUB_URL: 'Enter a public repository as https://github.com/owner/repository.',
  REPOSITORY_NOT_FOUND: 'That repository was not found on GitHub. Check the address; private repositories are not supported.',
  REPOSITORY_PRIVATE: 'Private repositories are not supported. Open a local folder instead: files stay on your machine.',
  REF_NOT_FOUND: 'That branch or commit was not found in the repository.',
  GITHUB_RATE_LIMITED: "GitHub's rate limit was reached. Wait a few minutes and try again.",
  GITHUB_UNAVAILABLE: 'GitHub is temporarily unavailable. Try again shortly.',
  RATE_LIMITED: 'Too many requests. Wait a little and try again.',
  SESSION_REQUIRED: 'Your browser session has expired. Reload the page and try again.',
  SOURCE_GRANT_CONFIGURATION: 'This deployment is not configured to read repositories.',
};

/** Accepts `https://github.com/owner/repo`, `github.com/owner/repo` and `owner/repo`. */
export function normalizeRepositoryUrl(input: string): string | null {
  const value = input.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!value) return null;
  const shorthand = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)$/.exec(value);
  if (shorthand) return `https://github.com/${shorthand[1]}/${shorthand[2]}`;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.hostname.toLowerCase() !== 'github.com' && url.hostname.toLowerCase() !== 'www.github.com') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return `https://github.com/${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

async function requestOpen(url: string, ref?: string, signal?: AbortSignal): Promise<OpenResponse> {
  let response: Response;
  try {
    response = await fetch('/api/blueprint/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ref ? { url, ref } : { url }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof record.code === 'string' ? record.code : '';
    throw new Error(OPEN_ERRORS[code] ?? (typeof record.message === 'string' && record.message ? record.message : `The repository could not be opened (HTTP ${response.status}).`));
  }
  if (
    typeof record.owner !== 'string' || typeof record.repo !== 'string' || typeof record.commitSha !== 'string'
    || typeof record.sourceGrant !== 'string' || typeof record.defaultBranch !== 'string'
  ) {
    throw new Error('The server returned an unexpected response.');
  }
  return { owner: record.owner, repo: record.repo, commitSha: record.commitSha, defaultBranch: record.defaultBranch, sourceGrant: record.sourceGrant };
}

function readLast(): LastSource | null {
  try {
    const raw = window.localStorage.getItem(LAST_SOURCE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LastSource> & Record<string, unknown>;
    if (value.kind === 'sample') return { kind: 'sample' };
    if (value.kind === 'github' && typeof value.url === 'string' && typeof value.label === 'string' && normalizeRepositoryUrl(value.url)) {
      return { kind: 'github', url: value.url, label: value.label.slice(0, 120) };
    }
    if (value.kind === 'local' && typeof value.name === 'string') return { kind: 'local', name: value.name.slice(0, 200) };
  } catch {
    // Remembering the last source is a convenience only.
  }
  return null;
}

function writeLast(value: LastSource | null): void {
  try {
    if (value) window.localStorage.setItem(LAST_SOURCE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(LAST_SOURCE_KEY);
  } catch {
    // Remembering the last source is a convenience only.
  }
}

/**
 * Opening a source for the Studio: a public GitHub repository (through
 * POST /api/blueprint/open), a local folder, the last folder, or the bundled
 * sample. Remembers the last source so a reload can offer it again.
 */
export function useSourceActions(session: BlueprintSession) {
  const [busy, setBusy] = useState<null | 'github' | 'folder' | 'reopen' | 'sample'>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<LastSource | null>(null);
  const [lastFolder, setLastFolder] = useState<string | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; });

  const remember = useCallback((value: LastSource | null) => {
    writeLast(value);
    setLast(value);
  }, []);

  const refreshLastFolder = useCallback(async () => {
    try {
      const handle = await recallLocalFolder();
      setLastFolder(handle?.name ?? null);
    } catch {
      setLastFolder(null);
    }
  }, []);

  useEffect(() => {
    setLast(readLast());
    void refreshLastFolder();
  }, [refreshLastFolder]);

  const run = useCallback(async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setError(null);
    setBusy(kind);
    try {
      await action();
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === 'AbortError')) {
        setError(failure instanceof Error && failure.message ? failure.message : 'That did not work. Try again.');
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const openRepository = useCallback((input: string) => run('github', async () => {
    const url = normalizeRepositoryUrl(input);
    if (!url) throw new Error(OPEN_ERRORS.INVALID_GITHUB_URL);
    const opened = await requestOpen(url);
    const current = sessionRef.current;
    current.configureLive({
      getSourceGrant: async (sha) => {
        try {
          return (await requestOpen(url, sha)).sourceGrant;
        } catch {
          return null;
        }
      },
    });
    await current.loadFromGitHub({
      owner: opened.owner,
      repo: opened.repo,
      commitSha: opened.commitSha,
      sourceGrant: opened.sourceGrant,
      ref: opened.defaultBranch,
    });
    remember({ kind: 'github', url, label: `${opened.owner}/${opened.repo}` });
  }), [remember, run]);

  const openFolder = useCallback(() => run('folder', async () => {
    await sessionRef.current.openLocalFolder();
    await refreshLastFolder();
    remember(null);
  }), [refreshLastFolder, remember, run]);

  const reopenFolder = useCallback(() => run('reopen', async () => {
    const ok = await sessionRef.current.reopenLocalFolder();
    if (!ok) throw new Error('The folder could not be reopened. The browser needs permission again: open the folder from the picker.');
    remember(null);
  }), [remember, run]);

  const trySample = useCallback(() => run('sample', async () => {
    await openSample(sessionRef.current);
    remember({ kind: 'sample' });
  }), [remember, run]);

  const startEmpty = useCallback((name = 'Untitled system') => {
    setError(null);
    sessionRef.current.startEmpty(name);
    remember(null);
  }, [remember]);

  const forget = useCallback(() => remember(null), [remember]);

  return { busy, error, clearError: () => setError(null), last, lastFolder, openRepository, openFolder, reopenFolder, trySample, startEmpty, forget };
}

export type SourceActions = ReturnType<typeof useSourceActions>;
export { SAMPLE_NAME };
