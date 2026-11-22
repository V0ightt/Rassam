import type { RepoDetails } from '@/types';
import { isNavigableSourceLocation, type SourceLocation } from './source-location';

export const HIGHLIGHT_MAX_BYTES = 512 * 1024;
export const HIGHLIGHT_MAX_LINES = 10_000;

const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;

export interface FileRevisionExpectation {
  expectedCommitSha?: string;
  expectedBlobSha?: string;
}

export interface FileRevisionActual {
  actualCommitSha?: string;
  actualBlobSha?: string;
}

export interface FileRevisionVerification {
  verified: boolean;
  error?: string;
}

function sameSha(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Verifies that source returned by the cache or API still belongs to the pinned
 * repository revision and, when known, to the exact evidence blob.
 */
export function verifyFileRevision(
  expectation: FileRevisionExpectation,
  actual: FileRevisionActual,
): FileRevisionVerification {
  if (expectation.expectedCommitSha) {
    if (!actual.actualCommitSha) {
      return { verified: false, error: 'The file response did not identify its pinned commit.' };
    }
    if (!sameSha(expectation.expectedCommitSha, actual.actualCommitSha)) {
      return { verified: false, error: 'The file response belongs to a different repository revision.' };
    }
  }

  if (expectation.expectedBlobSha) {
    if (!actual.actualBlobSha) {
      return { verified: false, error: 'The file response did not identify its source blob.' };
    }
    if (!sameSha(expectation.expectedBlobSha, actual.actualBlobSha)) {
      return { verified: false, error: 'The evidence points to a different source blob at this path.' };
    }
  }

  return {
    verified: Boolean(expectation.expectedCommitSha || expectation.expectedBlobSha),
  };
}

export function shouldUsePlainTextViewer(input: {
  supportsHighlighting: boolean;
  sizeBytes: number;
  lineCount: number;
}): boolean {
  return !input.supportsHighlighting
    || input.sizeBytes > HIGHLIGHT_MAX_BYTES
    || input.lineCount > HIGHLIGHT_MAX_LINES;
}

function encodeRepositoryPath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

/** Build a pinned GitHub blob URL. Moving branch names are never used. */
export function buildPinnedGitHubFileUrl(
  repoDetails: Pick<RepoDetails, 'owner' | 'repo' | 'commitSha'> | null | undefined,
  location: SourceLocation,
): string | null {
  if (!repoDetails?.owner || !repoDetails.repo || !repoDetails.commitSha) return null;
  if (!FULL_GIT_SHA.test(repoDetails.commitSha)) return null;
  if (!isNavigableSourceLocation(location)) return null;

  const owner = encodeURIComponent(repoDetails.owner);
  const repo = encodeURIComponent(repoDetails.repo);
  const commit = repoDetails.commitSha.toLowerCase();
  const lineFragment = location.startLine === undefined
    ? ''
    : location.endLine !== undefined && location.endLine !== location.startLine
      ? `#L${location.startLine}-L${location.endLine}`
      : `#L${location.startLine}`;

  return `https://github.com/${owner}/${repo}/blob/${commit}/${encodeRepositoryPath(location.path)}${lineFragment}`;
}

export function clampSourceLocation(
  location: SourceLocation | undefined,
  lineCount: number,
): SourceLocation | undefined {
  if (!location || lineCount <= 0) return undefined;
  if (location.startLine === undefined) return { ...location };

  const startLine = Math.min(Math.max(1, location.startLine), lineCount);
  const endLine = Math.min(
    Math.max(startLine, location.endLine ?? startLine),
    lineCount,
  );
  return {
    ...location,
    startLine,
    ...(location.endLine === undefined ? {} : { endLine }),
  };
}
