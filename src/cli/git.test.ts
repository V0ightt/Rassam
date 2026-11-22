import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ANALYZED_FILE_BYTES } from "../blueprint/constants";
import {
  GitError,
  commitsBetween,
  currentBranch,
  defaultBaseRef,
  diffAgainst,
  headSha,
  isShallow,
  mergeBase,
  parseCatFileBatch,
  readFileAtRef,
  readFilesAtRef,
  repoRoot,
  resolveRef,
  untrackedFiles,
  userName,
} from "./git";
import { commitAll, git, initRepo, makeTempDir, removeDir, write } from "./test-helpers";

const UNICODE_FILE = "docs/héllo wörld ✓.md";

describe("git helpers", () => {
  let root: string;
  let outside: string;
  let baseSha: string;
  let featureSha: string;

  beforeAll(async () => {
    root = await makeTempDir();
    outside = await makeTempDir();
    await initRepo(root);
    await write(root, "src/a.ts", "export const a = 1;\n");
    await write(root, "src/old-name.ts", "export const renamed = 1;\nexport const more = 2;\nexport const evenMore = 3;\n");
    await write(root, "src/gone.ts", "export const gone = true;\n");
    await write(root, UNICODE_FILE, "# hello\n");
    await write(root, "assets/logo.bin", Buffer.from([1, 2, 0, 3, 4]));
    await write(root, ".env", "SECRET_TOKEN=committed-by-mistake\n");
    await write(root, ".gitignore", "ignored/\n");
    baseSha = await commitAll(root, "initial commit");

    await git(root, "checkout", "--quiet", "-b", "feature");
    await write(root, "src/a.ts", "export const a = 2;\nexport const b = 3;\n");
    await rename(join(root, "src/old-name.ts"), join(root, "src/new-name.ts"));
    await rm(join(root, "src/gone.ts"));
    await write(root, UNICODE_FILE, "# hello\n\nmore\n");
    await commitAll(root, "Change things\n\nBody text.\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
    await write(root, "src/c.ts", "export const c = 1;\n");
    featureSha = await commitAll(root, "Add c");

    // Uncommitted state: an edit, untracked files, an ignored file.
    await write(root, "src/c.ts", "export const c = 1;\nexport const d = 2;\n");
    await write(root, "src/untracked.ts", "export const fresh = 1;\nexport const second = 2;\n");
    await write(root, "notes/ünïcode.txt", "untracked unicode\n");
    await write(root, "big.txt", "x".repeat(MAX_ANALYZED_FILE_BYTES + 10));
    await write(root, "blob.dat", Buffer.from([0, 1, 2, 3]));
    await write(root, ".env.local", "API_KEY=never-read-this\n");
    await write(root, "ignored/skip.ts", "export {};\n");
  });

  afterAll(async () => {
    await removeDir(root);
    await removeDir(outside);
  });

  it("finds the repository root and reports non-repositories", async () => {
    expect(await repoRoot(join(root, "src"))).toBe(root);
    expect(await repoRoot(outside)).toBeNull();
  });

  it("reads identity, HEAD, branch and shallow state", async () => {
    expect(await headSha(root)).toBe(featureSha);
    expect(await currentBranch(root)).toBe("feature");
    expect(await userName(root)).toBe("Test Human");
    expect(await isShallow(root)).toBe(false);
  });

  it("resolves refs and rejects unsafe ones", async () => {
    expect(await resolveRef(root, "main")).toBe(baseSha);
    expect(await resolveRef(root, "no-such-branch")).toBeNull();
    await expect(resolveRef(root, "--upload-pack=evil")).rejects.toBeInstanceOf(GitError);
  });

  it("computes the merge-base and explains a missing base", async () => {
    expect(await mergeBase(root, "main")).toBe(baseSha);
    expect(await mergeBase(root, "main", "feature")).toBe(baseSha);
    await expect(mergeBase(root, "origin/main")).rejects.toThrow(/does not exist/);
    expect(await defaultBaseRef(root)).toBe("main");
  });

  it("lists commits with full messages and trailers", async () => {
    const commits = await commitsBetween(root, baseSha);
    expect(commits.map((commit) => commit.message.split("\n")[0])).toEqual(["Add c", "Change things"]);
    expect(commits[0]).toMatchObject({ sha: featureSha, authorName: "Test Human", authorEmail: "human@example.test" });
    expect(commits[1].message).toContain("Co-Authored-By: Claude <noreply@anthropic.com>");
    expect(await commitsBetween(root, "HEAD")).toEqual([]);
  });

  it("lists untracked files, excluding ignored ones", async () => {
    const untracked = await untrackedFiles(root);
    expect(untracked).toEqual(expect.arrayContaining(["src/untracked.ts", "notes/ünïcode.txt", "big.txt", "blob.dat", ".env.local"]));
    expect(untracked).not.toContain("ignored/skip.ts");
  });

  it("diffs the working tree against the merge-base", async () => {
    const changes = await diffAgainst(root, baseSha);
    const byPath = new Map(changes.map((change) => [change.path, change]));

    const modified = byPath.get("src/a.ts");
    expect(modified?.status).toBe("modified");
    expect(modified?.added.map((line) => line.text)).toEqual(["export const a = 2;", "export const b = 3;"]);
    expect(modified?.removed.map((line) => line.text)).toEqual(["export const a = 1;"]);

    expect(byPath.get("src/new-name.ts")).toMatchObject({ status: "renamed", previousPath: "src/old-name.ts" });
    expect(byPath.get("src/gone.ts")?.status).toBe("deleted");
    expect(byPath.get(UNICODE_FILE)?.status).toBe("modified");

    // Committed on the branch, then edited without committing: both count.
    const committed = byPath.get("src/c.ts");
    expect(committed?.status).toBe("added");
    expect(committed?.added.map((line) => line.text)).toEqual(["export const c = 1;", "export const d = 2;"]);

    const untracked = byPath.get("src/untracked.ts");
    expect(untracked?.status).toBe("added");
    expect(untracked?.added).toEqual([
      { line: 1, text: "export const fresh = 1;" },
      { line: 2, text: "export const second = 2;" },
    ]);
    expect(byPath.get("notes/ünïcode.txt")?.status).toBe("added");
    expect(byPath.get("big.txt")).toMatchObject({ status: "added", added: [], binary: true });
    expect(byPath.get("blob.dat")).toMatchObject({ status: "added", added: [], binary: true });
    expect(byPath.has("ignored/skip.ts")).toBe(false);
  });

  it("never reads env file contents into the diff", async () => {
    const changes = await diffAgainst(root, baseSha);
    const env = changes.find((change) => change.path === ".env.local");
    expect(env).toMatchObject({ status: "added", added: [], removed: [] });
    expect(JSON.stringify(changes)).not.toContain("never-read-this");
  });

  it("reads many files at a ref with one cat-file process", async () => {
    const files = await readFilesAtRef(root, baseSha, ["src/a.ts", "missing.ts", "src/old-name.ts", UNICODE_FILE, "assets/logo.bin", ".env", "src"]);
    expect(files.get("src/a.ts")).toBe("export const a = 1;\n");
    expect(files.get("src/old-name.ts")).toContain("renamed");
    expect(files.get(UNICODE_FILE)).toBe("# hello\n");
    expect([...files.keys()].sort()).toEqual(["src/a.ts", "src/old-name.ts", UNICODE_FILE].sort());
    expect(await readFileAtRef(root, "HEAD", "src/a.ts")).toBe("export const a = 2;\nexport const b = 3;\n");
    expect(await readFileAtRef(root, baseSha, "nope.ts")).toBeNull();
    expect((await readFilesAtRef(root, baseSha, [])).size).toBe(0);
  });

  it("fails with a helpful error outside a repository", async () => {
    await expect(diffAgainst(outside, "HEAD")).rejects.toBeInstanceOf(GitError);
  });
});

describe("parseCatFileBatch", () => {
  it("parses blobs, missing objects and content containing newlines", () => {
    const sha = "a".repeat(40);
    const output = Buffer.concat([
      Buffer.from(`${sha} blob 6\nab\ncd\n\n`),
      Buffer.from("HEAD:nope.ts missing\n"),
      Buffer.from(`${sha} tree 3\nxyz\n`),
      Buffer.from(`${sha} blob 0\n\n`),
    ]);
    const entries = parseCatFileBatch(output, 5);
    expect(entries.map((entry) => entry.type)).toEqual(["blob", "missing", "tree", "blob", "missing"]);
    expect(entries[0].body?.toString()).toBe("ab\ncd\n");
    expect(entries[3].body?.length).toBe(0);
  });
});
