import assert from "node:assert/strict";
import { test } from "vitest";

import { sequenceChatEvents } from "./chat-stream";
import type { ChatStreamEvent } from "./chat-agent";

async function collect(source: AsyncIterable<ChatStreamEvent>) {
  return Array.fromAsync(sequenceChatEvents(source, "request-123", {
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  }));
}

test("adds protocol metadata, increasing sequence numbers, and exactly one terminal event", async () => {
  async function* source(): AsyncIterable<ChatStreamEvent> {
    yield { type: "status", text: "Reading" };
    yield { type: "text", text: "Answer" };
    yield { type: "done" };
    yield { type: "done" };
    yield { type: "text", text: "late" };
  }

  const events = await collect(source());
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3]);
  assert.equal(events.every((event) => event.protocolVersion === 2), true);
  assert.equal(events.every((event) => event.requestId === "request-123"), true);
  assert.equal(events.filter((event) => event.type === "done").length, 1);
  assert.equal(events.filter((event) => event.terminal).length, 1);
});

test("turns an unexpected stream failure into a safe error followed by done", async () => {
  async function* source(): AsyncIterable<ChatStreamEvent> {
    yield { type: "text", text: "partial" };
    throw new Error("secret upstream response");
  }

  const events = await collect(source());
  assert.deepEqual(events.map((event) => event.type), ["text", "error", "done"]);
  assert.equal(events[1].type === "error" && events[1].text.includes("secret"), false);
});
