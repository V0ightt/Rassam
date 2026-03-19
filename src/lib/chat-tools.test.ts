import assert from "node:assert/strict";
import { test } from "node:test";

import type { ToolTranscriptEntry, WorkingCanvasState } from "./chat-canvas";
import { executeReadTool, executeWriteBatch } from "./chat-tools";

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
