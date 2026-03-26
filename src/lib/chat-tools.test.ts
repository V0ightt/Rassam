import assert from "node:assert/strict";
import { test } from "node:test";

import type { ToolTranscriptEntry, WorkingCanvasState } from "./chat-canvas";
import { executeGrepTool, executeReadTool, executeWriteBatch } from "./chat-tools";

function createState(): WorkingCanvasState {
  return {
    project: {
      id: "project-1",
      name: "Repo",
      source: "github",
      repo: "owner/repo",
    },
    layoutDirection: "TB",
    selectedNodeId: null,
    selectedNodeLabel: null,
    nodes: [],
    edges: [],
  };
}

test("executeReadTool treats empty file content as a valid read result", async () => {
  const result = await executeReadTool(
    { path: "docs/empty.txt" },
    {
      readFile: async (path) => ({
        path,
        content: "",
        source: "cache",
        resolvedPath: path,
        resolutionStrategy: "exact",
      }),
    },
  ) as { ok: boolean; content?: string };

  assert.equal(result.ok, true);
  assert.match(result.content || "", /\(empty\)/);
});

test("executeReadTool returns exact requested line ranges", async () => {
  const result = await executeReadTool(
    { path: "chatbot.py", line: 2 },
    {
      readFile: async (path) => ({
        path,
        content: "first line\nsecond line\nthird line",
        source: "cache",
        resolvedPath: path,
        resolutionStrategy: "exact",
      }),
    },
  ) as {
    ok: boolean;
    startLine?: number;
    endLine?: number;
    totalLines?: number;
    content?: string;
  };

  assert.equal(result.ok, true);
  assert.equal(result.startLine, 2);
  assert.equal(result.endLine, 2);
  assert.equal(result.totalLines, 3);
  assert.equal(result.content, "2: second line");
});

test("executeGrepTool finds compact content snippets from the current-turn corpus", () => {
  const result = executeGrepTool(
    { query: "auth" },
    {
      availableFiles: ["src/auth.ts", "src/db.ts"],
      readmeContent: "Run auth locally with npm run dev",
      specificFile: {
        path: "src/auth.ts",
        resolvedPath: "src/auth.ts",
        content: "export const authToken = true;\nconst login = () => 'ok';",
      },
      cachedFiles: {
        "src/lib/session.ts": "const authSession = 'active';\nexport default authSession;",
      },
    },
  ) as {
    ok: boolean;
    found: boolean;
    pathMatches: string[];
    contentMatches: Array<{ path: string; line: number; snippet: string }>;
    searchedContentFileCount: number;
  };

  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.deepEqual(result.pathMatches, ["src/auth.ts"]);
  assert.equal(result.searchedContentFileCount, 3);
  assert.ok(result.contentMatches.some((match) => match.path === "src/auth.ts" && match.line === 1));
  assert.ok(result.contentMatches.some((match) => match.path === "src/lib/session.ts" && match.line === 1));
  assert.ok(result.contentMatches.every((match) => match.snippet.toLowerCase().includes("auth")));
});

test("executeGrepTool searches repo paths without reading files", () => {
  const result = executeGrepTool(
    { query: "auth" },
    {
      availableFiles: ["src/auth.ts", "src/database.ts", "docs/auth-guide.md"],
    },
  ) as {
    ok: boolean;
    pathMatches: string[];
    searchedPathCount: number;
    searchedContentFileCount: number;
  };

  assert.equal(result.ok, true);
  assert.deepEqual(result.pathMatches, ["src/auth.ts", "docs/auth-guide.md"]);
  assert.equal(result.searchedPathCount, 3);
  assert.equal(result.searchedContentFileCount, 0);
});

test("executeGrepTool applies a path filter to both path and content search", () => {
  const result = executeGrepTool(
    { query: "auth", path: "src/lib" },
    {
      availableFiles: ["src/lib/auth.ts", "src/app/auth.ts", "docs/auth.md"],
      cachedFiles: {
        "src/lib/auth.ts": "const auth = true;",
        "src/app/auth.ts": "const auth = false;",
      },
    },
  ) as {
    ok: boolean;
    pathFilter?: string;
    pathMatches: string[];
    contentMatches: Array<{ path: string }>;
    searchedPathCount: number;
    searchedContentFileCount: number;
  };

  assert.equal(result.ok, true);
  assert.equal(result.pathFilter, "src/lib");
  assert.deepEqual(result.pathMatches, ["src/lib/auth.ts"]);
  assert.equal(result.searchedPathCount, 1);
  assert.equal(result.searchedContentFileCount, 1);
  assert.deepEqual(result.contentMatches.map((match) => match.path), ["src/lib/auth.ts"]);
});

test("executeGrepTool rejects an empty query", () => {
  const result = executeGrepTool(
    { query: "   " },
    { availableFiles: ["src/auth.ts"] },
  ) as { ok: boolean; error?: string };

  assert.equal(result.ok, false);
  assert.match(result.error || "", /Missing query/);
});

test("executeGrepTool enforces limits and marks truncated results", () => {
  const result = executeGrepTool(
    { query: "auth", limit: 2 },
    {
      availableFiles: [
        "src/auth-one.ts",
        "src/auth-two.ts",
        "src/auth-three.ts",
      ],
      cachedFiles: {
        "src/auth-one.ts": "auth line 1\nauth line 2",
        "src/auth-two.ts": "auth line 3",
        "src/auth-three.ts": "auth line 4",
      },
    },
  ) as {
    ok: boolean;
    truncated: boolean;
    pathMatches: string[];
    contentMatches: Array<{ path: string }>;
  };

  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.equal(result.pathMatches.length, 2);
  assert.equal(result.contentMatches.length, 2);
});

test("executeWriteBatch records empty write_batch failures in the transcript", () => {
  const transcript: ToolTranscriptEntry[] = [];
  const result = executeWriteBatch(createState(), { operations: [] }, transcript);

  assert.equal(result.results.length, 1);
  assert.equal(transcript.length, 1);
  assert.equal(transcript[0].tool, "write_batch");
  assert.deepEqual(transcript[0].result, {
    ok: false,
    error: "No operations provided for write_batch.",
  });
});
