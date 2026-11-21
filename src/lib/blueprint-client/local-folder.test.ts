import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_ANALYZED_FILE_BYTES } from "@/blueprint/constants";

import { parseLayout, serializeLayout } from "./layout";
import {
  LocalFolderError,
  compileGitignore,
  pickLocalFolder,
  readLocalSnapshot,
  verifyPermission,
  writeBlueprintFile,
  writeLayoutFile,
  type LocalDirectoryHandle,
  type LocalFileHandle,
  type LocalPermissionMode,
  type LocalPermissionState,
} from "./local-folder";

type Tree = { [name: string]: string | Uint8Array | { size: number } | Tree };

interface FakeFs {
  root: LocalDirectoryHandle;
  /** Paths whose contents were opened with getFile(). */
  opened: string[];
  /** Directories that were enumerated. */
  walked: string[];
  written: Map<string, string>;
  created: string[];
  permission: { state: LocalPermissionState; onRequest: LocalPermissionState; requests: LocalPermissionMode[] };
}

function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !(value instanceof Uint8Array) && !("size" in value && typeof (value as { size: unknown }).size === "number" && Object.keys(value).length === 1);
}

function fakeFs(tree: Tree, name = "fixture"): FakeFs {
  const fs: FakeFs = {
    root: undefined as unknown as LocalDirectoryHandle,
    opened: [],
    walked: [],
    written: new Map(),
    created: [],
    permission: { state: "granted", onRequest: "granted", requests: [] },
  };
  const encoder = new TextEncoder();

  const fileHandle = (node: Tree, key: string, path: string): LocalFileHandle => ({
    kind: "file",
    name: key,
    async getFile() {
      fs.opened.push(path);
      const value = node[key];
      if (typeof value === "object" && !(value instanceof Uint8Array)) {
        const size = (value as { size: number }).size;
        return {
          size,
          arrayBuffer: async () => {
            throw new Error("oversized file must not be read");
          },
        };
      }
      const bytes = typeof value === "string" ? encoder.encode(value) : (value as Uint8Array);
      return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
    },
    async createWritable() {
      let buffer = "";
      return {
        write: async (data: string) => {
          buffer += data;
        },
        close: async () => {
          node[key] = buffer;
          fs.written.set(path, buffer);
        },
      };
    },
  });

  const directoryHandle = (node: Tree, dirName: string, prefix: string): LocalDirectoryHandle => ({
    kind: "directory",
    name: dirName,
    values() {
      fs.walked.push(prefix || ".");
      const entries = Object.keys(node).map((key) => {
        const path = prefix ? `${prefix}/${key}` : key;
        return isTree(node[key]) ? directoryHandle(node[key] as Tree, key, path) : fileHandle(node, key, path);
      });
      return (async function* iterate() {
        yield* entries;
      })();
    },
    async getDirectoryHandle(key, options) {
      const path = prefix ? `${prefix}/${key}` : key;
      if (!(key in node)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        node[key] = {};
        fs.created.push(path);
      }
      return directoryHandle(node[key] as Tree, key, path);
    },
    async getFileHandle(key, options) {
      const path = prefix ? `${prefix}/${key}` : key;
      if (!(key in node)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        node[key] = "";
        fs.created.push(path);
      }
      return fileHandle(node, key, path);
    },
    async queryPermission() {
      return fs.permission.state;
    },
    async requestPermission({ mode }) {
      fs.permission.requests.push(mode);
      fs.permission.state = fs.permission.onRequest;
      return fs.permission.state;
    },
  });

  fs.root = directoryHandle(tree, name, "");
  return fs;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readLocalSnapshot", () => {
  it("walks the folder, honoring default ignores and the root .gitignore", async () => {
    const fs = fakeFs({
      ".gitignore": "# comment\nsecrets/\n*.log\n/generated\n!keep.log\n",
      ".git": { HEAD: "ref: refs/heads/main" },
      node_modules: { dep: { "index.js": "module.exports = 1" } },
      dist: { "bundle.js": "x" },
      secrets: { "key.ts": "export const k = 1" },
      generated: { "out.ts": "export const g = 1" },
      "debug.log": "noise",
      "keep.log": "kept",
      "package.json": "{\"name\":\"fixture\"}",
      "README.md": "# hi",
      src: {
        "index.ts": "import { helper } from './lib/helper';\nexport const x = helper();\n",
        lib: { "helper.ts": "export const helper = () => 1;\n", "types.d.ts": "export type T = 1" },
        generated: { "nested.ts": "export const n = 1" },
      },
      ".rassam": { "blueprint.json": "{\"version\":\"0.1\"}", "layout.json": "{\"version\":1,\"positions\":{\"a\":{\"x\":1,\"y\":2}}}" },
    });
    const progress: string[] = [];

    const snapshot = await readLocalSnapshot(fs.root, { onProgress: (event) => progress.push(event.phase) });
    const paths = snapshot.files.map((file) => file.path);

    expect(snapshot.name).toBe("fixture");
    expect(paths).toEqual([
      ".gitignore",
      ".rassam/blueprint.json",
      ".rassam/layout.json",
      "README.md",
      "keep.log",
      "package.json",
      "src/generated/nested.ts",
      "src/index.ts",
      "src/lib/helper.ts",
    ]);
    // Ignored directories are never descended into.
    for (const skipped of [".git", "node_modules", "dist", "secrets", "generated"]) {
      expect(fs.walked).not.toContain(skipped);
    }
    const byPath = new Map(snapshot.files.map((file) => [file.path, file]));
    expect(byPath.get("src/index.ts")?.content).toContain("helper");
    expect(byPath.get("package.json")?.content).toContain("fixture");
    // Non-source files are listed without reading their contents.
    expect(byPath.get("README.md")?.content).toBeNull();
    expect(fs.opened).not.toContain("README.md");
    expect(snapshot.blueprintText).toBe("{\"version\":\"0.1\"}");
    expect(parseLayout(snapshot.layoutText)).toEqual({ a: { x: 1, y: 2 } });
    expect(progress).toContain("scanning");
    expect(progress).toContain("reading");
    expect(snapshot.stats.filesListed).toBe(paths.length);
  });

  it("never opens .env files, skips oversized files and detects binary content", async () => {
    const binary = new Uint8Array([0x69, 0x6d, 0x70, 0x00, 0x6f, 0x72, 0x74]);
    const invalidUtf8 = new Uint8Array([0x61, 0xff, 0xfe, 0x62]);
    const fs = fakeFs({
      ".env": "SECRET=local-secret",
      ".env.production": "SECRET=prod-secret",
      config: { ".env.ts": "export const leaked = 'x'" },
      src: {
        "big.ts": { size: MAX_ANALYZED_FILE_BYTES + 1 },
        "binary.ts": binary,
        "latin.ts": invalidUtf8,
        "ok.ts": "export const ok = 1;\n",
      },
    });

    const snapshot = await readLocalSnapshot(fs.root);
    const byPath = new Map(snapshot.files.map((file) => [file.path, file]));

    expect(byPath.has(".env")).toBe(true);
    expect(byPath.get(".env")?.content).toBeNull();
    expect(byPath.get(".env.production")?.content).toBeNull();
    expect(byPath.get("config/.env.ts")?.content).toBeNull();
    expect(fs.opened.filter((path) => path.includes(".env"))).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("secret");

    expect(byPath.get("src/big.ts")).toEqual({ path: "src/big.ts", content: null, size: MAX_ANALYZED_FILE_BYTES + 1 });
    expect(byPath.get("src/binary.ts")?.content).toBeNull();
    expect(byPath.get("src/latin.ts")?.content).toBeNull();
    expect(byPath.get("src/ok.ts")?.content).toBe("export const ok = 1;\n");
    expect(snapshot.blueprintText).toBeNull();
    expect(snapshot.layoutText).toBeNull();
    expect(snapshot.stats.filesRead).toBe(1);
  });

  it("stops when the signal is aborted", async () => {
    const fs = fakeFs({ src: { "a.ts": "export const a = 1" } });
    const controller = new AbortController();
    controller.abort();
    await expect(readLocalSnapshot(fs.root, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("refuses to treat an unreadable blueprint as missing", async () => {
    const fs = fakeFs({ ".rassam": { "blueprint.json": new Uint8Array([0x7b, 0x00, 0x7d]) } });
    await expect(readLocalSnapshot(fs.root)).rejects.toMatchObject({ code: "blueprint-unreadable" });
  });
});

describe("compileGitignore", () => {
  it("skips comments and blank lines and keeps negations", () => {
    const rules = compileGitignore("\n# note\n*.tmp\n!important.tmp\nbuild/\n");
    expect(rules.map((rule) => [rule.matcher.pattern, rule.negate, rule.directoryOnly])).toEqual([
      ["*.tmp", false, false],
      ["important.tmp", true, false],
      ["build", false, true],
    ]);
  });
});

describe("writing blueprint files", () => {
  it("creates .rassam/ and writes blueprint and layout files", async () => {
    const tree: Tree = { src: { "a.ts": "export const a = 1" } };
    const fs = fakeFs(tree);

    await writeBlueprintFile(fs.root, "{\"version\":\"0.1\"}\n");
    await writeLayoutFile(fs.root, serializeLayout({ b: { x: 2, y: 3 }, a: { x: 0, y: 1 } }));

    expect(fs.created).toEqual([".rassam", ".rassam/blueprint.json", ".rassam/layout.json"]);
    expect(fs.written.get(".rassam/blueprint.json")).toBe("{\"version\":\"0.1\"}\n");
    expect(fs.written.get(".rassam/layout.json")).toBe(
      "{\n  \"version\": 1,\n  \"positions\": {\n    \"a\": {\n      \"x\": 0,\n      \"y\": 1\n    },\n    \"b\": {\n      \"x\": 2,\n      \"y\": 3\n    }\n  }\n}\n",
    );

    const snapshot = await readLocalSnapshot(fs.root);
    expect(snapshot.blueprintText).toBe("{\"version\":\"0.1\"}\n");
  });

  it("requests readwrite permission and fails clearly when it is denied", async () => {
    const fs = fakeFs({});
    fs.permission.state = "prompt";
    fs.permission.onRequest = "granted";
    await writeBlueprintFile(fs.root, "{}\n");
    expect(fs.permission.requests).toEqual(["readwrite"]);

    const denied = fakeFs({});
    denied.permission.state = "prompt";
    denied.permission.onRequest = "denied";
    const error = await writeBlueprintFile(denied.root, "{}\n").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LocalFolderError);
    expect((error as LocalFolderError).code).toBe("permission-denied");
    expect(denied.written.size).toBe(0);
    expect(denied.created).toEqual([]);
  });

  it("verifyPermission can check without prompting", async () => {
    const fs = fakeFs({});
    fs.permission.state = "prompt";
    expect(await verifyPermission(fs.root, "readwrite", { request: false })).toBe(false);
    expect(fs.permission.requests).toEqual([]);
    expect(await verifyPermission(fs.root, "readwrite")).toBe(true);
  });
});

describe("pickLocalFolder", () => {
  it("returns a typed unsupported result without the File System Access API", async () => {
    vi.stubGlobal("window", {});
    expect(await pickLocalFolder()).toMatchObject({ status: "unsupported" });
  });

  it("returns the picked handle and treats dismissal as cancelled", async () => {
    const fs = fakeFs({});
    vi.stubGlobal("window", { showDirectoryPicker: vi.fn(async () => fs.root) });
    expect(await pickLocalFolder()).toEqual({ status: "picked", handle: fs.root });

    vi.stubGlobal("window", {
      showDirectoryPicker: vi.fn(async () => {
        throw Object.assign(new Error("dismissed"), { name: "AbortError" });
      }),
    });
    expect(await pickLocalFolder()).toEqual({ status: "cancelled" });
  });
});

describe("layout files", () => {
  it("parses leniently and ignores malformed entries", () => {
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout("not json")).toBeNull();
    expect(parseLayout("{\"positions\":[]}")).toBeNull();
    expect(parseLayout(JSON.stringify({
      version: 1,
      positions: { ok: { x: 1, y: 2, extra: true }, text: { x: "1", y: 2 }, inf: { x: 1e999, y: 0 }, nil: null },
    }))).toEqual({ ok: { x: 1, y: 2 } });
  });

  it("round-trips with stable key order", () => {
    const text = serializeLayout({ zeta: { x: 1, y: 2 }, alpha: { x: 3, y: 4 } });
    expect(text.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(text).positions)).toEqual(["alpha", "zeta"]);
    expect(parseLayout(text)).toEqual({ alpha: { x: 3, y: 4 }, zeta: { x: 1, y: 2 } });
  });
});
