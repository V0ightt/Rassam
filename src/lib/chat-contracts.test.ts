import assert from "node:assert/strict";
import { test } from "vitest";

import {
  MAX_CHAT_CACHED_FILE_BYTES,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_MESSAGE_CHARS,
  chatRequestSchema,
} from "./contracts";

function baseRequest(): Record<string, unknown> {
  return {
    protocolVersion: 2,
    message: "Explain the selected component",
    chatMode: "ask",
    modelSettings: { providerId: "ollama", model: "llama3.1" },
  };
}

test("chat request bounds messages, history, cached source, and repository paths", () => {
  assert.equal(chatRequestSchema.safeParse({
    ...baseRequest(),
    message: "x".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
  }).success, false);

  assert.equal(chatRequestSchema.safeParse({
    ...baseRequest(),
    history: Array.from({ length: MAX_CHAT_HISTORY_MESSAGES + 1 }, () => ({ role: "user", content: "x" })),
  }).success, false);

  assert.equal(chatRequestSchema.safeParse({
    ...baseRequest(),
    cachedFiles: { "src/utf8.ts": "é".repeat(Math.floor(MAX_CHAT_CACHED_FILE_BYTES / 2) + 1) },
  }).success, false);

  assert.equal(chatRequestSchema.safeParse({
    ...baseRequest(),
    availableFiles: ["../secret.env"],
  }).success, false);
});

test("chat request rejects duplicate nodes, dangling edges, and revision mismatch", () => {
  const canvas = {
    syncedAt: "2026-01-01T00:00:00.000Z",
    graphRevision: 4,
    project: { id: "p", name: "Blank", source: "empty" },
    layoutDirection: "TB",
    nodes: [
      { id: "n1", label: "One", position: { x: 0, y: 0 } },
      { id: "n1", label: "Duplicate", position: { x: 1, y: 1 } },
    ],
    edges: [{ id: "e1", source: "n1", target: "missing" }],
  };
  const result = chatRequestSchema.safeParse({ ...baseRequest(), baseGraphRevision: 3, canvasContext: canvas });
  assert.equal(result.success, false);
});

test("GitHub chat requires a pinned source grant and commit", () => {
  const result = chatRequestSchema.safeParse({
    ...baseRequest(),
    repoDetails: { owner: "openai", repo: "rassam" },
  });
  assert.equal(result.success, false);
});
