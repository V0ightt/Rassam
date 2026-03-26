import assert from "node:assert/strict";
import { test } from "node:test";

import type { ToolTranscriptEntry, WorkingCanvasState } from "./chat-canvas";
import type { LLMProvider } from "./llm/types";
import { __test__, streamChatResponse } from "./chat-agent";

function createState(): WorkingCanvasState {
  return {
    project: {
      id: "project-1",
      name: "Example Repo",
      source: "github",
      repo: "owner/example",
    },
    layoutDirection: "TB",
    selectedNodeId: "node-1",
    selectedNodeLabel: "Auth",
    nodes: [
      {
        id: "node-1",
        label: "Auth",
        description: "Handles auth flows",
        category: "auth",
        files: ["src/auth.ts"],
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
  };
}

async function collectEvents(iterable: AsyncIterable<unknown>) {
  const events: unknown[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function createStubProvider(responses: string[], streamChunks: string[] = ["unexpected"]) {
  let index = 0;
  let chatStreamCalls = 0;
  const chatInputs: Array<Record<string, unknown>> = [];
  const chatStreamInputs: Array<Record<string, unknown>> = [];

  const provider: LLMProvider = {
    id: "openai",
    async generateStructure() {
      return "{}";
    },
    async chat(input) {
      chatInputs.push((input as unknown as Record<string, unknown>) || {});
      const next = responses[index];
      index += 1;
      return next ?? '{"type":"final"}';
    },
    async *chatStream(input) {
      chatStreamCalls += 1;
      chatStreamInputs.push((input as unknown as Record<string, unknown>) || {});
      for (const chunk of streamChunks) {
        yield chunk;
      }
    },
  };

  return {
    provider,
    get chatCalls() {
      return index;
    },
    get chatStreamCalls() {
      return chatStreamCalls;
    },
    get chatInputs() {
      return chatInputs;
    },
    get chatStreamInputs() {
      return chatStreamInputs;
    },
  };
}

test("chat-agent planner prompt keeps detailed transcript content while final prompt uses compact summary", () => {
  const state = createState();
  const transcript: ToolTranscriptEntry[] = [
    {
      tool: "read",
      input: { path: "src/auth.ts" },
      result: {
        ok: true,
        path: "src/auth.ts",
        source: "github",
        content: "RAW_AUTH_IMPLEMENTATION_MARKER\n".repeat(40),
      },
    },
    {
      tool: "write",
      input: {
        action: "add_node",
        node: {
          label: "Session Store",
          description: "Persists sessions",
          category: "database",
        },
      },
      result: {
        ok: true,
        action: "add_node",
        nodeId: "node-2",
        label: "Session Store",
      },
    },
  ];

  const plannerPrompt = __test__.buildPlannerMessage("Map auth architecture", "agent", state, transcript);
  const finalPrompt = __test__.buildFinalSystemMessage("BASE SYSTEM", "agent", state, transcript);

  assert.match(plannerPrompt, /Tool transcript so far:/);
  assert.match(plannerPrompt, /RAW_AUTH_IMPLEMENTATION_MARKER/);

  assert.match(finalPrompt, /TOOL ACTIVITY SUMMARY FOR THIS TURN:/);
  assert.match(finalPrompt, /"contentChars": \d+/);
  assert.match(finalPrompt, /"label": "Session Store"/);
  assert.doesNotMatch(finalPrompt, /RAW_AUTH_IMPLEMENTATION_MARKER/);
});

test("chat-agent detects write intent for file-based draw requests", () => {
  assert.equal(
    __test__.requestLikelyNeedsCanvasWrite("draw a detailed flowchart of how iraq-ascii.html works"),
    true,
  );
});

test("chat-agent routes grep-style search prompts through the tool planner", () => {
  assert.equal(
    __test__.messageLikelyNeedsTools("find references to auth middleware", "ask"),
    true,
  );
});

test("chat-agent routes line-specific file questions through the tool planner", () => {
  assert.equal(
    __test__.messageLikelyNeedsTools("what is in line 199 in chatbot.py?", "ask"),
    true,
  );
});

test("streamChatResponse fails explicitly when a write-intent turn produces no canvas writes", async () => {
  const stub = createStubProvider([
    '{"type":"final"}',
    '{"operations":[],"summary":"No writes generated"}',
    '{"operations":[],"summary":"Repair also failed"}',
  ]);

  const events = await collectEvents(streamChatResponse({
    message: "draw a detailed flowchart of how iraq-ascii.html works",
    mode: "agent",
    context: null,
    runtimeSettings: {
      providerId: "openai",
      model: "test-model",
    },
    providerOverride: stub.provider,
    readFile: async (path: string) => ({
      path,
      content: null,
      source: "missing",
    }),
  }));

  const textEvents = events.filter((event): event is { type: string; text?: string } => (
    typeof event === "object" && event !== null && "type" in event
  ));
  const errorEvent = textEvents.find((event) => event.type === "error");

  assert.ok(errorEvent);
  assert.match(errorEvent?.text || "", /No canvas changes were applied/);
  assert.equal(textEvents.some((event) => event.type === "text"), false);
  assert.equal(stub.chatStreamCalls, 0);
});

test("streamChatResponse emits deterministic summaries after successful write-intent turns", async () => {
  const stub = createStubProvider([
    JSON.stringify({
      type: "tool",
      tool: "write_batch",
      status: "Building architecture",
      input: {
        operations: [
          {
            action: "add_node",
            node: {
              label: "HTML UI",
              description: "Renders the page shell and gathers user input for the Iraq ASCII view.",
              category: "component",
              files: ["pages/iraq-ascii.html"],
              complexity: "medium",
            },
          },
          {
            action: "add_node",
            node: {
              label: "ASCII Renderer",
              description: "Builds the ASCII output and updates the display from the page state.",
              category: "utility",
              files: ["pages/iraq-ascii.html"],
              complexity: "medium",
            },
          },
          {
            action: "add_edge",
            edge: {
              sourceLabel: "HTML UI",
              targetLabel: "ASCII Renderer",
              label: "renders",
              type: "calls",
              strength: "strong",
              direction: "one-way",
            },
          },
        ],
      },
    }),
    '{"type":"final"}',
  ]);

  const events = await collectEvents(streamChatResponse({
    message: "draw a detailed flowchart of how iraq-ascii.html works",
    mode: "agent",
    context: null,
    runtimeSettings: {
      providerId: "openai",
      model: "test-model",
    },
    providerOverride: stub.provider,
    readFile: async (path: string) => ({
      path,
      content: null,
      source: "missing",
    }),
  }));

  const writeEvents = events.filter((event): event is { type: string } => (
    typeof event === "object" && event !== null && "type" in event && (event as { type: string }).type === "write"
  ));
  const text = events
    .filter((event): event is { type: string; text?: string } => (
      typeof event === "object" && event !== null && "type" in event
    ))
    .filter((event) => event.type === "text")
    .map((event) => event.text || "")
    .join("");

  assert.ok(writeEvents.length >= 3);
  assert.match(text, /Updated the live canvas:/);
  assert.match(text, /Nodes: HTML UI, ASCII Renderer/);
  assert.match(text, /Edges: HTML UI -> ASCII Renderer/);
  assert.match(text, /Use Sync if you want later chat turns to use this exact canvas snapshot\./);
  assert.equal(stub.chatStreamCalls, 0);
});

test("streamChatResponse can execute grep and keep the final prompt compact", async () => {
  const stub = createStubProvider([
    JSON.stringify({
      type: "tool",
      tool: "grep",
      status: "Searching auth references",
      input: {
        query: "auth",
        path: "src",
      },
    }),
    '{"type":"final"}',
  ], ["Found auth references in the repo."]);

  const events = await collectEvents(streamChatResponse({
    message: "find references to auth",
    mode: "ask",
    context: null,
    availableFiles: ["src/auth.ts", "src/db.ts", "docs/auth.md"],
    cachedFiles: {
      "src/auth.ts": "const authHandler = true;\nexport function login() {}",
    },
    runtimeSettings: {
      providerId: "openai",
      model: "test-model",
    },
    providerOverride: stub.provider,
    readFile: async (path: string) => ({
      path,
      content: null,
      source: "missing",
    }),
  }));

  const text = events
    .filter((event): event is { type: string; text?: string } => (
      typeof event === "object" && event !== null && "type" in event
    ))
    .map((event) => event.text || "")
    .join("\n");
  const finalSystem = String(stub.chatStreamInputs[0]?.system || "");
  const toolSummary = finalSystem.split("TOOL ACTIVITY SUMMARY FOR THIS TURN:")[1] || "";

  assert.equal(stub.chatCalls, 2);
  assert.equal(stub.chatStreamCalls, 1);
  assert.match(text, /Searching auth references/);
  assert.match(text, /Found auth references in the repo\./);
  assert.match(toolSummary, /"query": "auth"/);
  assert.match(toolSummary, /"pathMatchCount": 1/);
  assert.match(toolSummary, /"contentMatchCount": 1/);
  assert.doesNotMatch(toolSummary, /authHandler = true/);
});
