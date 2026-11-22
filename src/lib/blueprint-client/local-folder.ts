// Local folders through the browser File System Access API (Chromium).
// Reads a repository snapshot for the blueprint engine and writes
// `.rassam/blueprint.json` / `.rassam/layout.json` back into the user's repo.
// Folder content is untrusted: it is only ever parsed, never executed, and
// `.env*` contents are never read.

import { MAX_ANALYZED_FILE_BYTES } from "@/blueprint/constants";
import { compileGlob, type GlobMatcher } from "@/blueprint/glob";
import { isIgnoredPath } from "@/blueprint/imports";
import { BLUEPRINT_DIR, BLUEPRINT_LAYOUT_PATH, BLUEPRINT_PATH } from "@/blueprint/schema";
import type { SourceFile } from "@/blueprint/types";

import { deleteDirectoryHandle, loadDirectoryHandle, saveDirectoryHandle } from "./drafts";
import { contentCategory, isBlueprintFilePath, isEnvFilePath } from "./select";

export const MAX_LOCAL_FILES = 20_000;
const BINARY_SNIFF_BYTES = 8 * 1024;
const READ_CONCURRENCY = 8;
const MAX_GITIGNORE_BYTES = 256 * 1024;
const MAX_GITIGNORE_RULES = 2_000;

// ── Structural handle types ───────────────────────────────────
// The File System Access API is not fully covered by TypeScript's DOM lib, so
// the subset used here is declared structurally. Real handles satisfy it.

export type LocalPermissionMode = "read" | "readwrite";
export type LocalPermissionState = "granted" | "denied" | "prompt";

export interface LocalFileLike {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface LocalWritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

export interface LocalFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<LocalFileLike>;
  createWritable?(options?: { keepExistingData?: boolean }): Promise<LocalWritableLike>;
}

export interface LocalDirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<LocalFileHandle | LocalDirectoryHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<LocalDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalFileHandle>;
  queryPermission?(descriptor: { mode: LocalPermissionMode }): Promise<LocalPermissionState>;
  requestPermission?(descriptor: { mode: LocalPermissionMode }): Promise<LocalPermissionState>;
}

export type LocalFolderErrorCode =
  | "unsupported"
  | "permission-denied"
  | "too-many-files"
  | "blueprint-unreadable"
  | "read-failed"
  | "write-failed";

export class LocalFolderError extends Error {
  constructor(public readonly code: LocalFolderErrorCode, message: string) {
    super(message);
    this.name = "LocalFolderError";
  }
}

export type PickLocalFolderResult =
  | { status: "picked"; handle: LocalDirectoryHandle }
  | { status: "cancelled" }
  | { status: "unsupported"; reason: string };

export interface LocalSnapshotProgress {
  phase: "scanning" | "reading";
  completed: number;
  total?: number;
}

export interface LocalSnapshot {
  name: string;
  files: SourceFile[];
  /** Text of `.rassam/blueprint.json`, or null when the folder has none. */
  blueprintText: string | null;
  /** Text of `.rassam/layout.json`, or null when the folder has none. */
  layoutText: string | null;
  stats: { filesListed: number; filesRead: number; bytes: number };
}

const UNSUPPORTED_REASON =
  "This browser cannot open local folders. Use a Chromium browser (Chrome, Edge, Brave, Arc) over HTTPS or localhost.";

type DirectoryPicker = (options?: { id?: string; mode?: LocalPermissionMode }) => Promise<LocalDirectoryHandle>;

function directoryPicker(): DirectoryPicker | null {
  if (typeof window === "undefined") return null;
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  return typeof picker === "function" ? picker.bind(window) : null;
}

export function isLocalFolderSupported(): boolean {
  return directoryPicker() !== null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function abortError(): Error {
  if (typeof DOMException === "function") return new DOMException("The folder scan was cancelled.", "AbortError");
  const error = new Error("The folder scan was cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

/** Ask the user for a folder. Must be called from a user gesture. */
export async function pickLocalFolder(): Promise<PickLocalFolderResult> {
  const picker = directoryPicker();
  if (!picker) return { status: "unsupported", reason: UNSUPPORTED_REASON };
  try {
    const handle = await picker({ id: "rassam-blueprint", mode: "read" });
    return { status: "picked", handle };
  } catch (error) {
    if (isAbortError(error)) return { status: "cancelled" };
    const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
    if (name === "SecurityError" || name === "NotAllowedError") {
      throw new LocalFolderError("permission-denied", "The browser blocked access to that folder. Choose a different folder or allow access when prompted.");
    }
    throw new LocalFolderError("read-failed", "The folder could not be opened.");
  }
}

/**
 * True when the handle currently has (or, with `request`, the user grants)
 * the given permission. Requesting needs a user gesture.
 */
export async function verifyPermission(
  handle: LocalDirectoryHandle,
  mode: LocalPermissionMode,
  options: { request?: boolean } = {},
): Promise<boolean> {
  const request = options.request ?? true;
  try {
    if (typeof handle.queryPermission === "function") {
      if ((await handle.queryPermission({ mode })) === "granted") return true;
    } else if (typeof handle.requestPermission !== "function") {
      // No permission model on this handle: reads work, writes are unknown
      // until attempted.
      return true;
    }
    if (!request || typeof handle.requestPermission !== "function") return false;
    return (await handle.requestPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

/** Current permission without prompting. */
export async function queryPermissionState(
  handle: LocalDirectoryHandle,
  mode: LocalPermissionMode,
): Promise<LocalPermissionState> {
  try {
    if (typeof handle.queryPermission !== "function") return "prompt";
    return await handle.queryPermission({ mode });
  } catch {
    return "denied";
  }
}

// ── .gitignore (root only, simple line patterns) ──────────────

interface IgnoreRule {
  matcher: GlobMatcher;
  negate: boolean;
  directoryOnly: boolean;
}

export function compileGitignore(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (rules.length >= MAX_GITIGNORE_RULES) break;
    let line = rawLine.trim();
    if (!line || line.startsWith("#") || line.length > 500) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1).trim();
    const directoryOnly = line.endsWith("/");
    if (directoryOnly) line = line.replace(/\/+$/, "");
    if (!line || line === "/") continue;
    try {
      rules.push({ matcher: compileGlob(line), negate, directoryOnly });
    } catch {
      // Unsupported pattern syntax: skip the line.
    }
  }
  return rules;
}

function gitignored(rules: readonly IgnoreRule[], path: string, isDirectory: boolean): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    if (rule.matcher.test(path)) ignored = !rule.negate;
  }
  return ignored;
}

// ── Reading ───────────────────────────────────────────────────

async function readText(handle: LocalFileHandle, maxBytes: number): Promise<{ content: string | null; size: number }> {
  const file = await handle.getFile();
  const size = file.size;
  if (size > maxBytes) return { content: null, size };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniff = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < sniff; index += 1) {
    if (bytes[index] === 0) return { content: null, size };
  }
  try {
    return { content: new TextDecoder("utf-8", { fatal: true }).decode(bytes), size };
  } catch {
    return { content: null, size };
  }
}

async function readOptionalRootFile(root: LocalDirectoryHandle, name: string, maxBytes: number): Promise<string | null> {
  try {
    const handle = await root.getFileHandle(name);
    return (await readText(handle, maxBytes)).content;
  } catch {
    return null;
  }
}

interface ListedFile {
  path: string;
  handle: LocalFileHandle;
}

async function listFiles(
  root: LocalDirectoryHandle,
  rules: readonly IgnoreRule[],
  options: { onProgress?: (progress: LocalSnapshotProgress) => void; signal?: AbortSignal },
): Promise<ListedFile[]> {
  const listed: ListedFile[] = [];
  const queue: Array<{ handle: LocalDirectoryHandle; prefix: string }> = [{ handle: root, prefix: "" }];
  while (queue.length > 0) {
    throwIfAborted(options.signal);
    const current = queue.shift() as { handle: LocalDirectoryHandle; prefix: string };
    let entries: AsyncIterable<LocalFileHandle | LocalDirectoryHandle>;
    try {
      entries = current.handle.values();
    } catch {
      continue;
    }
    try {
      for await (const entry of entries) {
        const name = entry.name;
        if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) continue;
        const path = current.prefix ? `${current.prefix}/${name}` : name;
        if (entry.kind === "directory") {
          // Decide before descending so node_modules, .git, dist, ... are never walked.
          if (isIgnoredPath(`${path}/_`) || gitignored(rules, path, true)) continue;
          queue.push({ handle: entry, prefix: path });
          continue;
        }
        if (!isBlueprintFilePath(path) && (isIgnoredPath(path) || gitignored(rules, path, false))) continue;
        listed.push({ path, handle: entry });
        if (listed.length > MAX_LOCAL_FILES) {
          throw new LocalFolderError(
            "too-many-files",
            `This folder has more than ${MAX_LOCAL_FILES.toLocaleString("en-US")} files after ignore rules. Open a smaller folder or add build output to .gitignore.`,
          );
        }
        if (listed.length % 250 === 0) {
          throwIfAborted(options.signal);
          options.onProgress?.({ phase: "scanning", completed: listed.length });
        }
      }
    } catch (error) {
      if (error instanceof LocalFolderError || isAbortError(error)) throw error;
      // An unreadable directory (permissions, removed mid-scan) is skipped.
      if (current.prefix === "") {
        throw new LocalFolderError("read-failed", "The folder could not be read. Check that the browser still has access to it.");
      }
    }
  }
  listed.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return listed;
}

/**
 * Walk the folder and read what the blueprint engine needs: source files,
 * agent configuration, resolution manifests and the blueprint files. Other
 * paths are listed with `content: null`.
 */
export async function readLocalSnapshot(
  handle: LocalDirectoryHandle,
  options: { onProgress?: (progress: LocalSnapshotProgress) => void; signal?: AbortSignal } = {},
): Promise<LocalSnapshot> {
  throwIfAborted(options.signal);
  const gitignoreText = await readOptionalRootFile(handle, ".gitignore", MAX_GITIGNORE_BYTES);
  const rules = gitignoreText ? compileGitignore(gitignoreText) : [];

  options.onProgress?.({ phase: "scanning", completed: 0 });
  const listed = await listFiles(handle, rules, options);
  options.onProgress?.({ phase: "scanning", completed: listed.length });

  const files: SourceFile[] = new Array<SourceFile>(listed.length);
  const readable: number[] = [];
  listed.forEach((entry, index) => {
    files[index] = { path: entry.path, content: null };
    // `.env*` is listed (so tripwires can see it) but its handle is never opened.
    if (!isEnvFilePath(entry.path) && contentCategory(entry.path) !== null) readable.push(index);
  });

  let completed = 0;
  let filesRead = 0;
  let bytes = 0;
  let cursor = 0;
  options.onProgress?.({ phase: "reading", completed: 0, total: readable.length });
  const worker = async (): Promise<void> => {
    while (cursor < readable.length) {
      throwIfAborted(options.signal);
      const index = readable[cursor];
      cursor += 1;
      const entry = listed[index];
      try {
        const result = await readText(entry.handle, MAX_ANALYZED_FILE_BYTES);
        files[index] = { path: entry.path, content: result.content, size: result.size };
        if (result.content !== null) {
          filesRead += 1;
          bytes += result.size;
        }
      } catch {
        files[index] = { path: entry.path, content: null };
      }
      completed += 1;
      if (completed % 50 === 0 || completed === readable.length) {
        options.onProgress?.({ phase: "reading", completed, total: readable.length });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, Math.max(1, readable.length)) }, worker));
  throwIfAborted(options.signal);

  const blueprintFile = files.find((file) => file.path === BLUEPRINT_PATH);
  if (blueprintFile && blueprintFile.content === null) {
    throw new LocalFolderError(
      "blueprint-unreadable",
      `${BLUEPRINT_PATH} exists but could not be read as text (it is too large, binary or locked).`,
    );
  }
  const layoutFile = files.find((file) => file.path === BLUEPRINT_LAYOUT_PATH);

  return {
    name: handle.name,
    files,
    blueprintText: blueprintFile?.content ?? null,
    layoutText: layoutFile?.content ?? null,
    stats: { filesListed: listed.length, filesRead, bytes },
  };
}

// ── Writing ───────────────────────────────────────────────────

async function writeRassamFile(root: LocalDirectoryHandle, fileName: string, text: string): Promise<void> {
  if (!(await verifyPermission(root, "readwrite", { request: true }))) {
    throw new LocalFolderError("permission-denied", "Rassam needs permission to edit files in this folder. Allow write access when the browser asks, then save again.");
  }
  let writable: LocalWritableLike | undefined;
  try {
    const directory = await root.getDirectoryHandle(BLUEPRINT_DIR, { create: true });
    const file = await directory.getFileHandle(fileName, { create: true });
    if (typeof file.createWritable !== "function") {
      throw new LocalFolderError("unsupported", "This browser cannot write files into a local folder. Download the blueprint instead.");
    }
    writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  } catch (error) {
    if (writable?.abort) await writable.abort().catch(() => undefined);
    if (error instanceof LocalFolderError) throw error;
    const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new LocalFolderError("permission-denied", "The browser refused to write into this folder. Allow write access and save again.");
    }
    throw new LocalFolderError("write-failed", `Could not write ${BLUEPRINT_DIR}/${fileName}. Check that the folder still exists and is not read-only.`);
  }
}

/** Write `.rassam/blueprint.json`, creating `.rassam/` when needed. */
export function writeBlueprintFile(handle: LocalDirectoryHandle, text: string): Promise<void> {
  return writeRassamFile(handle, BLUEPRINT_PATH.slice(BLUEPRINT_DIR.length + 1), text);
}

/** Write `.rassam/layout.json`, creating `.rassam/` when needed. */
export function writeLayoutFile(handle: LocalDirectoryHandle, text: string): Promise<void> {
  return writeRassamFile(handle, BLUEPRINT_LAYOUT_PATH.slice(BLUEPRINT_DIR.length + 1), text);
}

// ── Remembering the folder across reloads ─────────────────────

export function rememberLocalFolder(handle: LocalDirectoryHandle): Promise<boolean> {
  return saveDirectoryHandle(handle);
}

export async function recallLocalFolder(): Promise<LocalDirectoryHandle | null> {
  const record = await loadDirectoryHandle<LocalDirectoryHandle>();
  const handle = record?.handle;
  if (!handle || typeof handle !== "object" || handle.kind !== "directory" || typeof handle.values !== "function") return null;
  return handle;
}

export function forgetLocalFolder(): Promise<boolean> {
  return deleteDirectoryHandle();
}
