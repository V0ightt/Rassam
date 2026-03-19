import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanvasSyncSnapshot, RepoFileEntry } from "@/types";
import { buildAvailableFiles, selectCanvasContextForChat } from "./chat-request";

function createSnapshot(overrides: Partial<CanvasSyncSnapshot>): CanvasSyncSnapshot {
  return {
    syncedAt: "2026-03-19T08:00:00.000Z",
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
    ...overrides,
  };
}

test("selectCanvasContextForChat prefers live canvas when it is newer than the synced snapshot", () => {
  const synced = createSnapshot({
    syncedAt: "2026-03-19T08:00:00.000Z",
    project: { id: "project-1", name: "Synced", source: "github", repo: "owner/repo" },
  });
  const live = createSnapshot({
    syncedAt: "2026-03-19T09:00:00.000Z",
    project: { id: "live-canvas", name: "Live", source: "github", repo: "owner/repo" },
  });

  const selected = selectCanvasContextForChat(live, synced, "2026-03-19T09:00:00.000Z");

  assert.equal(selected.project.name, "Live");
});

test("buildAvailableFiles uses blob entries only and caps the request payload at 2000 paths", () => {
  const fileTree: RepoFileEntry[] = [
    { path: "src", type: "tree" },
    ...Array.from({ length: 2105 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      type: "blob" as const,
    })),
  ];

  const availableFiles = buildAvailableFiles(fileTree);

  assert.equal(availableFiles.length, 2000);
  assert.equal(availableFiles[0], "src/file-0.ts");
  assert.equal(availableFiles.includes("src"), false);
});
