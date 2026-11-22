/**
 * Revision-aware IndexedDB file cache, keyed by [projectId, filePath].
 *
 * Version 2 upgrades the original content-only records in place. Existing
 * callers can keep using cacheFile(projectId, path, content), while repository
 * ingestion can attach commit/blob metadata when it becomes available.
 */

const DB_NAME = 'rassam_file_store';
const DB_VERSION = 2;
const STORE_NAME = 'files';
const PROJECT_INDEX = 'byProject';
const LAST_ACCESS_INDEX = 'byLastAccessAt';

export const DEFAULT_FILE_CACHE_LIMIT_BYTES = 100 * 1024 * 1024;

export interface CacheFileOptions {
  commitSha?: string;
  blobSha?: string;
  sizeBytes?: number;
  isText?: boolean;
  fetchedAt?: string;
}

export interface CachedFileRecord {
  projectId: string;
  filePath: string;
  content: string;
  commitSha?: string;
  blobSha?: string;
  sizeBytes: number;
  isText: boolean;
  fetchedAt: string;
  lastAccessAt: string;
}

export interface FileCacheStats {
  count: number;
  sizeBytes: number;
  limitBytes: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function contentSize(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

function normalizedRecord(record: Partial<CachedFileRecord> & {
  projectId: string;
  filePath: string;
  content: string;
}): CachedFileRecord {
  const now = new Date().toISOString();
  return {
    projectId: record.projectId,
    filePath: record.filePath,
    content: record.content,
    commitSha: record.commitSha,
    blobSha: record.blobSha,
    sizeBytes: Number.isFinite(record.sizeBytes) && (record.sizeBytes ?? -1) >= 0
      ? record.sizeBytes as number
      : contentSize(record.content),
    isText: typeof record.isText === 'boolean' ? record.isText : true,
    fetchedAt: typeof record.fetchedAt === 'string' ? record.fetchedAt : now,
    lastAccessAt: typeof record.lastAccessAt === 'string' ? record.lastAccessAt : now,
  };
}

export function isCachedFileForRevision(
  record: Pick<CachedFileRecord, 'commitSha'>,
  expectedCommitSha?: string,
): boolean {
  return !expectedCommitSha
    || record.commitSha?.toLowerCase() === expectedCommitSha.toLowerCase();
}

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser context.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let rejectedAsBlocked = false;

    request.onupgradeneeded = () => {
      const db = request.result;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: ['projectId', 'filePath'] });
      } else {
        store = request.transaction!.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains(PROJECT_INDEX)) {
        store.createIndex(PROJECT_INDEX, 'projectId', { unique: false });
      }
      if (!store.indexNames.contains(LAST_ACCESS_INDEX)) {
        store.createIndex(LAST_ACCESS_INDEX, 'lastAccessAt', { unique: false });
      }

      // Normalize v1 records inside the upgrade transaction. This is copy-safe:
      // the browser rolls the whole schema/data upgrade back if it is interrupted.
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const value = cursor.value as Partial<CachedFileRecord>;
        if (
          typeof value.projectId === 'string' &&
          typeof value.filePath === 'string' &&
          typeof value.content === 'string'
        ) {
          cursor.update(normalizedRecord({
            ...value,
            projectId: value.projectId,
            filePath: value.filePath,
            content: value.content,
          }));
        }
        cursor.continue();
      };
    };

    request.onsuccess = () => {
      const db = request.result;
      if (rejectedAsBlocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Failed to open the file cache.'));
    };
    request.onblocked = () => {
      rejectedAsBlocked = true;
      databasePromise = null;
      reject(new Error('File cache upgrade is blocked by another open tab.'));
    };
  });

  return databasePromise;
}

/** Store (or overwrite) one file and enforce the global LRU budget. */
export async function cacheFile(
  projectId: string,
  filePath: string,
  content: string,
  options: CacheFileOptions = {},
): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get([projectId, filePath]);

    request.onsuccess = () => {
      const previous = request.result as CachedFileRecord | undefined;
      store.put(normalizedRecord({
        ...previous,
        projectId,
        filePath,
        content,
        commitSha: options.commitSha ?? previous?.commitSha,
        blobSha: options.blobSha ?? previous?.blobSha,
        sizeBytes: options.sizeBytes ?? contentSize(content),
        isText: options.isText ?? previous?.isText ?? true,
        fetchedAt: options.fetchedAt ?? now,
        lastAccessAt: now,
      }));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to cache file.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('File cache write was aborted.'));
  });

  await enforceFileCacheLimit();
}

/** Retrieve the full cache record and update its LRU access time. */
export async function getCachedFileRecord(
  projectId: string,
  filePath: string,
): Promise<CachedFileRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get([projectId, filePath]);
    let result: CachedFileRecord | null = null;

    request.onsuccess = () => {
      const raw = request.result as CachedFileRecord | undefined;
      if (!raw || typeof raw.content !== 'string') return;
      result = normalizedRecord(raw);
      result.lastAccessAt = new Date().toISOString();
      store.put(result);
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to read cached file.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('File cache read was aborted.'));
  });
}

/** Retrieve the cached text for one file (or null). */
export async function getCachedFile(projectId: string, filePath: string): Promise<string | null> {
  return (await getCachedFileRecord(projectId, filePath))?.content ?? null;
}

/** Get contents for multiple files in one LRU-updating transaction. */
export async function getCachedFiles(
  projectId: string,
  filePaths: string[],
  expectedCommitSha?: string,
): Promise<Record<string, string>> {
  if (filePaths.length === 0) return {};
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const result: Record<string, string> = {};
    const accessedAt = new Date().toISOString();

    filePaths.forEach((filePath) => {
      const request = store.get([projectId, filePath]);
      request.onsuccess = () => {
        const raw = request.result as CachedFileRecord | undefined;
        if (!raw || typeof raw.content !== 'string') return;
        const record = normalizedRecord(raw);
        if (!isCachedFileForRevision(record, expectedCommitSha)) return;
        record.lastAccessAt = accessedAt;
        result[filePath] = record.content;
        store.put(record);
      };
    });

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to read cached files.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('File cache read was aborted.'));
  });
}

/** Return cached paths, optionally limited to one immutable repository revision. */
export async function getCachedPaths(
  projectId: string,
  expectedCommitSha?: string,
): Promise<Set<string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).index(PROJECT_INDEX)
      .getAll(IDBKeyRange.only(projectId));
    let paths = new Set<string>();
    request.onsuccess = () => {
      paths = new Set(
        (request.result as CachedFileRecord[])
          .map(normalizedRecord)
          .filter((record) => isCachedFileForRevision(record, expectedCommitSha))
          .map((record) => record.filePath),
      );
    };
    transaction.oncomplete = () => resolve(paths);
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to list cached files.'));
  });
}

/** Return cache size/count globally or for one project. */
export async function getFileCacheStats(projectId?: string): Promise<FileCacheStats> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = projectId
      ? store.index(PROJECT_INDEX).getAll(IDBKeyRange.only(projectId))
      : store.getAll();
    let records: CachedFileRecord[] = [];
    request.onsuccess = () => {
      records = (request.result as CachedFileRecord[]).map(normalizedRecord);
    };
    transaction.oncomplete = () => resolve({
      count: records.length,
      sizeBytes: records.reduce((sum, record) => sum + record.sizeBytes, 0),
      limitBytes: DEFAULT_FILE_CACHE_LIMIT_BYTES,
    });
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to inspect file cache.'));
  });
}

export async function getProjectCacheSize(projectId: string): Promise<number> {
  return (await getFileCacheStats(projectId)).sizeBytes;
}

/** Pure LRU selection used by eviction and deterministic unit tests. */
export function selectFileCacheEvictions(
  records: readonly CachedFileRecord[],
  maxBytes = DEFAULT_FILE_CACHE_LIMIT_BYTES,
): Array<{ projectId: string; filePath: string }> {
  const safeLimit = Number.isFinite(maxBytes)
    ? Math.max(0, maxBytes)
    : DEFAULT_FILE_CACHE_LIMIT_BYTES;
  const oldestFirst = records
    .map(normalizedRecord)
    .sort((left, right) => left.lastAccessAt.localeCompare(right.lastAccessAt));
  let total = oldestFirst.reduce((sum, record) => sum + record.sizeBytes, 0);
  const removed: Array<{ projectId: string; filePath: string }> = [];

  for (const record of oldestFirst) {
    if (total <= safeLimit) break;
    removed.push({ projectId: record.projectId, filePath: record.filePath });
    total -= record.sizeBytes;
  }
  return removed;
}

/**
 * Evict least-recently-used records until the cache is at or below maxBytes.
 * Returns the keys that were removed, which makes quota handling observable.
 */
export async function enforceFileCacheLimit(
  maxBytes = DEFAULT_FILE_CACHE_LIMIT_BYTES,
): Promise<Array<{ projectId: string; filePath: string }>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    const removed: Array<{ projectId: string; filePath: string }> = [];

    request.onsuccess = () => {
      const evictions = selectFileCacheEvictions(
        request.result as CachedFileRecord[],
        maxBytes,
      );
      for (const eviction of evictions) {
        store.delete([eviction.projectId, eviction.filePath]);
        removed.push(eviction);
      }
    };

    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to enforce file cache limit.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('File cache eviction was aborted.'));
  });
}

/** Delete all cached files for a project. */
export async function clearProjectFiles(projectId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index(PROJECT_INDEX).openKeyCursor(IDBKeyRange.only(projectId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear project files.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('File cache clear was aborted.'));
  });
}

export async function clearFileCache(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear file cache.'));
  });
}

export function closeFileStore(): void {
  void databasePromise?.then((db) => db.close()).catch(() => undefined);
  databasePromise = null;
}
