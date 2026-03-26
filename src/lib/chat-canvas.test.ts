import assert from "node:assert/strict";
import { test } from "node:test";

import type { ToolTranscriptEntry } from "./chat-canvas";
import { summarizeToolTranscript } from "./chat-canvas";

test("summarizeToolTranscript planner mode retains truncated read content", () => {
  const uniqueContent = "ARCHITECTURE_SIGNAL_12345\n".repeat(600);
  const transcript: ToolTranscriptEntry[] = [
    {
      tool: "read",
      input: { path: "src/lib/example.ts" },
      result: {
        ok: true,
        path: "src/lib/example.ts",
        source: "github",
        content: uniqueContent,
      },
    },
  ];

  const summary = summarizeToolTranscript(transcript, { mode: "planner" });

  assert.match(summary, /ARCHITECTURE_SIGNAL_12345/);
  assert.match(summary, /truncated \d+ chars/);
});

test("summarizeToolTranscript final mode omits raw read content and includes compact metadata", () => {
  const uniqueContent = "DO_NOT_LEAK_THIS_FILE_BODY\n".repeat(10);
  const transcript: ToolTranscriptEntry[] = [
    {
      tool: "read",
      input: { path: "src/lib/private.ts" },
      result: {
        ok: true,
        path: "src/lib/private.ts",
        source: "cache",
        content: uniqueContent,
      },
    },
    {
      tool: "write",
      input: {
        action: "edit_node",
        target: { label: "Auth" },
        changes: { description: "Updated" },
      },
      result: {
        ok: false,
        action: "edit_node",
        error: "Node not found.",
      },
    },
  ];

  const summary = summarizeToolTranscript(transcript, { mode: "final" });

  assert.doesNotMatch(summary, /DO_NOT_LEAK_THIS_FILE_BODY/);
  assert.match(summary, /"path": "src\/lib\/private\.ts"/);
  assert.match(summary, /"source": "cache"/);
  assert.match(summary, /"contentChars": \d+/);
  assert.match(summary, /"contentTruncated": false/);
  assert.match(summary, /"action": "edit_node"/);
  assert.match(summary, /"label": "Auth"/);
  assert.match(summary, /"error": "Node not found\."/);
});

test("summarizeToolTranscript final mode keeps session output compact", () => {
  const transcript: ToolTranscriptEntry[] = [
    {
      tool: "session",
      input: { action: "search", query: "auth", entity: "all", limit: 10 },
      result: {
        ok: true,
        action: "search",
        query: "auth",
        entity: "all",
        totalNodes: 8,
        totalEdges: 5,
        nodes: [
          { id: "n1", label: "Auth Service", description: "Long description that should not be copied." },
          { id: "n2", label: "Auth API", description: "Another long description that should not be copied." },
        ],
        edges: [
          { id: "e1", sourceLabel: "Auth API", targetLabel: "Auth Service", label: "calls" },
        ],
      },
    },
  ];

  const summary = summarizeToolTranscript(transcript, { mode: "final" });

  assert.match(summary, /"action": "search"/);
  assert.match(summary, /"query": "auth"/);
  assert.match(summary, /"entity": "all"/);
  assert.match(summary, /"matches": \{/);
  assert.match(summary, /"nodes": 2/);
  assert.match(summary, /"edges": 1/);
  assert.doesNotMatch(summary, /Long description that should not be copied/);
});
