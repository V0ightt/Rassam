/**
 * IndexedDB-based file content cache, keyed per project.
 *
 * Each record stores the full text of a single file.
 * The DB has a single object store with a composite key [projectId, filePath].
 */

const DB_NAME = 'rassam_file_store';
const DB_VERSION = 1;
const STORE_NAME = 'files';

// ── helpers ───────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: ['projectId', 'filePath'] });
        store.createIndex('byProject', 'projectId', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── public API ────────────────────────────────────────────────

/** Store (or overwrite) the content for one file. */
export async function cacheFile(projectId: string, filePath: string, content: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      projectId,
      filePath,
      content,
      fetchedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Retrieve the cached content for one file (or null). */
export async function getCachedFile(projectId: string, filePath: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get([projectId, filePath]);
    req.onsuccess = () => resolve(req.result?.content ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Get contents for multiple files in one transaction. */
export async function getCachedFiles(
  projectId: string,
  filePaths: string[],
): Promise<Record<string, string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result: Record<string, string> = {};
    let remaining = filePaths.length;

    if (remaining === 0) { resolve(result); return; }

    for (const fp of filePaths) {
      const req = store.get([projectId, fp]);
      req.onsuccess = () => {
        if (req.result?.content) result[fp] = req.result.content;
        if (--remaining === 0) resolve(result);
      };
      req.onerror = () => {
        if (--remaining === 0) resolve(result);
      };
    }

    tx.onerror = () => reject(tx.error);
  });
}

/** Return the set of file paths that are already cached for a project. */
export async function getCachedPaths(projectId: string): Promise<Set<string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const idx = tx.objectStore(STORE_NAME).index('byProject');
    const req = idx.getAllKeys(IDBKeyRange.only(projectId));
    req.onsuccess = () => {
      const paths = new Set<string>(
        (req.result as [string, string][]).map(([, fp]) => fp),
      );
      resolve(paths);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete all cached files for a project. */
export async function clearProjectFiles(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('byProject');
    const req = idx.openCursor(IDBKeyRange.only(projectId));

    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
