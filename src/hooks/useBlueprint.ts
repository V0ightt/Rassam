
// Session state for the blueprint canvas: loads the observed graph and the
// `.rassam/blueprint.json` contract from GitHub (through /api/blueprint) or a
// local folder (File System Access API), holds the working draft with undo
// history, re-evaluates it on every edit and persists drafts per session.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createWorkspace, type Workspace } from "@/blueprint/workspace";
import {
  emptyBlueprint,
  parseBlueprint,
  parseBlueprintText,
  serializeBlueprint,
  type Blueprint,
  type BlueprintIssue,
} from "@/blueprint/schema";
import { deserializeFileGraph } from "@/blueprint/snapshot";
import type { CheckReport, FileGraph, ReachReport } from "@/blueprint/types";
import { stampVerification } from "@/blueprint/verify";
import { analyzeLocalSnapshotOffThread } from "@/lib/blueprint-client/analysis";
import { describeBlueprintApiError, fetchGitHubBlueprint } from "@/lib/blueprint-client/api";
import {
  deleteDraft,
  githubSessionKey,
  loadDraft,
  localSessionKey,
  saveDraft,
  type BlueprintDraftRecord,
} from "@/lib/blueprint-client/drafts";
import { parseLayout, sanitizeLayout, serializeLayout, type BlueprintLayout } from "@/lib/blueprint-client/layout";
import {
  LocalFolderError,
  pickLocalFolder,
  queryPermissionState,
  readLocalSnapshot,
  recallLocalFolder,
  rememberLocalFolder,
  verifyPermission,
  writeBlueprintFile,
  writeLayoutFile,
  type LocalDirectoryHandle,
} from "@/lib/blueprint-client/local-folder";

export type BlueprintSource =
  | { kind: "github"; owner: string; repo: string; commitSha: string }
  | { kind: "local"; name: string };

export interface BlueprintSessionState {
  status: "idle" | "loading" | "ready" | "error";
  progress: { phase: string; completed?: number; total?: number } | null;
  error: string | null;
  source: BlueprintSource | null;
  /** The working draft (edits apply here). */
  blueprint: Blueprint | null;
  /** Where the draft came from. */
  origin: "repository" | "derived" | "empty" | null;
  /** Text of .rassam/blueprint.json as last loaded or saved; null when the repo has none. */
  savedText: string | null;
  /** Parse issues of the repo file, if any. */
  issues: BlueprintIssue[];
  /** The working draft differs from the saved file (compared in canonical serialization). */
  dirty: boolean;
  /** createWorkspace([], blueprint, { fileGraph, reach }), recomputed on every edit. */
  workspace: Workspace | null;
  /** workspace.check() (full mode), recomputed on every edit. */
  report: CheckReport | null;
  layout: Record<string, { x: number; y: number }>;
  /** A local folder is open and write permission is granted or can be requested. */
  canSaveToDisk: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface BlueprintActions {
  loadFromGitHub(input: { owner: string; repo: string; commitSha: string; sourceGrant: string }): Promise<void>;
  /** Picker, then read, then load. Call from a user gesture. */
  openLocalFolder(): Promise<void>;
  /** Reopen the last folder from its persisted handle. Resolves false when there is none or access is refused. */
  reopenLocalFolder(): Promise<boolean>;
  /** Re-read the source (folder or GitHub) keeping the working draft. */
  rescan(): Promise<void>;
  /** Replace the draft with an empty blueprint over the current graph. */
  startEmpty(name: string): void;
  /** When origin is "derived": keep the derived draft as the working contract (origin becomes "repository"). */
  adoptDraft(): void;
  /** Immutable edit (recipe gets a structuredClone). Invalid results are rejected and set `error`. */
  update(recipe: (draft: Blueprint) => Blueprint | void, label?: string): void;
  setPosition(componentId: string, position: { x: number; y: number }): void;
  /** Stamp a human verification; commit is the source commit for GitHub sources. */
  verify(targetId: string, by: string, note?: string): void;
  undo(): void;
  redo(): void;
  /** Local folders: write blueprint and layout files, then update savedText. */
  saveToDisk(): Promise<void>;
  /** Download the working draft as blueprint.json. */
  download(): void;
  copyToClipboard(): Promise<void>;
  /** Back to the saved file (or the initial derived/empty draft). */
  discardChanges(): void;
  close(): void;
}

const HISTORY_LIMIT = 50;
const PERSIST_DEBOUNCE_MS = 400;

type Origin = NonNullable<BlueprintSessionState["origin"]>;

interface CoreState {
  status: BlueprintSessionState["status"];
  progress: BlueprintSessionState["progress"];
  error: string | null;
  source: BlueprintSource | null;
  blueprint: Blueprint | null;
  origin: Origin | null;
  savedText: string | null;
  /** Canonical serialization of savedText when it parses; otherwise savedText. */
  savedCanonical: string | null;
  issues: BlueprintIssue[];
  layout: BlueprintLayout;
  graph: FileGraph | null;
  reach: ReachReport | null;
  /** What discardChanges returns to. */
  baseline: Blueprint | null;
  baselineOrigin: Origin | null;
  past: Blueprint[];
  future: Blueprint[];
  writable: boolean;
}

const INITIAL: CoreState = {
  status: "idle",
  progress: null,
  error: null,
  source: null,
  blueprint: null,
  origin: null,
  savedText: null,
  savedCanonical: null,
  issues: [],
  layout: {},
  graph: null,
  reach: null,
  baseline: null,
  baselineOrigin: null,
  past: [],
  future: [],
  writable: false,
};

interface LoadedSnapshot {
  source: BlueprintSource;
  graph: FileGraph;
  reach: ReachReport;
  blueprintText: string | null;
  blueprint: Blueprint | null;
  issues: BlueprintIssue[];
  draft: Blueprint | null;
  layout: BlueprintLayout | null;
  writable: boolean;
}

function cloneBlueprint(blueprint: Blueprint): Blueprint {
  return typeof structuredClone === "function"
    ? structuredClone(blueprint)
    : (JSON.parse(JSON.stringify(blueprint)) as Blueprint);
}

function canonicalText(text: string | null): string | null {
  if (text === null) return null;
  const parsed = parseBlueprintText(text);
  return parsed.ok ? serializeBlueprint(parsed.blueprint) : text;
}

function sessionKeyOf(source: BlueprintSource): string {
  return source.kind === "github" ? githubSessionKey(source.owner, source.repo) : localSessionKey(source.name);
}

function describeIssues(issues: BlueprintIssue[]): string {
  const shown = issues.slice(0, 3).map((issue) => (issue.path && issue.path !== "(root)" ? `${issue.path}: ${issue.message}` : issue.message));
  const more = issues.length > shown.length ? ` (and ${issues.length - shown.length} more)` : "";
  return `${shown.join("; ")}${more}`;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof LocalFolderError) return error.message;
  const message = describeBlueprintApiError(error);
  return message || fallback;
}

function emptyGraph(): FileGraph {
  return { files: [], facts: new Map(), edges: [], externals: [], unresolved: [] };
}

export function useBlueprint(): BlueprintSessionState & BlueprintActions {
  const [core, setCore] = useState<CoreState>(INITIAL);
  const coreRef = useRef<CoreState>(INITIAL);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const handleRef = useRef<LocalDirectoryHandle | null>(null);
  const githubInputRef = useRef<{ owner: string; repo: string; commitSha: string; sourceGrant: string } | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<(() => void) | null>(null);

  /** Synchronous store: actions read and write the ref so several calls in one tick compose. */
  const commit = useCallback((next: CoreState | ((previous: CoreState) => CoreState)) => {
    const value = typeof next === "function" ? next(coreRef.current) : next;
    coreRef.current = value;
    if (mountedRef.current) setCore(value);
  }, []);

  const patch = useCallback((partial: Partial<CoreState>) => {
    commit((previous) => ({ ...previous, ...partial }));
  }, [commit]);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const run = pendingPersistRef.current;
    pendingPersistRef.current = null;
    run?.();
  }, []);

  const beginLoad = useCallback((phase: string, keepSession: boolean): AbortController => {
    abortRef.current?.abort();
    flushPersist();
    const controller = new AbortController();
    abortRef.current = controller;
    commit((previous) => (keepSession
      ? { ...previous, status: "loading", progress: { phase }, error: null }
      : { ...INITIAL, status: "loading", progress: { phase } }));
    return controller;
  }, [commit, flushPersist]);

  const isCurrent = useCallback((controller: AbortController) => (
    abortRef.current === controller && !controller.signal.aborted && mountedRef.current
  ), []);

  /** Install a freshly read snapshot, restoring any stored draft for the session. */
  const applySnapshot = useCallback(async (
    snapshot: LoadedSnapshot,
    controller: AbortController,
    keepDraft: boolean,
  ): Promise<void> => {
    const savedText = snapshot.blueprintText;
    const savedCanonical = canonicalText(savedText);
    const baseline = snapshot.blueprint ?? snapshot.draft;
    const baselineOrigin: Origin | null = snapshot.blueprint ? "repository" : snapshot.draft ? "derived" : null;
    const previous = coreRef.current;

    if (keepDraft && previous.blueprint) {
      commit({
        ...previous,
        status: "ready",
        progress: null,
        error: null,
        source: snapshot.source,
        savedText,
        savedCanonical,
        issues: snapshot.issues,
        graph: snapshot.graph,
        reach: snapshot.reach,
        baseline,
        baselineOrigin,
        writable: snapshot.writable,
      });
      return;
    }

    let blueprint = baseline;
    let origin: Origin | null = baselineOrigin;
    let layout: BlueprintLayout = snapshot.layout ?? {};
    const stored: BlueprintDraftRecord | null = await loadDraft(sessionKeyOf(snapshot.source));
    if (!isCurrent(controller)) return;
    if (stored) {
      layout = { ...layout, ...sanitizeLayout(stored.layout) };
      if (typeof stored.blueprintText === "string") {
        const parsed = parseBlueprintText(stored.blueprintText);
        // Restore unsaved work only when it differs from the repository file.
        if (parsed.ok && serializeBlueprint(parsed.blueprint) !== savedCanonical) {
          blueprint = parsed.blueprint;
          origin = snapshot.blueprint ? "repository" : stored.origin ?? baselineOrigin ?? "derived";
        }
      }
    }

    commit({
      status: "ready",
      progress: null,
      error: null,
      source: snapshot.source,
      blueprint,
      origin,
      savedText,
      savedCanonical,
      issues: snapshot.issues,
      layout,
      graph: snapshot.graph,
      reach: snapshot.reach,
      baseline,
      baselineOrigin,
      past: [],
      future: [],
      writable: snapshot.writable,
    });
  }, [commit, isCurrent]);

  const failLoad = useCallback((controller: AbortController, error: unknown, fallback: string, keepSession: boolean) => {
    if (abortRef.current !== controller || !mountedRef.current) return;
    if (controller.signal.aborted || isAbort(error)) return;
    const message = describeError(error, fallback);
    commit((previous) => (keepSession && previous.blueprint
      ? { ...previous, status: "ready", progress: null, error: message }
      : { ...previous, status: "error", progress: null, error: message }));
  }, [commit]);

  const runGitHubLoad = useCallback(async (
    input: { owner: string; repo: string; commitSha: string; sourceGrant: string },
    keepDraft: boolean,
  ): Promise<void> => {
    const controller = beginLoad("Fetching repository", keepDraft);
    githubInputRef.current = { ...input };
    handleRef.current = null;
    try {
      const response = await fetchGitHubBlueprint(input, controller.signal);
      if (!isCurrent(controller)) return;
      patch({ progress: { phase: "Evaluating blueprint" } });
      // The response crossed a trust boundary; validate blueprints again.
      const repository = response.blueprint ? parseBlueprint(response.blueprint) : null;
      const draft = response.draft ? parseBlueprint(response.draft) : null;
      await applySnapshot({
        source: { kind: "github", owner: input.owner, repo: input.repo, commitSha: response.commitSha || input.commitSha },
        graph: deserializeFileGraph(response.graph),
        reach: response.reach,
        blueprintText: response.blueprintText,
        blueprint: repository?.ok ? repository.blueprint : null,
        issues: repository && !repository.ok ? repository.issues : response.issues,
        draft: draft?.ok ? draft.blueprint : null,
        layout: response.layout,
        writable: false,
      }, controller, keepDraft);
    } catch (error) {
      failLoad(controller, error, "The blueprint could not be loaded from GitHub.", keepDraft);
    }
  }, [applySnapshot, beginLoad, failLoad, isCurrent, patch]);

  const runLocalLoad = useCallback(async (handle: LocalDirectoryHandle, keepDraft: boolean): Promise<boolean> => {
    const controller = beginLoad("Scanning folder", keepDraft);
    handleRef.current = handle;
    githubInputRef.current = null;
    try {
      const snapshot = await readLocalSnapshot(handle, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!isCurrent(controller)) return;
          patch({
            progress: {
              phase: progress.phase === "scanning" ? "Scanning folder" : "Reading files",
              completed: progress.completed,
              ...(progress.total !== undefined ? { total: progress.total } : {}),
            },
          });
        },
      });
      if (!isCurrent(controller)) return false;
      patch({ progress: { phase: "Analyzing imports" } });
      const analysis = await analyzeLocalSnapshotOffThread(
        { name: snapshot.name, files: snapshot.files, blueprintText: snapshot.blueprintText },
        controller.signal,
      );
      if (!isCurrent(controller)) return false;
      const writeState = await queryPermissionState(handle, "readwrite");
      if (!isCurrent(controller)) return false;
      await applySnapshot({
        source: { kind: "local", name: snapshot.name },
        graph: analysis.graph,
        reach: analysis.reach,
        blueprintText: snapshot.blueprintText,
        blueprint: analysis.blueprint,
        issues: analysis.issues,
        draft: analysis.draft,
        layout: parseLayout(snapshot.layoutText),
        writable: writeState !== "denied",
      }, controller, keepDraft);
      if (!isCurrent(controller)) return false;
      void rememberLocalFolder(handle);
      return true;
    } catch (error) {
      failLoad(controller, error, "The folder could not be read.", keepDraft);
      return false;
    }
  }, [applySnapshot, beginLoad, failLoad, isCurrent, patch]);

  const loadFromGitHub = useCallback<BlueprintActions["loadFromGitHub"]>(
    (input) => runGitHubLoad(input, false),
    [runGitHubLoad],
  );

  const openLocalFolder = useCallback<BlueprintActions["openLocalFolder"]>(async () => {
    let picked;
    try {
      picked = await pickLocalFolder();
    } catch (error) {
      patch({ error: describeError(error, "The folder could not be opened.") });
      return;
    }
    if (picked.status === "cancelled") return;
    if (picked.status === "unsupported") {
      patch({ error: picked.reason });
      return;
    }
    await runLocalLoad(picked.handle, false);
  }, [patch, runLocalLoad]);

  const reopenLocalFolder = useCallback<BlueprintActions["reopenLocalFolder"]>(async () => {
    const handle = await recallLocalFolder();
    if (!handle || !mountedRef.current) return false;
    if (!(await verifyPermission(handle, "read", { request: true }))) return false;
    return runLocalLoad(handle, false);
  }, [runLocalLoad]);

  const rescan = useCallback<BlueprintActions["rescan"]>(async () => {
    const source = coreRef.current.source;
    if (!source) return;
    if (source.kind === "local") {
      const handle = handleRef.current;
      if (!handle) {
        patch({ error: "The folder is no longer open. Open it again to rescan." });
        return;
      }
      if (!(await verifyPermission(handle, "read", { request: true }))) {
        patch({ error: "Rassam no longer has permission to read this folder. Open it again." });
        return;
      }
      await runLocalLoad(handle, true);
      return;
    }
    const input = githubInputRef.current;
    if (!input) {
      patch({ error: "The repository session has ended. Reload the project to rescan." });
      return;
    }
    await runGitHubLoad(input, true);
  }, [patch, runGitHubLoad, runLocalLoad]);

  /** Replace the working draft, recording the previous one for undo. */
  const pushBlueprint = useCallback((next: Blueprint, extra: Partial<CoreState> = {}) => {
    commit((previous) => ({
      ...previous,
      ...extra,
      blueprint: next,
      past: previous.blueprint ? [...previous.past, previous.blueprint].slice(-HISTORY_LIMIT) : previous.past,
      future: [],
      error: null,
    }));
  }, [commit]);

  const startEmpty = useCallback<BlueprintActions["startEmpty"]>((name) => {
    const trimmed = name.trim();
    let blueprint: Blueprint;
    try {
      blueprint = emptyBlueprint(trimmed || "Untitled system");
    } catch {
      patch({ error: "That system name is not valid. Use a shorter name." });
      return;
    }
    const previous = coreRef.current;
    pushBlueprint(blueprint, {
      origin: "empty",
      ...(previous.status === "idle" || previous.status === "error"
        ? { status: "ready" as const, progress: null, graph: previous.graph ?? emptyGraph() }
        : {}),
    });
  }, [patch, pushBlueprint]);

  const adoptDraft = useCallback<BlueprintActions["adoptDraft"]>(() => {
    const previous = coreRef.current;
    if (previous.origin !== "derived" || !previous.blueprint) return;
    commit({ ...previous, origin: "repository", error: null });
  }, [commit]);

  const update = useCallback<BlueprintActions["update"]>((recipe) => {
    const current = coreRef.current.blueprint;
    if (!current) {
      patch({ error: "There is no blueprint to edit yet. Load a repository or start an empty blueprint." });
      return;
    }
    let candidate: unknown;
    try {
      const draft = cloneBlueprint(current);
      candidate = recipe(draft) ?? draft;
    } catch (error) {
      patch({ error: `Change failed: ${error instanceof Error && error.message ? error.message : "unexpected error"}` });
      return;
    }
    const parsed = parseBlueprint(candidate);
    if (!parsed.ok) {
      patch({ error: `Change rejected: ${describeIssues(parsed.issues)}` });
      return;
    }
    if (serializeBlueprint(parsed.blueprint) === serializeBlueprint(current)) {
      if (coreRef.current.error) patch({ error: null });
      return;
    }
    pushBlueprint(parsed.blueprint);
  }, [patch, pushBlueprint]);

  const setPosition = useCallback<BlueprintActions["setPosition"]>((componentId, position) => {
    if (!componentId || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    commit((previous) => {
      const existing = previous.layout[componentId];
      if (existing && existing.x === position.x && existing.y === position.y) return previous;
      return { ...previous, layout: { ...previous.layout, [componentId]: { x: position.x, y: position.y } } };
    });
  }, [commit]);

  const verify = useCallback<BlueprintActions["verify"]>((targetId, by, note) => {
    const previous = coreRef.current;
    if (!previous.blueprint) {
      patch({ error: "There is no blueprint to verify yet." });
      return;
    }
    const reviewer = by.trim();
    if (!reviewer) {
      patch({ error: "Enter who is verifying this (a name or handle)." });
      return;
    }
    const commitSha = previous.source?.kind === "github" ? previous.source.commitSha : undefined;
    const trimmedNote = note?.trim();
    try {
      const stamped = stampVerification(previous.blueprint, targetId, {
        by: reviewer,
        at: new Date().toISOString(),
        ...(commitSha ? { commit: commitSha } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      const parsed = parseBlueprint(stamped.blueprint);
      if (!parsed.ok) {
        patch({ error: `Verification rejected: ${describeIssues(parsed.issues)}` });
        return;
      }
      pushBlueprint(parsed.blueprint);
    } catch (error) {
      patch({ error: error instanceof Error && error.message ? `Could not verify: ${error.message}` : "Could not record the verification." });
    }
  }, [patch, pushBlueprint]);

  const undo = useCallback<BlueprintActions["undo"]>(() => {
    commit((previous) => {
      if (!previous.past.length || !previous.blueprint) return previous;
      const target = previous.past[previous.past.length - 1];
      return {
        ...previous,
        blueprint: target,
        past: previous.past.slice(0, -1),
        future: [previous.blueprint, ...previous.future].slice(0, HISTORY_LIMIT),
        error: null,
      };
    });
  }, [commit]);

  const redo = useCallback<BlueprintActions["redo"]>(() => {
    commit((previous) => {
      if (!previous.future.length || !previous.blueprint) return previous;
      const [target, ...rest] = previous.future;
      return {
        ...previous,
        blueprint: target,
        past: [...previous.past, previous.blueprint].slice(-HISTORY_LIMIT),
        future: rest,
        error: null,
      };
    });
  }, [commit]);

  const saveToDisk = useCallback<BlueprintActions["saveToDisk"]>(async () => {
    const snapshot = coreRef.current;
    const handle = handleRef.current;
    if (!snapshot.blueprint) {
      patch({ error: "There is no blueprint to save yet." });
      return;
    }
    if (snapshot.source?.kind !== "local" || !handle) {
      patch({ error: "Saving to disk needs a local folder. Download or copy the blueprint instead." });
      return;
    }
    const text = serializeBlueprint(snapshot.blueprint);
    const saved = snapshot.blueprint;
    try {
      await writeBlueprintFile(handle, text);
      if (Object.keys(snapshot.layout).length > 0) await writeLayoutFile(handle, serializeLayout(snapshot.layout));
    } catch (error) {
      patch({ error: describeError(error, "The blueprint could not be saved.") });
      return;
    }
    if (coreRef.current.source !== snapshot.source) return;
    commit((previous) => ({
      ...previous,
      savedText: text,
      savedCanonical: text,
      issues: [],
      origin: "repository",
      baseline: saved,
      baselineOrigin: "repository",
      writable: true,
      error: null,
    }));
  }, [commit, patch]);

  const download = useCallback<BlueprintActions["download"]>(() => {
    const blueprint = coreRef.current.blueprint;
    if (!blueprint) {
      patch({ error: "There is no blueprint to download yet." });
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([serializeBlueprint(blueprint)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "blueprint.json";
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      patch({ error: "The download could not be started in this browser. Copy the blueprint instead." });
    }
  }, [patch]);

  const copyToClipboard = useCallback<BlueprintActions["copyToClipboard"]>(async () => {
    const blueprint = coreRef.current.blueprint;
    if (!blueprint) {
      patch({ error: "There is no blueprint to copy yet." });
      return;
    }
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(serializeBlueprint(blueprint));
      if (coreRef.current.error) patch({ error: null });
    } catch {
      patch({ error: "The browser blocked clipboard access. Download the blueprint instead." });
    }
  }, [patch]);

  const discardChanges = useCallback<BlueprintActions["discardChanges"]>(() => {
    const previous = coreRef.current;
    if (!previous.source && !previous.baseline) return;
    commit({
      ...previous,
      blueprint: previous.baseline,
      origin: previous.baselineOrigin,
      past: [],
      future: [],
      error: null,
    });
  }, [commit]);

  const close = useCallback<BlueprintActions["close"]>(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    flushPersist();
    handleRef.current = null;
    githubInputRef.current = null;
    commit(INITIAL);
  }, [commit, flushPersist]);

  // ── Derived state ───────────────────────────────────────────

  const { blueprint, graph, reach, savedCanonical } = core;

  const workspace = useMemo<Workspace | null>(() => {
    if (!graph) return null;
    try {
      return createWorkspace([], blueprint, { fileGraph: graph, ...(reach ? { reach } : {}) });
    } catch {
      return null;
    }
  }, [blueprint, graph, reach]);

  const report = useMemo<CheckReport | null>(() => {
    if (!workspace || !blueprint) return null;
    try {
      return workspace.check();
    } catch {
      return null;
    }
  }, [workspace, blueprint]);

  const draftText = useMemo(() => (blueprint ? serializeBlueprint(blueprint) : null), [blueprint]);
  const dirty = draftText !== null && draftText !== savedCanonical;

  // ── Draft persistence (debounced, per session) ──────────────

  const { status, source, layout, savedText, origin } = core;
  useEffect(() => {
    if (status !== "ready" || !source) return;
    const record = {
      sessionKey: sessionKeyOf(source),
      blueprintText: dirty ? draftText : null,
      layout,
      savedText,
      ...(origin ? { origin } : {}),
    };
    const run = () => {
      if (record.blueprintText === null && Object.keys(record.layout).length === 0) void deleteDraft(record.sessionKey);
      else void saveDraft(record);
    };
    pendingPersistRef.current = run;
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      if (pendingPersistRef.current === run) pendingPersistRef.current = null;
      run();
    }, PERSIST_DEBOUNCE_MS);
  }, [status, source, draftText, dirty, layout, savedText, origin]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (persistTimerRef.current !== null) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const run = pendingPersistRef.current;
      pendingPersistRef.current = null;
      run?.();
    };
  }, []);

  return {
    status: core.status,
    progress: core.progress,
    error: core.error,
    source: core.source,
    blueprint: core.blueprint,
    origin: core.origin,
    savedText: core.savedText,
    issues: core.issues,
    dirty,
    workspace,
    report,
    layout: core.layout,
    canSaveToDisk: core.source?.kind === "local" && core.writable && core.status !== "idle",
    canUndo: core.past.length > 0,
    canRedo: core.future.length > 0,
    loadFromGitHub,
    openLocalFolder,
    reopenLocalFolder,
    rescan,
    startEmpty,
    adoptDraft,
    update,
    setPosition,
    verify,
    undo,
    redo,
    saveToDisk,
    download,
    copyToClipboard,
    discardChanges,
    close,
  };
}
