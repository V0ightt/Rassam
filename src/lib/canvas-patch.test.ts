import assert from "node:assert/strict";
import { test } from "vitest";

import { ApiError } from "./api-error";
import { createCanvasPatch } from "./canvas-patch";
import type { WorkingCanvasState } from "./chat-canvas";
import { MAX_CANVAS_PATCH_OPERATIONS } from "./contracts";

function stateWithNodes(labels = ["Auth", "Database"]): WorkingCanvasState {
  return {
    project: { id: "project-1", name: "Fixture", source: "github", repo: "openai/fixture" },
    layoutDirection: "TB",
    selectedNodeId: null,
    selectedNodeLabel: null,
    nodes: labels.map((label, index) => ({
      id: `node-${index + 1}`,
      label,
      description: `${label} node`,
      category: "default",
      files: [],
      position: { x: index * 300, y: 0 },
    })),
    edges: [],
  };
}

test("canvas patches resolve temporary node IDs and validate the full cloned graph", () => {
  const original = stateWithNodes([]);
  const result = createCanvasPatch(original, [
    { action: "add_node", node: { id: "tmp-ui", label: "UI", category: "component", files: ["src/ui.ts"] } },
    { action: "add_node", node: { id: "tmp-api", label: "API", category: "api", files: ["src/api.ts"] } },
    { action: "add_edge", edge: { sourceId: "tmp-ui", targetId: "tmp-api", label: "calls", type: "calls" } },
  ], 7, { allowedFiles: ["src/ui.ts", "src/api.ts"] });

  assert.equal(result.patch.baseGraphRevision, 7);
  assert.equal(result.patch.resultingRevision, 8);
  assert.equal(result.patch.operations.length, 3);
  assert.equal(result.resultingState.nodes.length, 2);
  assert.equal(result.resultingState.edges.length, 1);
  assert.equal(original.nodes.length, 0);
});

test("invalid operations fail all-or-none without mutating the source graph", () => {
  const original = stateWithNodes();
  assert.throws(
    () => createCanvasPatch(original, [
      { action: "edit_node", target: { id: "node-1" }, changes: { label: "Changed" } },
      { action: "delete_node", target: { id: "missing" } },
    ], 2),
    (error: unknown) => error instanceof ApiError && error.code === "CANVAS_PATCH_INVALID",
  );
  assert.equal(original.nodes[0].label, "Auth");
  assert.equal(original.nodes.length, 2);
});

test("duplicate exact labels require an ID instead of selecting the first partial match", () => {
  const original = stateWithNodes(["Auth", "Auth"]);
  assert.throws(
    () => createCanvasPatch(original, [{ action: "delete_node", target: { label: "Auth" } }], 0),
    (error: unknown) => error instanceof ApiError && error.code === "CANVAS_PATCH_AMBIGUOUS",
  );
  assert.equal(original.nodes.length, 2);
});

test("partial labels are never accepted", () => {
  assert.throws(
    () => createCanvasPatch(stateWithNodes(), [{ action: "edit_node", target: { label: "Aut" }, changes: { label: "Changed" } }], 0),
    (error: unknown) => error instanceof ApiError && /does not exist/.test(error.message),
  );
});

test("repository patches reject hallucinated file paths", () => {
  assert.throws(
    () => createCanvasPatch(stateWithNodes([]), [
      { action: "add_node", node: { label: "Secret", files: ["not/in/repo.ts"] } },
    ], 0, { allowedFiles: ["src/index.ts"] }),
    (error: unknown) => error instanceof ApiError && error.code === "CANVAS_PATCH_INVALID",
  );
});

test("operation and revision limits are enforced before any mutation", () => {
  const tooMany = Array.from({ length: MAX_CANVAS_PATCH_OPERATIONS + 1 }, (_, index) => ({
    action: "add_node",
    node: { label: `Node ${index}` },
  }));
  assert.throws(() => createCanvasPatch(stateWithNodes([]), tooMany, 0));
  assert.throws(() => createCanvasPatch(stateWithNodes([]), [{ action: "add_node", node: { label: "Node" } }], -1));
});

