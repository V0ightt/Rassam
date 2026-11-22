// Browser persistence for blueprint editing sessions. Uses its own Dexie
// database so it can never interfere with the project store. Every function
// fails soft: without IndexedDB (private windows, SSR, tests) drafts are
// simply not persisted.

import Dexie, { type Table } from "dexie";

import type { BlueprintLayout } from "./layout";

export const BLUEPRINT_DRAFT_DB_NAME = "rassam-blueprints";
const LAST_HANDLE_ID = "last";

export interface BlueprintDraftRecord {
  /** `github:owner/repo` or `local:<name>`. */
  sessionKey: string;
  /** Serialized working draft, or null when it equals the saved file. */
  blueprintText: string | null;
  layout: BlueprintLayout;
  /** Text of the repository file the draft was based on (null when none). */
  savedText: string | null;
  /** Origin of the working draft when it was stored. */
  origin?: "repository" | "derived" | "empty";
  updatedAt: number;
}

export interface DirectoryHandleRecord<THandle = unknown> {
  id: string;
  name: string;
  handle: THandle;
  updatedAt: number;
}

class BlueprintDraftDatabase extends Dexie {
  drafts!: Table<BlueprintDraftRecord, string>;
  handles!: Table<DirectoryHandleRecord, string>;

  constructor() {
    super(BLUEPRINT_DRAFT_DB_NAME);
    this.version(1).stores({
      drafts: "sessionKey, updatedAt",
      handles: "id, updatedAt",
    });
  }
}

let database: BlueprintDraftDatabase | null = null;

function getDatabase(): BlueprintDraftDatabase | null {
  if (typeof indexedDB === "undefined") return null;
  if (!database) {
    try {
      database = new BlueprintDraftDatabase();
    } catch {
      return null;
    }
  }
  return database;
}

async function soft<T>(fallback: T, run: (db: BlueprintDraftDatabase) => Promise<T>): Promise<T> {
  const db = getDatabase();
  if (!db) return fallback;
  try {
    return await run(db);
  } catch {
    return fallback;
  }
}

export function githubSessionKey(owner: string, repo: string): string {
  return `github:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function localSessionKey(name: string): string {
  return `local:${name}`;
}

export function loadDraft(sessionKey: string): Promise<BlueprintDraftRecord | null> {
  return soft(null, async (db) => (await db.drafts.get(sessionKey)) ?? null);
}

/** Resolves false when the draft could not be stored. */
export function saveDraft(record: Omit<BlueprintDraftRecord, "updatedAt"> & { updatedAt?: number }): Promise<boolean> {
  return soft(false, async (db) => {
    await db.drafts.put({ ...record, updatedAt: record.updatedAt ?? Date.now() });
    return true;
  });
}

export function deleteDraft(sessionKey: string): Promise<boolean> {
  return soft(false, async (db) => {
    await db.drafts.delete(sessionKey);
    return true;
  });
}

/** Remember the most recently opened local folder (handles are structured-cloneable). */
export function saveDirectoryHandle<THandle extends { name: string }>(handle: THandle): Promise<boolean> {
  return soft(false, async (db) => {
    await db.handles.put({ id: LAST_HANDLE_ID, name: handle.name, handle, updatedAt: Date.now() });
    return true;
  });
}

export function loadDirectoryHandle<THandle = unknown>(): Promise<DirectoryHandleRecord<THandle> | null> {
  return soft(null, async (db) => ((await db.handles.get(LAST_HANDLE_ID)) as DirectoryHandleRecord<THandle> | undefined) ?? null);
}

export function deleteDirectoryHandle(): Promise<boolean> {
  return soft(false, async (db) => {
    await db.handles.delete(LAST_HANDLE_ID);
    return true;
  });
}
