// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveBlueprint } from "@/blueprint/derive";
import { buildFileGraph } from "@/blueprint/imports";
import { analyzeReach } from "@/blueprint/reach";
import { emptyBlueprint, parseBlueprintText, serializeBlueprint, type Blueprint } from "@/blueprint/schema";
import { serializeFileGraph } from "@/blueprint/snapshot";
import type { SourceFile } from "@/blueprint/types";
import type { BlueprintDraftRecord } from "@/lib/blueprint-client/drafts";
import type { LocalDirectoryHandle, LocalFileHandle } from "@/lib/blueprint-client/local-folder";

const draftStore = vi.hoisted(() => ({
  drafts: new Map<string, unknown>(),
  handle: null as unknown,
}));

vi.mock("@/lib/blueprint-client/drafts", () => ({
  githubSessionKey: (owner: string, repo: string) => `github:${owner.toLowerCase()}/${repo.toLowerCase()}`,
  localSessionKey: (name: string) => `local:${name}`,
  loadDraft: vi.fn(async (key: string) => draftStore.drafts.get(key) ?? null),
  saveDraft: vi.fn(async (record: { sessionKey: string }) => {
    draftStore.drafts.set(record.sessionKey, { ...record, updatedAt: 1 });
    return true;
  }),
  deleteDraft: vi.fn(async (key: string) => draftStore.drafts.delete(key)),
  saveDirectoryHandle: vi.fn(async (handle: unknown) => {
    draftStore.handle = handle;
    return true;
  }),
  loadDirectoryHandle: vi.fn(async () => (draftStore.handle ? { id: "last", name: "x", handle: draftStore.handle, updatedAt: 1 } : null)),
  deleteDirectoryHandle: vi.fn(async () => true),
}));

import { useBlueprint } from "./useBlueprint";

const COMMIT = "a".repeat(40);
const INPUT = { owner: "Fixture-Owner", repo: "fixture-repo", commitSha: COMMIT, sourceGrant: "g".repeat(64) };
const SESSION_KEY = "github:fixture-owner/fixture-repo";

const FILES: SourceFile[] = [
  { path: "src/app/page.ts", content: "import { helper } from '../lib/helper';\nexport const page = helper();\n" },
  { path: "src/lib/helper.ts", content: "export const helper = () => 1;\n" },
  { path: "package.json", content: "{\"name\":\"fixture\"}" },
];

function repositoryBlueprint(): Blueprint {
  const blueprint = emptyBlueprint("Fixture System");
  blueprint.components.push(
    { id: "app", name: "App", kind: "module", paths: ["src/app/**"] },
    { id: "lib", name: "Lib", kind: "module", paths: ["src/lib/**"] },
  );
  blueprint.dependencies.push({ from: "app", to: "lib" });
  return blueprint;
}

function payload(options: { blueprintText?: string | null; layout?: Record<string, { x: number; y: number }> | null } = {}) {
  const graph = buildFileGraph(FILES);
  const blueprintText = options.blueprintText ?? null;
  const parsed = blueprintText !== null ? parseBlueprintText(blueprintText) : null;
  return {
    requestId: "request-1",
    commitSha: COMMIT,
    blueprintText,
    blueprint: parsed?.ok ? parsed.blueprint : null,
    issues: parsed && !parsed.ok ? parsed.issues : [],
    draft: parsed?.ok ? null : deriveBlueprint(FILES, { repository: "github.com/fixture-owner/fixture-repo", commit: COMMIT }),
    layout: options.layout ?? null,
    graph: serializeFileGraph(graph),
    reach: analyzeReach(FILES, graph),
    stats: { filesFetched: FILES.length, bytes: 100, treeEntries: FILES.length },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function loadReady(body: unknown = payload({ blueprintText: serializeBlueprint(repositoryBlueprint()) })) {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
  const hook = renderHook(() => useBlueprint());
  await act(async () => {
    await hook.result.current.loadFromGitHub(INPUT);
  });
  return hook;
}

beforeEach(() => {
  draftStore.drafts.clear();
  draftStore.handle = null;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useBlueprint with a GitHub source", () => {
  it("loads the repository blueprint and evaluates it against the observed graph", async () => {
    const text = serializeBlueprint(repositoryBlueprint());
    const { result } = await loadReady(payload({ blueprintText: text, layout: { app: { x: 5, y: 6 } } }));

    expect(fetch).toHaveBeenCalledWith("/api/blueprint", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual(INPUT);
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.source).toEqual({ kind: "github", owner: "Fixture-Owner", repo: "fixture-repo", commitSha: COMMIT });
    expect(result.current.origin).toBe("repository");
    expect(result.current.savedText).toBe(text);
    expect(result.current.dirty).toBe(false);
    expect(result.current.issues).toEqual([]);
    expect(result.current.layout).toEqual({ app: { x: 5, y: 6 } });
    expect(result.current.canSaveToDisk).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.workspace?.componentOf("src/app/page.ts")).toBe("app");
    expect(result.current.workspace?.graphView().edges).toEqual([
      expect.objectContaining({ from: "app", to: "lib", status: "declared" }),
    ]);
    expect(result.current.report?.mode).toBe("full");
    expect(result.current.report?.blueprint.valid).toBe(true);
  });

  it("is not dirty when the repository file is valid but not canonically formatted", async () => {
    const compact = JSON.stringify(repositoryBlueprint());
    const { result } = await loadReady(payload({ blueprintText: compact }));
    expect(result.current.savedText).toBe(compact);
    expect(result.current.dirty).toBe(false);
  });

  it("offers a derived draft when the repository has no blueprint", async () => {
    const { result } = await loadReady(payload());

    expect(result.current.status).toBe("ready");
    expect(result.current.origin).toBe("derived");
    expect(result.current.savedText).toBeNull();
    expect(result.current.blueprint?.components.length).toBeGreaterThan(0);
    expect(result.current.dirty).toBe(true);
    expect(result.current.report).not.toBeNull();

    act(() => result.current.adoptDraft());
    expect(result.current.origin).toBe("repository");
    expect(result.current.dirty).toBe(true);

    act(() => result.current.startEmpty("Fresh"));
    expect(result.current.origin).toBe("empty");
    expect(result.current.blueprint?.system.name).toBe("Fresh");
    expect(result.current.blueprint?.components).toEqual([]);
    expect(result.current.workspace).not.toBeNull();
  });

  it("keeps parse issues and a derived draft when the repository file is invalid", async () => {
    const { result } = await loadReady(payload({ blueprintText: "{ nope" }));
    expect(result.current.origin).toBe("derived");
    expect(result.current.savedText).toBe("{ nope");
    expect(result.current.issues[0].message).toMatch(/Invalid JSON/);
    expect(result.current.dirty).toBe(true);
  });

  it("applies valid edits immutably and rejects invalid ones with a readable error", async () => {
    const { result } = await loadReady();
    const before = result.current.blueprint;

    act(() => result.current.update((draft) => {
      draft.components.push({ id: "api", name: "API", kind: "module", paths: ["src/api/**"] });
    }, "Add API"));

    expect(result.current.blueprint).not.toBe(before);
    expect(before?.components.map((component) => component.id)).toEqual(["app", "lib"]);
    expect(result.current.blueprint?.components.map((component) => component.id)).toEqual(["app", "lib", "api"]);
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.error).toBeNull();
    const afterValid = result.current.blueprint;

    act(() => result.current.update((draft) => {
      draft.dependencies.push({ from: "app", to: "missing" });
    }));
    expect(result.current.blueprint).toBe(afterValid);
    expect(result.current.error).toMatch(/Change rejected: .*Unknown component "missing"/);

    act(() => result.current.update((draft) => ({ ...draft, version: "9.9" }) as unknown as Blueprint));
    expect(result.current.blueprint).toBe(afterValid);
    expect(result.current.error).toMatch(/^Change rejected:/);

    // A no-op edit clears the error and adds no history entry.
    act(() => result.current.update(() => undefined));
    expect(result.current.error).toBeNull();
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
  });

  it("supports undo and redo across edits and discards back to the saved file", async () => {
    const { result } = await loadReady();
    const original = result.current.blueprint;

    act(() => {
      result.current.update((draft) => {
        draft.system.name = "Renamed once";
      });
      result.current.update((draft) => {
        draft.system.name = "Renamed twice";
      });
    });
    expect(result.current.blueprint?.system.name).toBe("Renamed twice");

    act(() => result.current.undo());
    expect(result.current.blueprint?.system.name).toBe("Renamed once");
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.blueprint).toBe(original);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(result.current.blueprint?.system.name).toBe("Renamed twice");
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    act(() => result.current.update((draft) => {
      draft.system.name = "Branch";
    }));
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.discardChanges());
    expect(result.current.blueprint).toBe(original);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps at most 50 undo steps", async () => {
    const { result } = await loadReady();
    act(() => {
      for (let index = 0; index < 60; index += 1) {
        result.current.update((draft) => {
          draft.system.name = `Name ${index}`;
        });
      }
    });
    let steps = 0;
    while (result.current.canUndo && steps < 100) {
      act(() => result.current.undo());
      steps += 1;
    }
    expect(steps).toBe(50);
    expect(result.current.blueprint?.system.name).toBe("Name 9");
  });

  it("stamps verifications with the source commit", async () => {
    const { result } = await loadReady();

    act(() => result.current.verify("app", " Dana ", "checked imports"));
    const component = result.current.blueprint?.components.find((item) => item.id === "app");
    expect(component?.verified).toMatchObject({ by: "Dana", commit: COMMIT, note: "checked imports" });
    expect(Number.isNaN(Date.parse(component?.verified?.at ?? ""))).toBe(false);

    act(() => result.current.verify("app->lib", "Dana"));
    expect(result.current.blueprint?.dependencies[0].verified).toMatchObject({ by: "Dana", commit: COMMIT });
    expect(result.current.dirty).toBe(true);

    act(() => result.current.verify("nope", "Dana"));
    expect(result.current.error).toMatch(/Could not verify/);
    act(() => result.current.verify("lib", "  "));
    expect(result.current.error).toMatch(/who is verifying/);

    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(result.current.blueprint?.components[0].verified).toBeUndefined();
  });

  it("records positions without marking the blueprint dirty", async () => {
    const { result } = await loadReady();
    act(() => result.current.setPosition("app", { x: 12, y: 34 }));
    expect(result.current.layout).toEqual({ app: { x: 12, y: 34 } });
    expect(result.current.dirty).toBe(false);
    act(() => result.current.setPosition("app", { x: Number.NaN, y: 0 }));
    expect(result.current.layout).toEqual({ app: { x: 12, y: 34 } });
  });

  it("surfaces server errors as readable messages", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      error: "Source grant has expired",
      code: "SOURCE_GRANT_EXPIRED",
      message: "Source grant has expired",
      retryable: false,
      requestId: "r",
    }, 401));
    const { result } = renderHook(() => useBlueprint());
    await act(async () => {
      await result.current.loadFromGitHub(INPUT);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/expired\. Refresh the project/);
    expect(result.current.blueprint).toBeNull();

    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      await result.current.loadFromGitHub(INPUT);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/Could not reach the server/);
  });

  it("aborts an in-flight load when a new one starts, and on close", async () => {
    const signals: AbortSignal[] = [];
    let resolveSecond: (response: Response) => void = () => undefined;
    vi.mocked(fetch)
      .mockImplementationOnce((_url, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signals.push(signal);
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }))
      .mockImplementationOnce((_url, init) => new Promise<Response>((resolve) => {
        signals.push(init?.signal as AbortSignal);
        resolveSecond = resolve;
      }));
    const { result } = renderHook(() => useBlueprint());

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadFromGitHub(INPUT);
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.progress?.phase).toBeTruthy();
    act(() => {
      second = result.current.loadFromGitHub({ ...INPUT, repo: "second-repo" });
    });
    expect(signals[0].aborted).toBe(true);

    await act(async () => {
      resolveSecond(jsonResponse(payload({ blueprintText: serializeBlueprint(repositoryBlueprint()) })));
      await Promise.all([first, second]);
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
    expect(result.current.source).toMatchObject({ repo: "second-repo" });

    act(() => result.current.close());
    expect(result.current.status).toBe("idle");
    expect(result.current.blueprint).toBeNull();
    expect(result.current.workspace).toBeNull();
  });

  it("restores a stored draft that differs from the repository file and persists later edits", async () => {
    const edited = repositoryBlueprint();
    edited.system.name = "Edited Offline";
    const stored: BlueprintDraftRecord = {
      sessionKey: SESSION_KEY,
      blueprintText: serializeBlueprint(edited),
      layout: { lib: { x: 7, y: 8 } },
      savedText: null,
      updatedAt: 1,
    };
    draftStore.drafts.set(SESSION_KEY, stored);

    const { result, unmount } = await loadReady(payload({
      blueprintText: serializeBlueprint(repositoryBlueprint()),
      layout: { app: { x: 1, y: 2 } },
    }));

    expect(result.current.blueprint?.system.name).toBe("Edited Offline");
    expect(result.current.origin).toBe("repository");
    expect(result.current.dirty).toBe(true);
    expect(result.current.layout).toEqual({ app: { x: 1, y: 2 }, lib: { x: 7, y: 8 } });

    act(() => result.current.update((draft) => {
      draft.system.name = "Edited Again";
    }));
    await waitFor(() => {
      const record = draftStore.drafts.get(SESSION_KEY) as BlueprintDraftRecord;
      expect(record.blueprintText).toContain("Edited Again");
    }, { timeout: 3_000 });

    // Discarding stores only the layout; unmount flushes the pending write.
    act(() => result.current.discardChanges());
    expect(result.current.blueprint?.system.name).toBe("Fixture System");
    unmount();
    const record = draftStore.drafts.get(SESSION_KEY) as BlueprintDraftRecord;
    expect(record.blueprintText).toBeNull();
    expect(record.layout).toEqual({ app: { x: 1, y: 2 }, lib: { x: 7, y: 8 } });
  });

  it("rescans the source while keeping the working draft", async () => {
    const { result } = await loadReady();
    act(() => result.current.update((draft) => {
      draft.system.name = "Work in progress";
    }));

    const upstream = repositoryBlueprint();
    upstream.system.name = "Changed Upstream";
    vi.mocked(fetch).mockResolvedValue(jsonResponse(payload({ blueprintText: serializeBlueprint(upstream) })));
    await act(async () => {
      await result.current.rescan();
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.blueprint?.system.name).toBe("Work in progress");
    expect(result.current.savedText).toBe(serializeBlueprint(upstream));
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.discardChanges());
    expect(result.current.blueprint?.system.name).toBe("Changed Upstream");
  });

  it("copies and downloads the serialized draft", async () => {
    const { result } = await loadReady();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await act(async () => {
      await result.current.copyToClipboard();
    });
    expect(writeText).toHaveBeenCalledWith(serializeBlueprint(result.current.blueprint as Blueprint));
    expect(parseBlueprintText(String(vi.mocked(writeText).mock.calls[0])).ok).toBe(true);

    const createObjectURL = vi.fn(() => "blob:fixture");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    act(() => result.current.download());
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    click.mockRestore();

    await act(async () => {
      await result.current.saveToDisk();
    });
    expect(result.current.error).toMatch(/needs a local folder/);
  });
});

// ── Local folders ─────────────────────────────────────────────

type Tree = { [name: string]: string | Tree };

function fakeFolder(tree: Tree, name: string) {
  const written = new Map<string, string>();
  const encoder = new TextEncoder();
  const file = (node: Tree, key: string, path: string): LocalFileHandle => ({
    kind: "file",
    name: key,
    async getFile() {
      const bytes = encoder.encode(node[key] as string);
      return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer };
    },
    async createWritable() {
      let buffer = "";
      return {
        write: async (data: string) => {
          buffer += data;
        },
        close: async () => {
          node[key] = buffer;
          written.set(path, buffer);
        },
      };
    },
  });
  const directory = (node: Tree, dirName: string, prefix: string): LocalDirectoryHandle => ({
    kind: "directory",
    name: dirName,
    values() {
      const entries = Object.keys(node).map((key) => {
        const path = prefix ? `${prefix}/${key}` : key;
        return typeof node[key] === "string" ? file(node, key, path) : directory(node[key] as Tree, key, path);
      });
      return (async function* iterate() {
        yield* entries;
      })();
    },
    async getDirectoryHandle(key, options) {
      if (!(key in node)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        node[key] = {};
      }
      return directory(node[key] as Tree, key, prefix ? `${prefix}/${key}` : key);
    },
    async getFileHandle(key, options) {
      if (!(key in node)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        node[key] = "";
      }
      return file(node, key, prefix ? `${prefix}/${key}` : key);
    },
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
  });
  return { handle: directory(tree, name, ""), written };
}

describe("useBlueprint with a local folder", () => {
  it("reports unsupported browsers without changing the session", async () => {
    const { result } = renderHook(() => useBlueprint());
    await act(async () => {
      await result.current.openLocalFolder();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toMatch(/cannot open local folders/);
    expect(await result.current.reopenLocalFolder()).toBe(false);
  });

  it("opens a folder, derives a draft, saves it to disk and reopens it later", async () => {
    const tree: Tree = {
      "package.json": "{\"name\":\"local-app\"}",
      src: {
        app: { "page.ts": "import { helper } from '../lib/helper';\nexport const page = helper();\n" },
        lib: { "helper.ts": "export const helper = () => 1;\n" },
      },
    };
    const folder = fakeFolder(tree, "local-app");
    Object.assign(window, { showDirectoryPicker: vi.fn(async () => folder.handle) });

    const { result } = renderHook(() => useBlueprint());
    await act(async () => {
      await result.current.openLocalFolder();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("ready");
    expect(result.current.source).toEqual({ kind: "local", name: "local-app" });
    expect(result.current.origin).toBe("derived");
    expect(result.current.savedText).toBeNull();
    expect(result.current.canSaveToDisk).toBe(true);
    expect(result.current.dirty).toBe(true);
    expect(result.current.workspace?.fileGraph.edges).toHaveLength(1);

    act(() => {
      result.current.update((draft) => {
        draft.system.name = "Local App";
      });
      result.current.verify(result.current.blueprint?.components[0].id ?? "", "Dana");
      result.current.setPosition("somewhere", { x: 3, y: 4 });
    });
    const verified = result.current.blueprint?.components[0].verified;
    expect(verified?.by).toBe("Dana");
    expect(verified?.commit).toBeUndefined();

    await act(async () => {
      await result.current.saveToDisk();
    });
    const saved = folder.written.get(".rassam/blueprint.json");
    expect(saved).toBe(serializeBlueprint(result.current.blueprint as Blueprint));
    expect(folder.written.get(".rassam/layout.json")).toContain("\"somewhere\"");
    expect(result.current.savedText).toBe(saved);
    expect(result.current.origin).toBe("repository");
    expect(result.current.dirty).toBe(false);
    expect(result.current.error).toBeNull();

    // A new session can reopen the remembered folder and finds the saved contract.
    act(() => result.current.close());
    draftStore.drafts.clear();
    let reopened = false;
    await act(async () => {
      reopened = await result.current.reopenLocalFolder();
    });
    expect(reopened).toBe(true);
    expect(result.current.origin).toBe("repository");
    expect(result.current.blueprint?.system.name).toBe("Local App");
    expect(result.current.dirty).toBe(false);
    expect(result.current.layout).toEqual({ somewhere: { x: 3, y: 4 } });

    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
});
