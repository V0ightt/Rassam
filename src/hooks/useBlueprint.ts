
// Session state for the blueprint canvas: loads the observed graph and the
// `.rassam/blueprint.json` contract from GitHub (through /api/blueprint) or a
// local folder (File System Access API), holds the working draft with undo
// history, re-evaluates it on every edit and persists drafts per session.
//
// People change the contract by saying what they want: an instruction becomes
// typed edits (deterministic parser first, a model when one is configured),
// the edits become a previewable proposal, and applying it is one undo step.
// The session can also follow its source: new commits on GitHub, or a local
// folder that changed on disk.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { diffArchitecture, type ArchitectureDiff } from "@/blueprint/arch-diff";
import {
  applyBlueprintEdits,
  blueprintEditSchema,
  BlueprintEditError,
  summarizeBlueprintDelta,
  type AppliedEdit,
  type BlueprintDelta,
  type BlueprintEdit,
  type BlueprintEditInput,
} from "@/blueprint/edits";
import { parseIntent, suggestIntents } from "@/blueprint/intent";
import { parseSystemStatus, type SystemStatus } from "@/blueprint/status";
import { createWorkspace, type Workspace, type WorkspaceGraphView } from "@/blueprint/workspace";
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
import { fetchCommits, type CommitSummary } from "@/lib/blueprint-client/commits-api";
import {
  deleteDraft,
  githubSessionKey,
  loadDraft,
  localSessionKey,
  saveDraft,
  type BlueprintDraftRecord,
} from "@/lib/blueprint-client/drafts";
import { requestBlueprintEdit } from "@/lib/blueprint-client/edit-api";
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
import { loadModelSettings } from "@/lib/model-settings";

export type BlueprintSource =
  | { kind: "github"; owner: string; repo: string; commitSha: string }
  | { kind: "local"; name: string };

/** A change that has been worked out but not applied: what it would do, and what the check says about the result. */
export interface BlueprintProposal {
  id: string;
  instruction: string;
  source: "parser" | "model" | "manual";
  model?: string;
  edits: BlueprintEdit[];
  /** From the dry run. */
  applied: AppliedEdit[];
  interpretation: string;
  /** The blueprint if applied. */
  preview: Blueprint;
  delta: BlueprintDelta;
  /** Check of the preview. */
  previewReport: CheckReport | null;
  /** Preview graph vs current graph. */
  graphDiff: ArchitectureDiff | null;
  weakens: boolean;
  questions?: string[];
}

export type IntentState =
  | { status: "idle" }
  | { status: "thinking"; instruction: string }
  | { status: "proposed"; proposal: BlueprintProposal }
  | { status: "ambiguous"; instruction: string; message: string; options: Array<{ label: string; edits: BlueprintEdit[] }> }
  | { status: "unknown"; instruction: string; message: string; examples: string[] }
  | { status: "error"; instruction: string; message: string };

export interface LiveState {
  watching: boolean;
  checking: boolean;
  /** Commit the view shows (GitHub sources). */
  current: { sha: string; message?: string; author?: string; date?: string } | null;
  /** Newest commit seen on the branch. */
  latest: { sha: string; message?: string; author?: string; date?: string } | null;
  /** `latest` differs from `current`. */
  behind: boolean;
  /** What the last sync changed. Local folders have no commits: the shas are the ISO times of the two scans. */
  lastChange: { fromSha: string; toSha: string; diff: ArchitectureDiff; at: string } | null;
  /** Newest first, at most 30, this session. */
  history: Array<{ sha: string; message?: string; date?: string; summary: string }>;
}

export interface BlueprintReceipt {
  id: string;
  label: string;
  at: string;
}

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
  /** Where "tell Rassam what to change" stands. */
  intent: IntentState;
  /** Up to 6 instructions that make sense for this blueprint right now. */
  suggestions: string[];
  live: LiveState;
  /**
   * What is running, from `.rassam/status.json` (written by the repository's CI).
   * Named `systemStatus` because `status` is the load state of the session.
   */
  systemStatus: SystemStatus | null;
  /** The last 10 applied changes, newest first. */
  receipts: BlueprintReceipt[];
}

export interface BlueprintActions {
  /** `ref` (a branch name) is optional: it is the branch watched for new commits; the default branch when omitted. */
  loadFromGitHub(input: { owner: string; repo: string; commitSha: string; sourceGrant: string; ref?: string }): Promise<void>;
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
  /**
   * Turn an instruction into a proposal. The parser answers instantly in the
   * browser; when it does not understand and a model is selected in Settings,
   * /api/blueprint/edit is asked. Aborts a previous in-flight request.
   */
  proposeIntent(instruction: string, options?: { selection?: string[] }): Promise<void>;
  /** Manual UI actions go through the same preview pipeline (source "manual"). */
  proposeEdits(edits: BlueprintEditInput[], label: string): void;
  /** Pick one reading of an ambiguous instruction. */
  chooseIntentOption(index: number): void;
  /** Commit the proposal as one undo step, add a receipt, return to idle. */
  applyProposal(): void;
  discardProposal(): void;
  /** For trivial reversible manual edits: no preview, one undo step, one receipt. */
  applyEditsNow(edits: BlueprintEditInput[], label: string): void;
  /**
   * GitHub sources: poll for new commits every 45 s while the tab is visible.
   * Local folders: re-scan when the window regains focus.
   */
  setWatching(on: boolean): void;
  /** Reload at the latest commit keeping unsaved work. Needs `configureLive({ getSourceGrant })`. */
  syncToLatest(): Promise<void>;
  configureLive(options: { getSourceGrant?: (sha: string) => Promise<string | null> }): void;
}

const HISTORY_LIMIT = 50;
const PERSIST_DEBOUNCE_MS = 400;
const POLL_INTERVAL_MS = 45_000;
const POLL_MAX_INTERVAL_MS = 10 * 60_000;
const FOCUS_DEBOUNCE_MS = 600;
const RECEIPT_LIMIT = 10;
const LIVE_HISTORY_LIMIT = 30;
const SUGGESTION_LIMIT = 6;

const IDLE_INTENT: IntentState = { status: "idle" };

/** How a freshly read snapshot meets the session: start over, keep the draft, or follow the source quietly. */
type LoadMode = "replace" | "keep" | "follow";

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
  intent: IntentState;
  receipts: BlueprintReceipt[];
  systemStatus: SystemStatus | null;
  watching: boolean;
  polling: boolean;
  syncing: boolean;
  latest: CommitSummary | null;
  /** Recent commits from the last poll (messages and dates for `live`). */
  commits: CommitSummary[];
  lastChange: LiveState["lastChange"];
  liveHistory: LiveState["history"];
  /** Local folders: ISO time of the scan the view shows. */
  scannedAt: string | null;
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
  intent: IDLE_INTENT,
  receipts: [],
  systemStatus: null,
  watching: false,
  polling: false,
  syncing: false,
  latest: null,
  commits: [],
  lastChange: null,
  liveHistory: [],
  scannedAt: null,
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
  systemStatus: SystemStatus | null;
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

/** The component graph of a blueprint over the observed files, or null when there is nothing to draw. */
function graphViewOf(state: Pick<CoreState, "blueprint" | "graph" | "reach">, blueprint: Blueprint | null = state.blueprint): WorkspaceGraphView | null {
  if (!state.graph || !blueprint) return null;
  try {
    return createWorkspace([], blueprint, { fileGraph: state.graph, ...(state.reach ? { reach: state.reach } : {}) }).graphView();
  } catch {
    return null;
  }
}

function parseStatusText(text: string | null): SystemStatus | null {
  if (text === null) return null;
  const parsed = parseSystemStatus(text);
  return parsed.ok && parsed.status ? parsed.status : null;
}

/** The draft is exactly what was loaded: following the source may replace it. */
function isPristine(state: CoreState): boolean {
  if (!state.blueprint || !state.baseline) return false;
  return state.blueprint === state.baseline || serializeBlueprint(state.blueprint) === serializeBlueprint(state.baseline);
}

function sameSha(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function describeEditError(error: unknown): string {
  if (error instanceof BlueprintEditError) {
    return error.suggestions?.length ? `${error.message} Did you mean ${error.suggestions.join(", ")}?` : error.message;
  }
  return error instanceof Error && error.message ? error.message : "The change could not be applied.";
}

function clampNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : undefined;
}

export function useBlueprint(): BlueprintSessionState & BlueprintActions {
  const [core, setCore] = useState<CoreState>(INITIAL);
  const coreRef = useRef<CoreState>(INITIAL);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const handleRef = useRef<LocalDirectoryHandle | null>(null);
  const githubInputRef = useRef<{ owner: string; repo: string; commitSha: string; sourceGrant: string; ref?: string } | null>(null);
  const intentAbortRef = useRef<AbortController | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  /** The blueprint a shown proposal was computed against. */
  const proposalBaseRef = useRef<Blueprint | null>(null);
  const liveConfigRef = useRef<{ getSourceGrant?: (sha: string) => Promise<string | null> }>({});
  /** Latest render's derived values, for advisory use in actions (model context). */
  const derivedRef = useRef<{ workspace: Workspace | null; report: CheckReport | null }>({ workspace: null, report: null });
  const idCounterRef = useRef(0);
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

  const beginLoad = useCallback((phase: string, mode: LoadMode): AbortController => {
    abortRef.current?.abort();
    flushPersist();
    const controller = new AbortController();
    abortRef.current = controller;
    if (mode === "replace") {
      intentAbortRef.current?.abort();
      intentAbortRef.current = null;
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
      proposalBaseRef.current = null;
    }
    commit((previous) => (mode === "follow"
      // Following the source happens behind the view: it stays usable.
      ? { ...previous, error: null }
      : mode === "keep"
        ? { ...previous, status: "loading", progress: { phase }, error: null }
        // A watched session stays watched when another source is opened.
        : { ...INITIAL, watching: previous.watching, status: "loading", progress: { phase } }));
    return controller;
  }, [commit, flushPersist]);

  const isCurrent = useCallback((controller: AbortController) => (
    abortRef.current === controller && !controller.signal.aborted && mountedRef.current
  ), []);

  /** Install a freshly read snapshot, restoring any stored draft for the session. */
  const applySnapshot = useCallback(async (
    snapshot: LoadedSnapshot,
    controller: AbortController,
    mode: LoadMode,
  ): Promise<void> => {
    const savedText = snapshot.blueprintText;
    const savedCanonical = canonicalText(savedText);
    const baseline = snapshot.blueprint ?? snapshot.draft;
    const baselineOrigin: Origin | null = snapshot.blueprint ? "repository" : snapshot.draft ? "derived" : null;
    const previous = coreRef.current;
    const scannedAt = snapshot.source.kind === "local" ? new Date().toISOString() : null;

    if (mode !== "replace" && previous.blueprint) {
      const kept: CoreState = {
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
        systemStatus: snapshot.systemStatus,
        scannedAt,
      };
      // Following with no unsaved work shows the source's own contract; unsaved work is never replaced.
      if (mode === "follow" && baseline && isPristine(previous)) {
        commit({
          ...kept,
          blueprint: baseline,
          origin: snapshot.blueprint ? "repository" : previous.baselineOrigin === "derived" ? previous.origin : baselineOrigin,
          layout: { ...(snapshot.layout ?? {}), ...previous.layout },
          past: [],
          future: [],
        });
        return;
      }
      commit(kept);
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
      intent: IDLE_INTENT,
      receipts: [],
      systemStatus: snapshot.systemStatus,
      watching: coreRef.current.watching,
      polling: false,
      syncing: false,
      latest: null,
      commits: [],
      lastChange: null,
      liveHistory: [],
      scannedAt,
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
    input: { owner: string; repo: string; commitSha: string; sourceGrant: string; ref?: string },
    mode: LoadMode,
  ): Promise<boolean> => {
    const controller = beginLoad("Fetching repository", mode);
    // A failed follow must leave the session pointing at the commit it still shows.
    if (mode !== "follow") githubInputRef.current = { ...input };
    handleRef.current = null;
    try {
      const response = await fetchGitHubBlueprint(input, controller.signal);
      if (!isCurrent(controller)) return false;
      if (mode !== "follow") patch({ progress: { phase: "Evaluating blueprint" } });
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
        systemStatus: response.status,
      }, controller, mode);
      if (!isCurrent(controller)) return false;
      if (mode === "follow") githubInputRef.current = { ...input };
      return true;
    } catch (error) {
      failLoad(controller, error, "The blueprint could not be loaded from GitHub.", mode !== "replace");
      return false;
    }
  }, [applySnapshot, beginLoad, failLoad, isCurrent, patch]);

  const runLocalLoad = useCallback(async (handle: LocalDirectoryHandle, mode: LoadMode): Promise<boolean> => {
    const controller = beginLoad("Scanning folder", mode);
    handleRef.current = handle;
    githubInputRef.current = null;
    try {
      const snapshot = await readLocalSnapshot(handle, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!isCurrent(controller) || mode === "follow") return;
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
      if (mode !== "follow") patch({ progress: { phase: "Analyzing imports" } });
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
        systemStatus: parseStatusText(snapshot.statusText ?? null),
      }, controller, mode);
      if (!isCurrent(controller)) return false;
      void rememberLocalFolder(handle);
      return true;
    } catch (error) {
      failLoad(controller, error, "The folder could not be read.", mode !== "replace");
      return false;
    }
  }, [applySnapshot, beginLoad, failLoad, isCurrent, patch]);

  const loadFromGitHub = useCallback<BlueprintActions["loadFromGitHub"]>(
    async (input) => {
      await runGitHubLoad(input, "replace");
    },
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
    await runLocalLoad(picked.handle, "replace");
  }, [patch, runLocalLoad]);

  const reopenLocalFolder = useCallback<BlueprintActions["reopenLocalFolder"]>(async () => {
    const handle = await recallLocalFolder();
    if (!handle || !mountedRef.current) return false;
    if (!(await verifyPermission(handle, "read", { request: true }))) return false;
    return runLocalLoad(handle, "replace");
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
      await runLocalLoad(handle, "keep");
      return;
    }
    const input = githubInputRef.current;
    if (!input) {
      patch({ error: "The repository session has ended. Reload the project to rescan." });
      return;
    }
    await runGitHubLoad(input, "keep");
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
    intentAbortRef.current?.abort();
    intentAbortRef.current = null;
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    proposalBaseRef.current = null;
    flushPersist();
    handleRef.current = null;
    githubInputRef.current = null;
    commit(INITIAL);
  }, [commit, flushPersist]);

  // ── Tell Rassam what to change ──────────────────────────────

  const nextId = useCallback((prefix: string): string => {
    idCounterRef.current += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounterRef.current}`;
  }, []);

  const setIntent = useCallback((intent: IntentState) => {
    commit((previous) => ({ ...previous, intent }));
  }, [commit]);

  const addReceipt = useCallback((receipts: BlueprintReceipt[], label: string): BlueprintReceipt[] => (
    [{ id: nextId("receipt"), label, at: new Date().toISOString() }, ...receipts].slice(0, RECEIPT_LIMIT)
  ), [nextId]);

  /** Dry-run edits against the working draft and show the result as a proposal. Nothing is applied. */
  const presentProposal = useCallback((input: {
    instruction: string;
    source: BlueprintProposal["source"];
    model?: string;
    edits: readonly BlueprintEditInput[];
    interpretation?: string;
    questions?: string[];
  }) => {
    const state = coreRef.current;
    const current = state.blueprint;
    if (!current) {
      setIntent({ status: "error", instruction: input.instruction, message: "There is no blueprint to change yet. Load a repository or start an empty blueprint." });
      return;
    }
    let result: ReturnType<typeof applyBlueprintEdits>;
    try {
      result = applyBlueprintEdits(current, input.edits, {
        provenance: input.source === "model" ? { source: "agent", ...(input.model ? { by: input.model } : {}) } : { source: "human" },
        now: new Date().toISOString(),
      });
    } catch (error) {
      setIntent({ status: "error", instruction: input.instruction, message: describeEditError(error) });
      return;
    }
    const { blueprint: preview, applied } = result;
    let previewReport: CheckReport | null = null;
    let graphDiff: ArchitectureDiff | null = null;
    if (state.graph) {
      try {
        const workspace = createWorkspace([], preview, { fileGraph: state.graph, ...(state.reach ? { reach: state.reach } : {}) });
        previewReport = workspace.check();
        const before = graphViewOf(state);
        graphDiff = before ? diffArchitecture(before, workspace.graphView()) : null;
      } catch {
        previewReport = null;
        graphDiff = null;
      }
    }
    const interpretation = input.interpretation?.trim() || applied.map((edit) => edit.summary).join(" ") || "No changes.";
    proposalBaseRef.current = current;
    setIntent({
      status: "proposed",
      proposal: {
        id: nextId("proposal"),
        instruction: input.instruction,
        source: input.source,
        ...(input.model ? { model: input.model } : {}),
        edits: input.edits.map((edit) => blueprintEditSchema.parse(edit)),
        applied,
        interpretation,
        preview,
        delta: summarizeBlueprintDelta(current, preview),
        previewReport,
        graphDiff,
        weakens: applied.some((edit) => edit.weakens),
        ...(input.questions?.length ? { questions: input.questions } : {}),
      },
    });
  }, [nextId, setIntent]);

  const proposeIntent = useCallback<BlueprintActions["proposeIntent"]>(async (instruction, options) => {
    intentAbortRef.current?.abort();
    intentAbortRef.current = null;
    const text = instruction.trim();
    const blueprint = coreRef.current.blueprint;
    if (!blueprint) {
      setIntent({ status: "error", instruction: text, message: "There is no blueprint to change yet. Load a repository or start an empty blueprint." });
      return;
    }
    const parsed = parseIntent(text, blueprint);
    if (parsed.status === "ok") {
      presentProposal({ instruction: text, source: "parser", edits: parsed.edits, interpretation: parsed.interpretation });
      return;
    }
    if (parsed.status === "ambiguous") {
      setIntent({ status: "ambiguous", instruction: text, message: parsed.message, options: parsed.options });
      return;
    }

    const settings = loadModelSettings();
    if (!text || !settings.selectedProvider || !settings.selectedModel) {
      setIntent({ status: "unknown", instruction: text, message: parsed.message, examples: parsed.examples });
      return;
    }

    const controller = new AbortController();
    intentAbortRef.current = controller;
    setIntent({ status: "thinking", instruction: text });
    const derived = derivedRef.current;
    const maxTokens = clampNumber(settings.maxOutputTokens, 64, 8_192);
    const temperature = clampNumber(settings.temperature, 0, 1);
    try {
      const result = await requestBlueprintEdit({
        instruction: text,
        blueprint,
        context: {
          edges: (graphViewOf(coreRef.current)?.edges ?? []).map((edge) => ({ from: edge.from, to: edge.to, status: edge.status })),
          findings: (derived.report?.findings ?? []).map((finding) => ({ kind: finding.kind, title: finding.title })),
          ...(options?.selection?.length ? { selection: options.selection } : {}),
        },
        modelSettings: {
          providerId: settings.selectedProvider,
          model: settings.selectedModel,
          ...(maxTokens !== undefined ? { maxTokens: Math.floor(maxTokens) } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
        },
      }, controller.signal);
      if (intentAbortRef.current !== controller || controller.signal.aborted) return;
      intentAbortRef.current = null;
      if (result.kind === "ambiguous") {
        setIntent({ status: "ambiguous", instruction: text, message: result.message, options: result.options });
      } else if (result.kind === "unknown") {
        setIntent({
          status: "unknown",
          instruction: text,
          message: result.modelUnavailable ? `${result.message} (The selected model could not be used: ${result.modelUnavailable}.)` : result.message,
          examples: result.examples.length ? result.examples : parsed.examples,
        });
      } else if (!result.edits.length) {
        // The model asked back instead of proposing: show its question with examples to copy.
        setIntent({
          status: "unknown",
          instruction: text,
          message: result.questions?.join(" ") || result.explanation || "No change could be worked out from that. Try one of the examples.",
          examples: parsed.examples,
        });
      } else {
        presentProposal({
          instruction: text,
          source: result.source,
          ...(result.model ? { model: result.model } : {}),
          edits: result.edits,
          interpretation: result.interpretation,
          ...(result.questions ? { questions: result.questions } : {}),
        });
      }
    } catch (error) {
      if (intentAbortRef.current !== controller || controller.signal.aborted || isAbort(error)) return;
      intentAbortRef.current = null;
      setIntent({ status: "error", instruction: text, message: describeBlueprintApiError(error) });
    }
  }, [presentProposal, setIntent]);

  const proposeEdits = useCallback<BlueprintActions["proposeEdits"]>((edits, label) => {
    intentAbortRef.current?.abort();
    intentAbortRef.current = null;
    presentProposal({ instruction: label, source: "manual", edits, interpretation: label });
  }, [presentProposal]);

  const chooseIntentOption = useCallback<BlueprintActions["chooseIntentOption"]>((index) => {
    const intent = coreRef.current.intent;
    if (intent.status !== "ambiguous") return;
    const option = intent.options[index];
    if (!option) return;
    presentProposal({ instruction: intent.instruction, source: "parser", edits: option.edits, interpretation: option.label });
  }, [presentProposal]);

  const applyProposal = useCallback<BlueprintActions["applyProposal"]>(() => {
    const state = coreRef.current;
    if (state.intent.status !== "proposed" || !state.blueprint) return;
    const proposal = state.intent.proposal;
    let next = proposal.preview;
    if (proposalBaseRef.current !== state.blueprint) {
      // The draft moved on (undo, another edit) since the preview: apply to what is there now.
      try {
        next = applyBlueprintEdits(state.blueprint, proposal.edits, {
          provenance: proposal.source === "model" ? { source: "agent", ...(proposal.model ? { by: proposal.model } : {}) } : { source: "human" },
          now: new Date().toISOString(),
        }).blueprint;
      } catch (error) {
        setIntent({ status: "error", instruction: proposal.instruction, message: `The blueprint changed since this preview. ${describeEditError(error)}` });
        return;
      }
    }
    proposalBaseRef.current = null;
    if (serializeBlueprint(next) === serializeBlueprint(state.blueprint)) {
      commit({ ...state, intent: IDLE_INTENT, error: null });
      return;
    }
    pushBlueprint(next, { intent: IDLE_INTENT, receipts: addReceipt(state.receipts, proposal.interpretation) });
  }, [addReceipt, commit, pushBlueprint, setIntent]);

  const discardProposal = useCallback<BlueprintActions["discardProposal"]>(() => {
    intentAbortRef.current?.abort();
    intentAbortRef.current = null;
    proposalBaseRef.current = null;
    setIntent(IDLE_INTENT);
  }, [setIntent]);

  const applyEditsNow = useCallback<BlueprintActions["applyEditsNow"]>((edits, label) => {
    const state = coreRef.current;
    if (!state.blueprint) {
      patch({ error: "There is no blueprint to edit yet. Load a repository or start an empty blueprint." });
      return;
    }
    let result: ReturnType<typeof applyBlueprintEdits>;
    try {
      result = applyBlueprintEdits(state.blueprint, edits, { provenance: { source: "human" }, now: new Date().toISOString() });
    } catch (error) {
      patch({ error: `Change rejected: ${describeEditError(error)}` });
      return;
    }
    if (serializeBlueprint(result.blueprint) === serializeBlueprint(state.blueprint)) {
      if (state.error) patch({ error: null });
      return;
    }
    const summary = label.trim() || result.applied.map((edit) => edit.summary).join(" ");
    pushBlueprint(result.blueprint, { receipts: addReceipt(state.receipts, summary) });
  }, [addReceipt, patch, pushBlueprint]);

  // ── Following the source ────────────────────────────────────

  const recordChange = useCallback((
    fromSha: string,
    toSha: string,
    before: WorkspaceGraphView | null,
    after: WorkspaceGraphView,
    commitInfo: { message?: string; date?: string },
    onlyWhenChanged: boolean,
  ) => {
    const diff = diffArchitecture(before, after);
    if (onlyWhenChanged && !diff.changed) return;
    const at = new Date().toISOString();
    commit((previous) => ({
      ...previous,
      lastChange: { fromSha, toSha, diff, at },
      liveHistory: [
        {
          sha: toSha,
          ...(commitInfo.message ? { message: commitInfo.message } : {}),
          ...(commitInfo.date ? { date: commitInfo.date } : {}),
          summary: diff.summary,
        },
        ...previous.liveHistory,
      ].slice(0, LIVE_HISTORY_LIMIT),
    }));
  }, [commit]);

  /** Ask for the newest commit. Resolves false when the check failed (the caller backs off). */
  const checkLatest = useCallback(async (): Promise<boolean> => {
    const source = coreRef.current.source;
    if (source?.kind !== "github") return true;
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    commit((previous) => ({ ...previous, polling: true }));
    const ref = githubInputRef.current?.ref;
    try {
      const result = await fetchCommits({ owner: source.owner, repo: source.repo, ...(ref ? { ref } : {}) }, controller.signal);
      if (pollAbortRef.current !== controller) return true;
      pollAbortRef.current = null;
      const now = coreRef.current.source;
      if (now?.kind !== "github" || now.owner !== source.owner || now.repo !== source.repo) {
        commit((previous) => ({ ...previous, polling: false }));
        return true;
      }
      commit((previous) => ({ ...previous, polling: false, latest: result.head, commits: result.recent }));
      return true;
    } catch (error) {
      if (pollAbortRef.current !== controller) return true;
      pollAbortRef.current = null;
      commit((previous) => ({ ...previous, polling: false }));
      return controller.signal.aborted || isAbort(error);
    }
  }, [commit]);

  /** Local folders: re-read the folder behind the view and report what changed in the graph. */
  const followLocal = useCallback(async (): Promise<void> => {
    const state = coreRef.current;
    const handle = handleRef.current;
    if (state.source?.kind !== "local" || !handle || state.status !== "ready" || state.syncing) return;
    // No user gesture here: never prompt, just skip when access is gone.
    if (!(await verifyPermission(handle, "read", { request: false }))) return;
    if (coreRef.current.source !== state.source || coreRef.current.status !== "ready") return;
    const before = graphViewOf(coreRef.current);
    const from = coreRef.current.scannedAt ?? "";
    commit((previous) => ({ ...previous, syncing: true }));
    let loaded = false;
    try {
      loaded = await runLocalLoad(handle, "follow");
    } finally {
      commit((previous) => ({ ...previous, syncing: false }));
    }
    if (!loaded) return;
    const after = graphViewOf(coreRef.current);
    if (after) recordChange(from, coreRef.current.scannedAt ?? new Date().toISOString(), before, after, {}, true);
  }, [commit, recordChange, runLocalLoad]);

  const setWatching = useCallback<BlueprintActions["setWatching"]>((on) => {
    if (coreRef.current.watching === on) return;
    if (!on) {
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
    }
    commit((previous) => ({ ...previous, watching: on, ...(on ? {} : { polling: false }) }));
  }, [commit]);

  const configureLive = useCallback<BlueprintActions["configureLive"]>((options) => {
    liveConfigRef.current = { ...(options.getSourceGrant ? { getSourceGrant: options.getSourceGrant } : {}) };
  }, []);

  const syncToLatest = useCallback<BlueprintActions["syncToLatest"]>(async () => {
    const source = coreRef.current.source;
    if (!source || coreRef.current.syncing || coreRef.current.status !== "ready") return;
    if (source.kind === "local") {
      await followLocal();
      return;
    }
    if (!coreRef.current.latest) await checkLatest();
    if (coreRef.current.source !== source) return;
    const latest = coreRef.current.latest;
    if (!latest) {
      patch({ error: "Could not check for new commits. Try again shortly." });
      return;
    }
    if (sameSha(latest.sha, source.commitSha)) return;
    const getSourceGrant = liveConfigRef.current.getSourceGrant;
    if (!getSourceGrant) {
      patch({ error: "This view cannot move to the new commit by itself. Reload the project to see the latest commit." });
      return;
    }
    commit((previous) => ({ ...previous, syncing: true }));
    try {
      let grant: string | null;
      try {
        grant = await getSourceGrant(latest.sha);
      } catch {
        grant = null;
      }
      if (coreRef.current.source !== source) return;
      if (!grant) {
        patch({ error: "Access to the latest commit could not be obtained. Refresh the project and try again." });
        return;
      }
      const before = graphViewOf(coreRef.current);
      const ref = githubInputRef.current?.ref;
      const loaded = await runGitHubLoad({
        owner: source.owner,
        repo: source.repo,
        commitSha: latest.sha,
        sourceGrant: grant,
        ...(ref ? { ref } : {}),
      }, "follow");
      if (!loaded) return;
      const now = coreRef.current.source;
      const after = graphViewOf(coreRef.current);
      if (after && now?.kind === "github") recordChange(source.commitSha, now.commitSha, before, after, latest, false);
    } finally {
      commit((previous) => ({ ...previous, syncing: false }));
    }
  }, [checkLatest, commit, followLocal, patch, recordChange, runGitHubLoad]);

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

  useEffect(() => {
    derivedRef.current = { workspace, report };
  }, [workspace, report]);

  const suggestions = useMemo<string[]>(() => {
    if (!blueprint) return [];
    try {
      return suggestIntents(blueprint, workspace?.graphView()).slice(0, SUGGESTION_LIMIT);
    } catch {
      return [];
    }
  }, [blueprint, workspace]);

  const { watching, polling, syncing, latest, commits, lastChange, liveHistory } = core;
  const liveSource = core.source;
  const live = useMemo<LiveState>(() => {
    const describe = (sha: string): LiveState["current"] => {
      const known = commits.find((item) => sameSha(item.sha, sha)) ?? (latest && sameSha(latest.sha, sha) ? latest : null);
      return {
        sha,
        ...(known?.message ? { message: known.message } : {}),
        ...(known?.author ? { author: known.author } : {}),
        ...(known?.date ? { date: known.date } : {}),
      };
    };
    const current = liveSource?.kind === "github" ? describe(liveSource.commitSha) : null;
    return {
      watching,
      checking: polling || syncing,
      current,
      latest: liveSource?.kind === "github" ? latest : null,
      behind: Boolean(current && latest && !sameSha(latest.sha, current.sha)),
      lastChange,
      history: liveHistory,
    };
  }, [watching, polling, syncing, latest, commits, lastChange, liveHistory, liveSource]);

  // ── Watching (poll GitHub, or re-scan a local folder on focus) ──

  const watchKind = core.source?.kind ?? null;
  const watchKey = core.source ? sessionKeyOf(core.source) : null;
  useEffect(() => {
    if (!watching || !watchKey || typeof window === "undefined" || typeof document === "undefined") return;

    if (watchKind === "github") {
      let stopped = false;
      let running = false;
      let failures = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const tick = async (): Promise<void> => {
        // The store is read directly: turning watching off takes effect before the next render.
        if (stopped || running || document.hidden || !coreRef.current.watching) return;
        running = true;
        const ok = await checkLatest();
        running = false;
        if (stopped) return;
        failures = ok ? 0 : Math.min(failures + 1, 8);
        if (document.hidden) return;
        timer = setTimeout(() => {
          timer = null;
          void tick();
        }, Math.min(POLL_INTERVAL_MS * 2 ** failures, POLL_MAX_INTERVAL_MS));
      };
      const onVisibility = () => {
        if (document.hidden) {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        } else if (timer === null) {
          void tick();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      void tick();
      return () => {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        pollAbortRef.current?.abort();
      };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void followLocal();
      }, FOCUS_DEBOUNCE_MS);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [watching, watchKind, watchKey, checkLatest, followLocal]);

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
      intentAbortRef.current?.abort();
      pollAbortRef.current?.abort();
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
    intent: core.intent,
    suggestions,
    live,
    systemStatus: core.systemStatus,
    receipts: core.receipts,
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
    proposeIntent,
    proposeEdits,
    chooseIntentOption,
    applyProposal,
    discardProposal,
    applyEditsNow,
    setWatching,
    syncToLatest,
    configureLive,
  };
}
