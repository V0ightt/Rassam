// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildFileGraph } from "@/blueprint/imports";
import { analyzeReach } from "@/blueprint/reach";
import { emptyBlueprint, serializeBlueprint, type Blueprint } from "@/blueprint/schema";
import { serializeFileGraph } from "@/blueprint/snapshot";
import type { SourceFile } from "@/blueprint/types";
import type { LocalDirectoryHandle, LocalFileHandle } from "@/lib/blueprint-client/local-folder";
import { MODEL_SETTINGS_STORAGE_KEY } from "@/lib/model-settings";

const draftStore = vi.hoisted(() => ({ drafts: new Map<string, unknown>(), handle: null as unknown }));

vi.mock("@/lib/blueprint-client/drafts", () => ({
  githubSessionKey: (owner: string, repo: string) => `github:${owner.toLowerCase()}/${repo.toLowerCase()}`,
  localSessionKey: (name: string) => `local:${name}`,
  loadDraft: vi.fn(async (key: string) => draftStore.drafts.get(key) ?? null),
  saveDraft: vi.fn(async () => true),
  deleteDraft: vi.fn(async () => true),
  saveDirectoryHandle: vi.fn(async (handle: unknown) => {
    draftStore.handle = handle;
    return true;
  }),
  loadDirectoryHandle: vi.fn(async () => null),
  deleteDirectoryHandle: vi.fn(async () => true),
}));

import { useBlueprint } from "./useBlueprint";

const sha = (char: string) => char.repeat(40);
const COMMIT = sha("a");
const NEXT = sha("b");
const INPUT = { owner: "fixture-owner", repo: "fixture-repo", commitSha: COMMIT, sourceGrant: "g".repeat(64) };

const FILES: SourceFile[] = [
  { path: "src/app/page.ts", content: "import { helper } from '../lib/helper';\nexport const page = helper();\n" },
  { path: "src/lib/helper.ts", content: "export const helper = () => 1;\n" },
  { path: "src/admin/panel.ts", content: "export const panel = 1;\n" },
  { path: "src/public/site.ts", content: "export const site = 1;\n" },
];
/** The next commit: lib starts importing app. */
const NEXT_FILES: SourceFile[] = [...FILES, { path: "src/lib/back.ts", content: "import { page } from '../app/page';\nexport const back = page;\n" }];

function contract(): Blueprint {
  const blueprint = emptyBlueprint("Fixture System");
  blueprint.components.push(
    { id: "app", name: "App", kind: "module", paths: ["src/app/**"] },
    { id: "lib", name: "Lib", kind: "module", paths: ["src/lib/**"] },
    { id: "api-admin", name: "Admin API", kind: "api", paths: ["src/admin/**"] },
    { id: "api-public", name: "Public API", kind: "api", paths: ["src/public/**"] },
  );
  blueprint.dependencies.push({ from: "app", to: "lib" });
  return blueprint;
}

function payload(options: { files?: SourceFile[]; commitSha?: string; blueprint?: Blueprint; status?: unknown } = {}) {
  const files = options.files ?? FILES;
  const graph = buildFileGraph(files);
  const blueprint = options.blueprint ?? contract();
  return {
    requestId: "request-1",
    commitSha: options.commitSha ?? COMMIT,
    blueprintText: serializeBlueprint(blueprint),
    blueprint,
    issues: [],
    draft: null,
    layout: null,
    graph: serializeFileGraph(graph),
    reach: analyzeReach(files, graph),
    status: options.status ?? null,
    stats: { filesFetched: files.length, bytes: 100, treeEntries: files.length },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Routes {
  blueprint: () => Response | Promise<Response>;
  edit: (body: Record<string, unknown>, init: RequestInit | undefined) => Response | Promise<Response>;
  commits: (url: string) => Response | Promise<Response>;
}

let routes: Routes;
let calls: Array<{ url: string; body: Record<string, unknown> | null; signal: AbortSignal | null }> = [];

function callsTo(prefix: string) {
  return calls.filter((call) => call.url === prefix || call.url.startsWith(`${prefix}?`));
}

function selectModel() {
  localStorage.setItem(MODEL_SETTINGS_STORAGE_KEY, JSON.stringify({ enabledModels: {}, selectedProvider: "openai", selectedModel: "gpt-test", maxOutputTokens: 1500, temperature: 0.4 }));
}

async function loadReady() {
  const hook = renderHook(() => useBlueprint());
  await act(async () => {
    await hook.result.current.loadFromGitHub(INPUT);
  });
  expect(hook.result.current.status).toBe("ready");
  return hook;
}

let hidden = false;

beforeEach(() => {
  draftStore.drafts.clear();
  draftStore.handle = null;
  localStorage.clear();
  calls = [];
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  routes = {
    blueprint: () => json(payload()),
    edit: () => json({ source: "parser", unknown: { message: "?", examples: [] } }),
    commits: () => json({ head: { sha: COMMIT, message: "Initial", author: "Dana", date: "2026-11-20T10:00:00Z" }, recent: [{ sha: COMMIT, message: "Initial", author: "Dana", date: "2026-11-20T10:00:00Z" }] }),
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, body, signal: init?.signal ?? null });
    if (url === "/api/blueprint") return routes.blueprint();
    if (url === "/api/blueprint/edit") return routes.edit(body ?? {}, init);
    if (url.startsWith("/api/blueprint/commits?")) return routes.commits(url);
    throw new Error(`unexpected fetch ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("telling Rassam what to change", () => {
  it("starts idle with suggestions, live state and no receipts", async () => {
    const { result } = await loadReady();
    expect(result.current.intent).toEqual({ status: "idle" });
    expect(result.current.receipts).toEqual([]);
    expect(result.current.systemStatus).toBeNull();
    expect(result.current.suggestions.length).toBeGreaterThan(0);
    expect(result.current.suggestions.length).toBeLessThanOrEqual(6);
    expect(result.current.suggestions).toContain("no cycles");
    expect(result.current.live).toEqual({ watching: false, checking: false, current: { sha: COMMIT }, latest: null, behind: false, lastChange: null, history: [] });
  });

  it("previews a parsed instruction, applies it as one undo step and records a receipt", async () => {
    const { result } = await loadReady();
    const before = result.current.blueprint;

    await act(async () => {
      await result.current.proposeIntent("forbid app from importing lib");
    });

    expect(callsTo("/api/blueprint/edit")).toHaveLength(0);
    const intent = result.current.intent;
    if (intent.status !== "proposed") throw new Error(`unexpected intent ${intent.status}`);
    const proposal = intent.proposal;
    expect(proposal.source).toBe("parser");
    expect(proposal.instruction).toBe("forbid app from importing lib");
    expect(proposal.edits).toEqual([expect.objectContaining({ op: "forbid_dependency", from: "app", to: "lib" })]);
    expect(proposal.applied).toHaveLength(1);
    expect(proposal.interpretation).toMatch(/Forbade/);
    expect(proposal.delta.rulesAdded).toHaveLength(1);
    expect(proposal.weakens).toBe(false);
    expect(proposal.preview.rules).toHaveLength(1);
    expect(proposal.preview.rules[0].provenance?.source).toBe("human");
    // The preview is checked against the observed graph: app -> lib exists, so the new rule is broken.
    expect(proposal.previewReport?.summary.errors).toBeGreaterThan(0);
    expect(proposal.graphDiff?.edges.statusChanged).toEqual([{ from: "app", to: "lib", before: "declared", after: "forbidden" }]);
    // Nothing is applied yet.
    expect(result.current.blueprint).toBe(before);
    expect(result.current.blueprint?.rules).toHaveLength(0);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.applyProposal());
    expect(result.current.intent).toEqual({ status: "idle" });
    expect(result.current.blueprint?.rules).toHaveLength(1);
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.receipts).toEqual([{ id: expect.any(String), label: proposal.interpretation, at: expect.any(String) }]);
    expect(result.current.report?.summary.errors).toBeGreaterThan(0);

    act(() => result.current.undo());
    expect(result.current.blueprint?.rules).toHaveLength(0);
    expect(result.current.dirty).toBe(false);
    act(() => result.current.redo());
    expect(result.current.blueprint?.rules).toHaveLength(1);
  });

  it("discards a proposal without touching the blueprint", async () => {
    const { result } = await loadReady();
    const before = result.current.blueprint;
    await act(async () => {
      await result.current.proposeIntent("remove component lib");
    });
    expect(result.current.intent.status).toBe("proposed");
    if (result.current.intent.status === "proposed") expect(result.current.intent.proposal.weakens).toBe(true);

    act(() => result.current.discardProposal());
    expect(result.current.intent).toEqual({ status: "idle" });
    expect(result.current.blueprint).toBe(before);
    expect(result.current.receipts).toEqual([]);
    act(() => result.current.applyProposal());
    expect(result.current.blueprint).toBe(before);
  });

  it("asks which reading was meant and proposes the chosen one", async () => {
    const { result } = await loadReady();
    await act(async () => {
      await result.current.proposeIntent("forbid api from importing lib");
    });
    const intent = result.current.intent;
    if (intent.status !== "ambiguous") throw new Error(`unexpected intent ${intent.status}`);
    expect(intent.message).toMatch(/Which one/);
    expect(intent.options).toHaveLength(2);

    act(() => result.current.chooseIntentOption(7));
    expect(result.current.intent.status).toBe("ambiguous");

    const chosen = intent.options.findIndex((option) => option.label.includes("Admin API"));
    act(() => result.current.chooseIntentOption(chosen));
    const next = result.current.intent;
    if (next.status !== "proposed") throw new Error(`unexpected intent ${next.status}`);
    expect(next.proposal.instruction).toBe("forbid api from importing lib");
    expect(next.proposal.interpretation).toBe(intent.options[chosen].label);
    expect(next.proposal.edits).toEqual([expect.objectContaining({ from: "api-admin", to: "lib" })]);
  });

  it("sends manual edits through the same preview, and trivial ones straight to history", async () => {
    const { result } = await loadReady();

    act(() => result.current.proposeEdits([{ op: "add_component", name: "Payments", paths: ["src/payments/**"] }], "Add Payments"));
    const intent = result.current.intent;
    if (intent.status !== "proposed") throw new Error(`unexpected intent ${intent.status}`);
    expect(intent.proposal.source).toBe("manual");
    expect(intent.proposal.interpretation).toBe("Add Payments");
    expect(intent.proposal.delta.componentsAdded).toEqual(["payments"]);
    expect(intent.proposal.graphDiff?.components.added).toEqual(["payments"]);
    expect(intent.proposal.edits[0]).toMatchObject({ op: "add_component", paths: ["src/payments/**"] });
    expect(result.current.blueprint?.components).toHaveLength(4);
    act(() => result.current.applyProposal());
    expect(result.current.blueprint?.components.map((item) => item.id)).toContain("payments");

    act(() => result.current.applyEditsNow([{ op: "update_component", id: "lib", set: { intent: "Shared helpers" } }], "Describe Lib"));
    expect(result.current.intent).toEqual({ status: "idle" });
    expect(result.current.blueprint?.components.find((item) => item.id === "lib")?.intent).toBe("Shared helpers");
    expect(result.current.receipts.map((receipt) => receipt.label)).toEqual(["Describe Lib", "Add Payments"]);

    act(() => result.current.undo());
    expect(result.current.blueprint?.components.find((item) => item.id === "lib")?.intent).toBeUndefined();

    // Invalid manual edits are refused with a readable message and change nothing.
    const before = result.current.blueprint;
    act(() => result.current.applyEditsNow([{ op: "remove_component", id: "nope" }], "Remove nope"));
    expect(result.current.error).toMatch(/Change rejected/);
    expect(result.current.blueprint).toBe(before);
    act(() => result.current.proposeEdits([{ op: "remove_rule", id: "nope" }], "Remove rule"));
    expect(result.current.intent.status).toBe("error");
  });

  it("re-applies a proposal to the current draft when the draft moved on", async () => {
    const { result } = await loadReady();
    await act(async () => {
      await result.current.proposeIntent("forbid app from importing lib");
    });
    act(() => result.current.applyEditsNow([{ op: "update_component", id: "app", set: { intent: "Pages" } }], "Describe App"));
    act(() => result.current.applyProposal());
    expect(result.current.blueprint?.rules).toHaveLength(1);
    expect(result.current.blueprint?.components.find((item) => item.id === "app")?.intent).toBe("Pages");
  });

  it("keeps at most 10 receipts, newest first", async () => {
    const { result } = await loadReady();
    for (let index = 0; index < 12; index += 1) {
      act(() => result.current.applyEditsNow([{ op: "update_component", id: "lib", set: { description: `v${index}` } }], `Change ${index}`));
    }
    expect(result.current.receipts).toHaveLength(10);
    expect(result.current.receipts[0].label).toBe("Change 11");
    expect(new Set(result.current.receipts.map((receipt) => receipt.id)).size).toBe(10);
  });

  it("says what it understands when nothing parses and no model is selected", async () => {
    const { result } = await loadReady();
    await act(async () => {
      await result.current.proposeIntent("tidy things up so billing is isolated");
    });
    const intent = result.current.intent;
    if (intent.status !== "unknown") throw new Error(`unexpected intent ${intent.status}`);
    expect(intent.instruction).toBe("tidy things up so billing is isolated");
    expect(intent.examples.length).toBeGreaterThan(0);
    expect(callsTo("/api/blueprint/edit")).toHaveLength(0);
  });

  it("falls back to the selected model and stamps its edits as agent-authored", async () => {
    selectModel();
    let release: (response: Response) => void = () => undefined;
    routes.edit = () => new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { result } = await loadReady();

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.proposeIntent("  keep the admin area away from the shared code  ", { selection: ["api-admin"] });
    });
    expect(result.current.intent).toEqual({ status: "thinking", instruction: "keep the admin area away from the shared code" });

    await act(async () => {
      release(json({
        source: "model",
        model: "openai/gpt-test",
        edits: [{ op: "forbid_dependency", from: "api-admin", to: "lib", reason: "Admin is isolated" }],
        interpretation: "Forbade Admin API from depending on Lib.",
        questions: ["Should the public API be isolated too?"],
      }));
      await pending;
    });

    const request = callsTo("/api/blueprint/edit")[0];
    expect(request.body).toMatchObject({
      instruction: "keep the admin area away from the shared code",
      modelSettings: { providerId: "openai", model: "gpt-test", maxTokens: 1500, temperature: 0.4 },
      context: { edges: [{ from: "app", to: "lib", status: "declared" }], selection: ["api-admin"] },
    });
    expect((request.body?.blueprint as Blueprint).components).toHaveLength(4);

    const intent = result.current.intent;
    if (intent.status !== "proposed") throw new Error(`unexpected intent ${intent.status}`);
    expect(intent.proposal.source).toBe("model");
    expect(intent.proposal.model).toBe("openai/gpt-test");
    expect(intent.proposal.questions).toEqual(["Should the public API be isolated too?"]);
    expect(intent.proposal.preview.rules[0].provenance).toMatchObject({ source: "agent", by: "openai/gpt-test" });
    expect(result.current.blueprint?.rules).toHaveLength(0);

    act(() => result.current.applyProposal());
    expect(result.current.blueprint?.rules[0].provenance?.source).toBe("agent");
    expect(result.current.receipts[0].label).toBe("Forbade Admin API from depending on Lib.");
  });

  it("shows the model's question when it proposes nothing, and errors readably", async () => {
    selectModel();
    const { result } = await loadReady();

    routes.edit = () => json({ source: "model", model: "openai/gpt-test", edits: [], interpretation: "No changes proposed.", questions: ["Which files are billing?"] });
    await act(async () => {
      await result.current.proposeIntent("isolate billing please");
    });
    expect(result.current.intent).toMatchObject({ status: "unknown", message: "Which files are billing?" });

    routes.edit = () => json({ code: "CANVAS_PATCH_INVALID", message: "The model could not produce a valid blueprint change. Nothing was changed.", retryable: true }, 422);
    await act(async () => {
      await result.current.proposeIntent("isolate billing please");
    });
    expect(result.current.intent).toEqual({ status: "error", instruction: "isolate billing please", message: "The model could not produce a valid blueprint change. Nothing was changed." });

    // Edits that do not fit the blueprint are refused in the browser too.
    routes.edit = () => json({ source: "model", model: "openai/gpt-test", edits: [{ op: "remove_rule", id: "ghost" }], interpretation: "x" });
    await act(async () => {
      await result.current.proposeIntent("isolate billing please");
    });
    expect(result.current.intent.status).toBe("error");
    expect(result.current.blueprint?.rules).toHaveLength(0);
  });

  it("aborts an in-flight model request when a new instruction arrives", async () => {
    selectModel();
    routes.edit = (_body, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const { result } = await loadReady();

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.proposeIntent("isolate billing please");
    });
    expect(result.current.intent.status).toBe("thinking");

    await act(async () => {
      await result.current.proposeIntent("no cycles");
      await first;
    });
    expect(callsTo("/api/blueprint/edit")[0].signal?.aborted).toBe(true);
    const intent = result.current.intent;
    if (intent.status !== "proposed") throw new Error(`unexpected intent ${intent.status}`);
    expect(intent.proposal.edits[0].op).toBe("forbid_cycles");
  });

  it("reads live status from the response", async () => {
    const status = { version: 1, checkedAt: "2026-11-20T10:00:00Z", components: { app: { state: "up", source: "health-check" } } };
    routes.blueprint = () => json(payload({ status }));
    const { result } = await loadReady();
    expect(result.current.systemStatus).toEqual(status);
    // The load state keeps its name and meaning.
    expect(result.current.status).toBe("ready");

    routes.blueprint = () => json(payload({ status: { version: 99 } }));
    await act(async () => {
      await result.current.rescan();
    });
    expect(result.current.systemStatus).toBeNull();
  });
});

describe("following a GitHub repository", () => {
  const head = (commit: string, message: string) => ({ sha: commit, message, author: "Dana", date: "2026-11-21T10:00:00Z" });

  it("polls every 45 s while visible, pauses when hidden and backs off on errors", async () => {
    const { result } = await loadReady();
    vi.useFakeTimers();

    await act(async () => {
      result.current.setWatching(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.live.watching).toBe(true);
    expect(callsTo("/api/blueprint/commits")).toHaveLength(1);
    expect(callsTo("/api/blueprint/commits")[0].url).toBe("/api/blueprint/commits?owner=fixture-owner&repo=fixture-repo");
    expect(result.current.live.latest).toMatchObject({ sha: COMMIT, message: "Initial" });
    expect(result.current.live.current).toEqual({ sha: COMMIT, message: "Initial", author: "Dana", date: "2026-11-20T10:00:00Z" });
    expect(result.current.live.behind).toBe(false);
    expect(result.current.live.checking).toBe(false);

    routes.commits = () => json({ head: head(NEXT, "Lib imports app"), recent: [head(NEXT, "Lib imports app"), head(COMMIT, "Initial")] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(44_000);
    });
    expect(callsTo("/api/blueprint/commits")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(callsTo("/api/blueprint/commits")).toHaveLength(2);
    expect(result.current.live.latest?.sha).toBe(NEXT);
    expect(result.current.live.behind).toBe(true);
    // Polling never moves the view by itself.
    expect(result.current.live.current?.sha).toBe(COMMIT);

    // Hidden tab: no polling.
    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(5 * 45_000);
    });
    expect(callsTo("/api/blueprint/commits")).toHaveLength(2);

    // Visible again: checks at once.
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(callsTo("/api/blueprint/commits")).toHaveLength(3);

    // Errors double the wait.
    routes.commits = () => json({ code: "GITHUB_UNAVAILABLE", message: "down" }, 502);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(callsTo("/api/blueprint/commits")).toHaveLength(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(callsTo("/api/blueprint/commits")).toHaveLength(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(callsTo("/api/blueprint/commits")).toHaveLength(5);
    expect(result.current.error).toBeNull();
    expect(result.current.live.latest?.sha).toBe(NEXT);

    // Turning it off stops the timer.
    await act(async () => {
      result.current.setWatching(false);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(result.current.live.watching).toBe(false);
    expect(callsTo("/api/blueprint/commits")).toHaveLength(5);
  });

  it("explains that it needs a way to get access before it can sync", async () => {
    const { result } = await loadReady();
    routes.commits = () => json({ head: head(NEXT, "Lib imports app"), recent: [head(NEXT, "Lib imports app")] });
    await act(async () => {
      await result.current.syncToLatest();
    });
    expect(result.current.live.behind).toBe(true);
    expect(result.current.error).toMatch(/Reload the project/);
    expect(callsTo("/api/blueprint")).toHaveLength(1);

    const getSourceGrant = vi.fn(async () => null);
    act(() => result.current.configureLive({ getSourceGrant }));
    await act(async () => {
      await result.current.syncToLatest();
    });
    expect(getSourceGrant).toHaveBeenCalledWith(NEXT);
    expect(result.current.error).toMatch(/Access to the latest commit/);
    expect(result.current.source).toMatchObject({ commitSha: COMMIT });
  });

  it("syncs to the latest commit, reports what changed and keeps unsaved work", async () => {
    const { result } = await loadReady();
    act(() => result.current.applyEditsNow([{ op: "update_component", id: "lib", set: { intent: "Shared helpers" } }], "Describe Lib"));
    const draft = result.current.blueprint;

    routes.commits = () => json({ head: head(NEXT, "Lib imports app"), recent: [head(NEXT, "Lib imports app"), head(COMMIT, "Initial")] });
    routes.blueprint = () => json(payload({ files: NEXT_FILES, commitSha: NEXT }));
    const getSourceGrant = vi.fn(async () => "n".repeat(64));
    act(() => result.current.configureLive({ getSourceGrant }));

    await act(async () => {
      await result.current.syncToLatest();
    });

    expect(getSourceGrant).toHaveBeenCalledWith(NEXT);
    expect(callsTo("/api/blueprint")[1].body).toEqual({ owner: "fixture-owner", repo: "fixture-repo", commitSha: NEXT, sourceGrant: "n".repeat(64) });
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("ready");
    expect(result.current.source).toMatchObject({ kind: "github", commitSha: NEXT });
    expect(result.current.live.current).toMatchObject({ sha: NEXT, message: "Lib imports app" });
    expect(result.current.live.behind).toBe(false);
    expect(result.current.live.checking).toBe(false);
    const change = result.current.live.lastChange;
    expect(change).toMatchObject({ fromSha: COMMIT, toSha: NEXT, at: expect.any(String) });
    expect(change?.diff.changed).toBe(true);
    expect(change?.diff.edges.added).toEqual([expect.objectContaining({ from: "lib", to: "app", status: "undeclared" })]);
    expect(result.current.live.history).toEqual([{ sha: NEXT, message: "Lib imports app", date: "2026-11-21T10:00:00Z", summary: change?.diff.summary }]);
    // Unsaved work survives, with its undo history.
    expect(result.current.blueprint).toBe(draft);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.workspace?.graphView().edges).toContainEqual(expect.objectContaining({ from: "lib", to: "app" }));

    // Already at the latest commit: nothing to do.
    await act(async () => {
      await result.current.syncToLatest();
    });
    expect(callsTo("/api/blueprint")).toHaveLength(2);

    // A later rescan re-reads the commit the view now shows.
    await act(async () => {
      await result.current.rescan();
    });
    expect(callsTo("/api/blueprint")[2].body).toMatchObject({ commitSha: NEXT, sourceGrant: "n".repeat(64) });
  });

  it("follows the repository's own contract when there is no unsaved work", async () => {
    const { result } = await loadReady();
    const updated = contract();
    updated.rules.push({ id: "lib-is-a-leaf", kind: "forbid", from: "lib", to: "app" });
    routes.commits = () => json({ head: head(NEXT, "Add rule"), recent: [head(NEXT, "Add rule")] });
    routes.blueprint = () => json(payload({ files: NEXT_FILES, commitSha: NEXT, blueprint: updated }));
    act(() => result.current.configureLive({ getSourceGrant: async () => "n".repeat(64) }));

    await act(async () => {
      await result.current.syncToLatest();
    });
    expect(result.current.blueprint?.rules.map((rule) => rule.id)).toEqual(["lib-is-a-leaf"]);
    expect(result.current.dirty).toBe(false);
    expect(result.current.live.lastChange?.diff.edges.added).toEqual([expect.objectContaining({ from: "lib", to: "app", status: "forbidden" })]);
  });

  it("stays on the shown commit when the sync fails", async () => {
    const { result } = await loadReady();
    routes.commits = () => json({ head: head(NEXT, "x"), recent: [head(NEXT, "x")] });
    routes.blueprint = () => json({ code: "GITHUB_UNAVAILABLE", message: "down", retryable: true }, 502);
    act(() => result.current.configureLive({ getSourceGrant: async () => "n".repeat(64) }));
    await act(async () => {
      await result.current.syncToLatest();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toMatch(/GitHub is temporarily unavailable/);
    expect(result.current.source).toMatchObject({ commitSha: COMMIT });
    expect(result.current.live.lastChange).toBeNull();
    expect(result.current.live.checking).toBe(false);

    routes.blueprint = () => json(payload());
    await act(async () => {
      await result.current.rescan();
    });
    expect(callsTo("/api/blueprint").at(-1)?.body).toMatchObject({ commitSha: COMMIT, sourceGrant: INPUT.sourceGrant });
  });
});

// ── Local folders ─────────────────────────────────────────────

type Tree = { [name: string]: string | Tree };

function fakeFolder(tree: Tree, name: string): LocalDirectoryHandle {
  const encoder = new TextEncoder();
  const file = (node: Tree, key: string): LocalFileHandle => ({
    kind: "file",
    name: key,
    async getFile() {
      const bytes = encoder.encode(node[key] as string);
      return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer };
    },
  });
  const directory = (node: Tree, dirName: string): LocalDirectoryHandle => ({
    kind: "directory",
    name: dirName,
    values() {
      const entries = Object.keys(node).map((key) => (typeof node[key] === "string" ? file(node, key) : directory(node[key] as Tree, key)));
      return (async function* iterate() {
        yield* entries;
      })();
    },
    async getDirectoryHandle(key) {
      if (!(key in node)) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
      return directory(node[key] as Tree, key);
    },
    async getFileHandle(key) {
      if (!(key in node)) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
      return file(node, key);
    },
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
  });
  return directory(tree, name);
}

describe("following a local folder", () => {
  it("re-scans on window focus and reports what changed in the graph", async () => {
    const lib: Tree = { "helper.ts": "export const helper = () => 1;\n" };
    const tree: Tree = {
      ".rassam": {
        "blueprint.json": serializeBlueprint(contract()),
        "status.json": JSON.stringify({ version: 1, checkedAt: "2026-11-20T10:00:00Z", components: { app: { state: "degraded", source: "manual" } } }),
      },
      src: { app: { "page.ts": "import { helper } from '../lib/helper';\nexport const page = helper();\n" }, lib },
    };
    Object.assign(window, { showDirectoryPicker: vi.fn(async () => fakeFolder(tree, "local-app")) });

    const { result } = renderHook(() => useBlueprint());
    await act(async () => {
      await result.current.openLocalFolder();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.systemStatus?.components.app.state).toBe("degraded");
    expect(result.current.live.current).toBeNull();

    act(() => result.current.setWatching(true));

    // Focus with nothing changed: no report.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await new Promise((resolve) => setTimeout(resolve, 900));
    await waitFor(() => expect(result.current.live.checking).toBe(false));
    expect(result.current.live.lastChange).toBeNull();
    expect(result.current.status).toBe("ready");

    lib["back.ts"] = "import { page } from '../app/page';\nexport const back = page;\n";
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current.live.lastChange).not.toBeNull(), { timeout: 4_000 });
    const change = result.current.live.lastChange;
    expect(change?.diff.edges.added).toEqual([expect.objectContaining({ from: "lib", to: "app" })]);
    expect(Date.parse(change?.toSha ?? "")).toBeGreaterThanOrEqual(Date.parse(change?.fromSha ?? ""));
    expect(result.current.live.history).toHaveLength(1);
    expect(result.current.live.history[0].summary).toBe(change?.diff.summary);
    expect(result.current.error).toBeNull();

    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
});
