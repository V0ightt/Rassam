import type { EvidenceRef } from '@/lib/contracts';

/** A source location that can be handed from graph, chat, or explorer UI to the editor. */
export interface SourceLocation {
  path: string;
  startLine?: number;
  endLine?: number;
  /** Present for evidence-backed locations so consumers can verify pinned content. */
  blobSha?: string;
}

export type SourceLocationNavigationHandler = (location: SourceLocation) => void;

const LINE_SUFFIX = /:(\d+)(?:-(\d+))?$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;
const WELL_KNOWN_SOURCE_FILES = new Set([
  'dockerfile',
  'makefile',
  'procfile',
  'readme',
  'license',
]);
const SOURCE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'cts', 'env', 'fs', 'fsx', 'go', 'graphql',
  'gql', 'h', 'hpp', 'html', 'java', 'js', 'json', 'jsx', 'kt', 'kts', 'lock',
  'md', 'mdx', 'mjs', 'mts', 'php', 'prisma', 'py', 'rb', 'rs', 'rst', 'sass',
  'scala', 'scss', 'sh', 'sql', 'svelte', 'swift', 'toml', 'ts', 'tsx', 'txt',
  'vue', 'xml', 'yaml', 'yml',
]);

function hasSourceLikeName(path: string): boolean {
  const basename = path.split('/').at(-1)?.toLowerCase() ?? '';
  const extension = basename.includes('.') ? basename.split('.').at(-1) : undefined;
  return WELL_KNOWN_SOURCE_FILES.has(basename)
    || (extension !== undefined && SOURCE_EXTENSIONS.has(extension));
}

function isSafeRelativeRepositoryPath(path: string): boolean {
  if (
    path.length === 0
    || path.length > 4_096
    || path !== path.trim()
    || path.startsWith('/')
    || path.startsWith('\\')
    || path.includes('\\')
    || path.includes(':')
    || CONTROL_CHARACTERS.test(path)
    || URI_SCHEME.test(path)
    || WINDOWS_DRIVE.test(path)
  ) {
    return false;
  }

  const segments = path.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isSourceReferenceCandidate(path: string): boolean {
  return isSafeRelativeRepositoryPath(path) && hasSourceLikeName(path);
}

function parsePositiveLine(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const line = Number(value);
  return Number.isSafeInteger(line) && line > 0 ? line : undefined;
}

/**
 * Parses the shared repository navigation notation: `path`, `path:line`, or
 * `path:start-end`. Absolute paths, URLs, traversal segments, and invalid ranges
 * are rejected because this contract always refers to a repository-relative path.
 */
export function parseSourceLocation(value: string): SourceLocation | null {
  const input = value.trim();
  if (!input || input !== value) return null;

  const lineMatch = input.match(LINE_SUFFIX);
  const path = lineMatch ? input.slice(0, -lineMatch[0].length) : input;
  const startLine = parsePositiveLine(lineMatch?.[1]);
  const endLine = parsePositiveLine(lineMatch?.[2]);

  if (!isSourceReferenceCandidate(path)) return null;
  if (lineMatch && startLine === undefined) return null;
  if (lineMatch?.[2] !== undefined && endLine === undefined) return null;
  if (startLine !== undefined && endLine !== undefined && endLine < startLine) return null;

  return {
    path,
    ...(startLine === undefined ? {} : { startLine }),
    ...(endLine === undefined ? {} : { endLine }),
  };
}

export function formatSourceLocation(location: SourceLocation): string {
  if (location.startLine === undefined) return location.path;
  const range = location.endLine !== undefined && location.endLine !== location.startLine
    ? `-${location.endLine}`
    : '';
  return `${location.path}:${location.startLine}${range}`;
}

export function sourceLocationFromEvidence(evidence: EvidenceRef): SourceLocation {
  const startLine = Number.isSafeInteger(evidence.startLine) && (evidence.startLine ?? 0) > 0
    ? evidence.startLine
    : undefined;
  const endLine = startLine !== undefined
    && Number.isSafeInteger(evidence.endLine)
    && (evidence.endLine ?? 0) >= startLine
    ? evidence.endLine
    : undefined;

  return {
    path: evidence.path,
    blobSha: evidence.blobSha,
    ...(startLine === undefined ? {} : { startLine }),
    ...(endLine === undefined ? {} : { endLine }),
  };
}

export function isNavigableSourceLocation(location: SourceLocation): boolean {
  if (!isSafeRelativeRepositoryPath(location.path)) return false;
  if (location.startLine !== undefined && (!Number.isSafeInteger(location.startLine) || location.startLine <= 0)) return false;
  if (location.endLine !== undefined) {
    if (location.startLine === undefined) return false;
    if (!Number.isSafeInteger(location.endLine) || location.endLine < location.startLine) return false;
  }
  return true;
}

export function describeSourceLocation(location: SourceLocation): string {
  if (location.startLine === undefined) return `Open ${location.path}`;
  if (location.endLine !== undefined && location.endLine !== location.startLine) {
    return `Open ${location.path}, lines ${location.startLine} to ${location.endLine}`;
  }
  return `Open ${location.path}, line ${location.startLine}`;
}
