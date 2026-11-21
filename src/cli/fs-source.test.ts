import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ANALYZED_FILE_BYTES } from "../blueprint/constants";
import { isManifestPath, loadWorkingTree, wantsContent } from "./fs-source";
import { toRepoPath } from "./repo-path";
import { commitAll, initRepo, makeTempDir, removeDir, write } from "./test-helpers";
import { decodeText, fileTimestamp, isEnvFile, mapLimit, slugify, tailBytes } from "./util";
import { rm } from "node:fs/promises";
import { join } from "node:path";

async function populate(root: string): Promise<void> {
  await write(root, "src/app.ts", "import { helper } from './helper';\nexport const app = helper();\n");
  await write(root, "src/helper.ts", "\uFEFFexport const helper = () => 1;\n");
  await write(root, "src/binary.ts", Buffer.from([0x65, 0x78, 0x00, 0x01]));
  await write(root, "src/huge.ts", `export const big = "${"x".repeat(MAX_ANALYZED_FILE_BYTES)}";\n`);
  await write(root, "package.json", '{"name":"fixture"}\n');
  await write(root, "tsconfig.json", "{}\n");
  await write(root, "tsconfig.build.json", "{}\n");
  await write(root, ".mcp.json", '{"mcpServers":{}}\n');
  await write(root, "README.md", "# readme\n");
  await write(root, "assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]));
  await write(root, ".env", "TOKEN=super-secret-value\n");
  await write(root, "config/.env.production", "TOKEN=super-secret-value\n");
  await write(root, "node_modules/dep/index.js", "module.exports = 1;\n");
  await write(root, "dist/out.js", "console.log(1);\n");
  await write(root, ".rassam/blueprint.json", '{"version":"0.1"}\n');
}

function check(files: Array<{ path: string; content: string | null; size?: number }>): void {
  const byPath = new Map(files.map((file) => [file.path, file]));
  expect(byPath.get("src/app.ts")?.content).toContain("helper()");
  expect(byPath.get("src/app.ts")?.size).toBeGreaterThan(10);
  // BOM stripped, content kept.
  expect(byPath.get("src/helper.ts")?.content).toBe("export const helper = () => 1;\n");
  expect(byPath.get("src/binary.ts")).toMatchObject({ content: null, size: 4 });
  expect(byPath.get("src/huge.ts")?.content).toBeNull();
  expect(byPath.get("src/huge.ts")?.size).toBeGreaterThan(MAX_ANALYZED_FILE_BYTES);
  expect(byPath.get("package.json")?.content).toContain("fixture");
  expect(byPath.get("tsconfig.json")?.content).toBe("{}\n");
  expect(byPath.get("tsconfig.build.json")?.content).toBe("{}\n");
  expect(byPath.get(".mcp.json")?.content).toContain("mcpServers");
  // Listed, but content is not needed.
  expect(byPath.get("README.md")).toMatchObject({ content: null, size: 9 });
  expect(byPath.get("assets/logo.png")?.content).toBeNull();
  expect(byPath.has("node_modules/dep/index.js")).toBe(false);
  expect(byPath.has("dist/out.js")).toBe(false);
  expect(JSON.stringify(files)).not.toContain("super-secret-value");
  expect(files.map((file) => file.path)).toEqual([...files.map((file) => file.path)].sort());
}

describe("loadWorkingTree", () => {
  const roots: string[] = [];

  afterAll(async () => {
    for (const root of roots) await removeDir(root);
  });

  describe("inside a git repository", () => {
    let root: string;

    beforeAll(async () => {
      root = await makeTempDir();
      roots.push(root);
      await initRepo(root);
      await populate(root);
      await write(root, ".gitignore", "node_modules/\nsecret-notes/\n");
      await write(root, "src/deleted.ts", "export {};\n");
      await commitAll(root, "initial");
      await rm(join(root, "src/deleted.ts"));
      await write(root, "src/untracked.ts", "export const fresh = true;\n");
      await write(root, "secret-notes/plan.ts", "export {};\n");
    });

    it("reads source, manifests and agent config; skips binaries, oversized, ignored and env content", async () => {
      const tree = await loadWorkingTree(root);
      check(tree.files);
      const paths = tree.files.map((file) => file.path);
      expect(paths).toContain("src/untracked.ts");
      expect(paths).not.toContain("secret-notes/plan.ts");
      // Tracked but deleted from the working tree.
      expect(paths).not.toContain("src/deleted.ts");
      expect(tree.files.find((file) => file.path === ".env")?.content ?? null).toBeNull();
      expect(tree.blueprintText).toBe('{"version":"0.1"}\n');
    });

    it("applies extra ignore globs", async () => {
      const tree = await loadWorkingTree(root, { extraIgnore: ["src/untracked.ts"] });
      expect(tree.files.map((file) => file.path)).not.toContain("src/untracked.ts");
    });
  });

  describe("outside git", () => {
    it("walks the directory honoring the default ignores", async () => {
      const root = await makeTempDir();
      roots.push(root);
      await populate(root);
      await rm(join(root, ".rassam"), { recursive: true });
      const tree = await loadWorkingTree(root);
      check(tree.files);
      expect(tree.blueprintText).toBeNull();
    });
  });
});

describe("path classification", () => {
  it("knows which files the engine needs content for", () => {
    expect(wantsContent("src/a.ts")).toBe(true);
    expect(wantsContent("pkg/go.mod")).toBe(true);
    expect(wantsContent("Cargo.toml")).toBe(true);
    expect(wantsContent("pyproject.toml")).toBe(true);
    expect(wantsContent(".mcp.json")).toBe(true);
    expect(wantsContent("README.md")).toBe(false);
    expect(wantsContent(".env")).toBe(false);
    expect(wantsContent("apps/web/.env.local")).toBe(false);
    expect(isManifestPath("packages/x/tsconfig.app.json")).toBe(true);
    expect(isManifestPath("tsconfig.json.bak")).toBe(false);
  });

  it("detects env files without matching lookalikes", () => {
    expect(isEnvFile(".env")).toBe(true);
    expect(isEnvFile("a/b/.env.production.local")).toBe(true);
    expect(isEnvFile("C:\\repo\\.env")).toBe(true);
    expect(isEnvFile("src/env.ts")).toBe(false);
    expect(isEnvFile(".envrc")).toBe(false);
  });

  it("converts user paths to repository paths", () => {
    const root = process.platform === "win32" ? "C:\\work\\repo" : "/work/repo";
    const sub = join(root, "src");
    expect(toRepoPath(root, root, "src/a.ts")).toBe("src/a.ts");
    expect(toRepoPath(root, root, "./src\\lib\\a.ts")).toBe("src/lib/a.ts");
    expect(toRepoPath(root, sub, "a.ts")).toBe("src/a.ts");
    expect(toRepoPath(root, sub, "../README.md")).toBe("README.md");
    expect(toRepoPath(root, root, join(root, "src", "a.ts"))).toBe("src/a.ts");
    expect(toRepoPath(root, root, "../elsewhere/a.ts")).toBeNull();
    expect(toRepoPath(root, root, "..")).toBeNull();
  });
});

describe("util", () => {
  it("decodes text and refuses binary or oversized buffers", () => {
    expect(decodeText(Buffer.from("héllo"))).toBe("héllo");
    expect(decodeText(Buffer.from([104, 0, 105]))).toBeNull();
    expect(decodeText(Buffer.alloc(MAX_ANALYZED_FILE_BYTES + 1, 97))).toBeNull();
  });

  it("limits concurrency and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapLimit([5, 4, 3, 2, 1, 0], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active--;
      return value * 2;
    });
    expect(results).toEqual([10, 8, 6, 4, 2, 0]);
    expect(peak).toBe(2);
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });

  it("builds safe file names", () => {
    expect(slugify("Allow UI → DB access?!", "x")).toBe("allow-ui-db-access");
    expect(slugify("../../etc/passwd", "x")).toBe("etc-passwd");
    expect(slugify("???", "proposal")).toBe("proposal");
    expect(slugify("a".repeat(100), "x").length).toBe(48);
    expect(fileTimestamp(new Date("2026-11-21T10:15:00.123Z"))).toBe("20261121T101500Z");
  });

  it("keeps the tail of long output", () => {
    expect(tailBytes("short", 100)).toBe("short");
    const tail = tailBytes(`${"a".repeat(5000)}END`, 1024);
    expect(tail.endsWith("END")).toBe(true);
    expect(Buffer.byteLength(tail)).toBeLessThanOrEqual(1024 + 4);
  });
});
