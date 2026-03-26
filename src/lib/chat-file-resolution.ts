export type FileResolutionStrategy =
  | 'exact'
  | 'case-insensitive'
  | 'basename'
  | 'suffix'
  | 'contains'
  | 'ambiguous'
  | 'missing';

export type FileResolutionResult =
  | {
      status: 'resolved';
      requestedPath: string;
      resolvedPath: string;
      resolutionStrategy: Exclude<FileResolutionStrategy, 'ambiguous' | 'missing'>;
    }
  | {
      status: 'ambiguous';
      requestedPath: string;
      resolvedPath: null;
      resolutionStrategy: 'ambiguous';
      candidates: string[];
    }
  | {
      status: 'missing';
      requestedPath: string;
      resolvedPath: null;
      resolutionStrategy: 'missing';
    };

const DEFAULT_FILE_LIMIT = 2000;
const MAX_AMBIGUOUS_CANDIDATES = 10;

export function normalizeRepoPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
}

export function sanitizeAvailableFiles(input: unknown, limit = DEFAULT_FILE_LIMIT): string[] {
  if (!Array.isArray(input) || limit <= 0) return [];

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const entry of input) {
    if (typeof entry !== 'string') continue;
    const normalized = normalizeRepoPath(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    sanitized.push(normalized);
    if (sanitized.length >= limit) break;
  }

  return sanitized;
}

function buildMatchResult(
  requestedPath: string,
  matches: string[],
  strategy: Exclude<FileResolutionStrategy, 'ambiguous' | 'missing'>,
): FileResolutionResult | null {
  if (matches.length === 1) {
    return {
      status: 'resolved',
      requestedPath,
      resolvedPath: matches[0],
      resolutionStrategy: strategy,
    };
  }

  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      requestedPath,
      resolvedPath: null,
      resolutionStrategy: 'ambiguous',
      candidates: matches.slice(0, MAX_AMBIGUOUS_CANDIDATES),
    };
  }

  return null;
}

export function resolveAvailableFilePath(
  requestedPath: string,
  availableFiles: string[],
): FileResolutionResult {
  const normalizedRequested = normalizeRepoPath(requestedPath);
  if (!normalizedRequested) {
    return {
      status: 'missing',
      requestedPath,
      resolvedPath: null,
      resolutionStrategy: 'missing',
    };
  }

  const files = sanitizeAvailableFiles(availableFiles, Number.MAX_SAFE_INTEGER);
  if (!files.length) {
    return {
      status: 'missing',
      requestedPath: normalizedRequested,
      resolvedPath: null,
      resolutionStrategy: 'missing',
    };
  }

  const requestedLower = normalizedRequested.toLowerCase();
  const requestedBaseName = normalizedRequested.split('/').pop()?.toLowerCase() || requestedLower;

  const exact = buildMatchResult(
    normalizedRequested,
    files.filter((path) => path === normalizedRequested),
    'exact',
  );
  if (exact) return exact;

  const caseInsensitive = buildMatchResult(
    normalizedRequested,
    files.filter((path) => path.toLowerCase() === requestedLower),
    'case-insensitive',
  );
  if (caseInsensitive) return caseInsensitive;

  const basename = buildMatchResult(
    normalizedRequested,
    files.filter((path) => (path.split('/').pop()?.toLowerCase() || '') === requestedBaseName),
    'basename',
  );
  if (basename) return basename;

  const suffix = buildMatchResult(
    normalizedRequested,
    files.filter((path) => {
      const lower = path.toLowerCase();
      return lower.endsWith(`/${requestedLower}`) || lower.endsWith(requestedLower);
    }),
    'suffix',
  );
  if (suffix) return suffix;

  const contains = buildMatchResult(
    normalizedRequested,
    files.filter((path) => path.toLowerCase().includes(requestedLower)),
    'contains',
  );
  if (contains) return contains;

  return {
    status: 'missing',
    requestedPath: normalizedRequested,
    resolvedPath: null,
    resolutionStrategy: 'missing',
  };
}
