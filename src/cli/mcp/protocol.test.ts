import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  ErrorCode,
  META_CLIENT_CAPABILITIES,
  META_PROTOCOL_VERSION,
  META_SERVER_INFO,
  SUPPORTED_PROTOCOL_VERSIONS,
  ToolError,
  createMcpHandler,
  serveMcp,
  validateToolInput,
} from "./protocol";
import type { McpServerOptions, McpTool } from "./protocol";

type Message = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const TOOLS: McpTool[] = [
  {
    name: "echo",
    title: "Echo",
    description: "Returns its input",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: 20 }, tags: { type: "array", items: { type: "string" }, maxItems: 2 } },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    handler: (args) => ({ structured: { echoed: args.text, lines: "a\nb" } }),
  },
  {
    name: "no_args",
    title: "No arguments",
    description: "Takes nothing",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: READ_ONLY,
    handler: () => ({ structured: { ok: true }, text: "done" }),
  },
  {
    name: "fails",
    title: "Fails",
    description: "Always fails",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { ...READ_ONLY, readOnlyHint: false },
    handler: () => {
      throw new ToolError("No blueprint found");
    },
  },
  {
    name: "crashes",
    title: "Crashes",
    description: "Throws an unexpected error",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: READ_ONLY,
    handler: async () => {
      throw new TypeError("boom");
    },
  },
];

function options(logs: string[] = []): McpServerOptions {
  return { name: "rassam", title: "Rassam Blueprint", version: "9.9.9", instructions: "Use the tools.", tools: TOOLS, log: (message) => logs.push(message) };
}

const MODERN_META = { [META_PROTOCOL_VERSION]: "2026-07-28", [META_CLIENT_CAPABILITIES]: {} };

async function ask(message: unknown, logs?: string[]): Promise<Message> {
  const line = await createMcpHandler(options(logs)).handleLine(JSON.stringify(message));
  expect(line).not.toBeNull();
  return JSON.parse(line as string) as Message;
}

/** Feed raw input through the stream transport and return everything written to "stdout". */
async function session(input: string | string[]): Promise<{ raw: string; messages: Message[]; logs: string[] }> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const logs: string[] = [];
  const chunks: Buffer[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = serveMcp(options(logs), stdin, stdout);
  for (const chunk of Array.isArray(input) ? input : [input]) stdin.write(chunk);
  stdin.end();
  await done;
  const raw = Buffer.concat(chunks).toString("utf8");
  const messages = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Message);
  return { raw, messages, logs };
}

describe("legacy era", () => {
  it("answers initialize with the client's version when supported", async () => {
    const response = await ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "rassam", title: "Rassam Blueprint", version: "9.9.9" },
        instructions: "Use the tools.",
      },
    });
  });

  it("falls back to the newest legacy version for unknown or missing versions", async () => {
    for (const protocolVersion of ["1999-01-01", "2026-07-28", undefined]) {
      const response = await ask({ jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion } });
      expect(response.result.protocolVersion).toBe("2025-11-25");
    }
    for (const protocolVersion of ["2025-11-25", "2025-03-26", "2024-11-05"]) {
      const response = await ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion } });
      expect(response.result.protocolVersion).toBe(protocolVersion);
    }
  });

  it("answers ping with an empty result", async () => {
    expect(await ask({ jsonrpc: "2.0", id: 7, method: "ping" })).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });

  it("lists tools with object input schemas and annotations", async () => {
    const response = await ask({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(response.result.resultType).toBeUndefined();
    expect(response.result.tools.map((tool: Message) => tool.name)).toEqual(["echo", "no_args", "fails", "crashes"]);
    for (const tool of response.result.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(Object.keys(tool).sort()).toEqual(["annotations", "description", "inputSchema", "name", "title"]);
      expect(tool.annotations.openWorldHint).toBe(false);
    }
    expect(response.result.tools[1].inputSchema).toEqual({ type: "object", additionalProperties: false });
  });

  it("calls a tool and returns text plus structured content", async () => {
    const response = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } });
    expect(response.result.isError).toBe(false);
    expect(response.result.structuredContent).toEqual({ echoed: "hi", lines: "a\nb" });
    expect(response.result.content).toHaveLength(1);
    expect(response.result.content[0].type).toBe("text");
    expect(JSON.parse(response.result.content[0].text)).toEqual({ echoed: "hi", lines: "a\nb" });
    const custom = await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "no_args" } });
    expect(custom.result.content[0].text).toBe("done");
  });

  it("reports tool failures as results with isError", async () => {
    const logs: string[] = [];
    const failed = await ask({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "fails", arguments: {} } }, logs);
    expect(failed.error).toBeUndefined();
    expect(failed.result).toEqual({ content: [{ type: "text", text: "No blueprint found" }], isError: true });
    expect(logs).toEqual([]);

    const crashed = await ask({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "crashes" } }, logs);
    expect(crashed.result.isError).toBe(true);
    expect(crashed.result.content[0].text).toBe("boom");
    expect(logs.join("\n")).toContain("tool crashes failed");
  });

  it("reports bad tool input as isError with a helpful message", async () => {
    const cases: Array<[unknown, RegExp]> = [
      [{}, /Missing required argument "text"/],
      [{ text: 5 }, /"text" must be a string/],
      [{ text: "  " }, /"text" must not be empty/],
      [{ text: "x".repeat(21) }, /too long/],
      [{ text: "ok", extra: 1 }, /Unknown argument "extra" \(expected: text, tags\)/],
      [{ text: "ok", tags: [1] }, /array of strings/],
      [{ text: "ok", tags: ["a", "b", "c"] }, /too many items/],
      ["not-an-object", /must be a JSON object/],
    ];
    for (const [args, pattern] of cases) {
      const response = await ask({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: args } });
      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toMatch(pattern);
    }
    const noArgs = await ask({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "no_args", arguments: { x: 1 } } });
    expect(noArgs.result.content[0].text).toContain("takes no arguments");
  });

  it("rejects unknown tools and methods with JSON-RPC errors", async () => {
    const tool = await ask({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "nope" } });
    expect(tool.error).toMatchObject({ code: ErrorCode.InvalidParams, message: "Unknown tool: nope" });
    const missing = await ask({ jsonrpc: "2.0", id: 9, method: "tools/call", params: {} });
    expect(missing.error.code).toBe(-32602);
    const method = await ask({ jsonrpc: "2.0", id: 10, method: "resources/list" });
    expect(method).toEqual({ jsonrpc: "2.0", id: 10, error: { code: -32601, message: "Method not found: resources/list" } });
    const params = await ask({ jsonrpc: "2.0", id: 11, method: "tools/list", params: [1] });
    expect(params.error.code).toBe(-32602);
  });

  it("stays silent for notifications and stray responses", async () => {
    const handler = createMcpHandler(options());
    expect(await handler.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).toBeNull();
    expect(await handler.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 3, reason: "user" } }))).toBeNull();
    expect(await handler.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "unknown/notification" }))).toBeNull();
    expect(await handler.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 4, result: {} }))).toBeNull();
    expect(await handler.handleLine("   ")).toBeNull();
  });
});

describe("modern era (2026-07-28)", () => {
  it("answers server/discover without a handshake", async () => {
    const response = await ask({ jsonrpc: "2.0", id: 1, method: "server/discover" });
    expect(response.result).toEqual({
      resultType: "complete",
      supportedVersions: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"],
      capabilities: { tools: {} },
      instructions: "Use the tools.",
      ttlMs: 60000,
      cacheScope: "private",
      _meta: { [META_SERVER_INFO]: { name: "rassam", version: "9.9.9" } },
    });
    // Discovery answers even when the client guesses a version we do not speak.
    const guess = await ask({ jsonrpc: "2.0", id: 2, method: "server/discover", params: { _meta: { [META_PROTOCOL_VERSION]: "2030-01-01" } } });
    expect(guess.result.supportedVersions).toEqual([...SUPPORTED_PROTOCOL_VERSIONS]);
  });

  it("adds resultType and server info to every stateless result", async () => {
    const list = await ask({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: MODERN_META } });
    expect(list.result.resultType).toBe("complete");
    expect(list.result._meta[META_SERVER_INFO]).toEqual({ name: "rassam", version: "9.9.9" });
    expect(list.result.tools).toHaveLength(4);

    const call = await ask({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo", arguments: { text: "hi" }, _meta: MODERN_META } });
    expect(call.result).toMatchObject({ resultType: "complete", isError: false, structuredContent: { echoed: "hi" } });
    expect(call.result._meta[META_SERVER_INFO].name).toBe("rassam");

    const failed = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "fails", _meta: MODERN_META } });
    expect(failed.result).toMatchObject({ resultType: "complete", isError: true });

    const ping = await ask({ jsonrpc: "2.0", id: 4, method: "ping", params: { _meta: MODERN_META } });
    expect(ping.result).toEqual({ resultType: "complete", _meta: { [META_SERVER_INFO]: { name: "rassam", version: "9.9.9" } } });
  });

  it("rejects unsupported protocol versions with -32022", async () => {
    const response = await ask({ jsonrpc: "2.0", id: 5, method: "tools/list", params: { _meta: { [META_PROTOCOL_VERSION]: "2031-01-01" } } });
    expect(response.error.code).toBe(-32022);
    expect(response.error.data).toEqual({ supported: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"], requested: "2031-01-01" });
    const wrongType = await ask({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "echo", _meta: { [META_PROTOCOL_VERSION]: 20260728 } } });
    expect(wrongType.error.code).toBe(ErrorCode.UnsupportedProtocolVersion);
  });

  it("keeps the legacy result shape when a request carries a legacy version", async () => {
    const response = await ask({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [META_PROTOCOL_VERSION]: "2025-11-25" } } });
    expect(response.result.resultType).toBeUndefined();
    expect(response.result._meta).toBeUndefined();
  });

  it("still returns JSON-RPC errors for unknown tools and methods", async () => {
    const tool = await ask({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope", _meta: MODERN_META } });
    expect(tool.error.code).toBe(-32602);
    const method = await ask({ jsonrpc: "2.0", id: 2, method: "initialize/never", params: { _meta: MODERN_META } });
    expect(method.error.code).toBe(-32601);
  });
});

describe("malformed input", () => {
  it("answers a parse error with id null", async () => {
    const line = await createMcpHandler(options()).handleLine("{not json");
    expect(JSON.parse(line as string)).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: invalid JSON" } });
  });

  it("answers invalid requests with -32600", async () => {
    expect((await ask(42)).error).toMatchObject({ code: -32600 });
    expect((await ask(42)).id).toBeNull();
    expect((await ask({ jsonrpc: "2.0", id: 3 })).error.code).toBe(-32600);
    expect((await ask({ jsonrpc: "1.0", id: 3, method: "ping" })).error.code).toBe(-32600);
    expect((await ask({ jsonrpc: "2.0", id: { nested: true }, method: "ping" })).error.code).toBe(-32600);
    expect((await ask({ jsonrpc: "2.0", id: null, method: "ping" })).id).toBeNull();
    expect((await ask([])).error.code).toBe(-32600);
  });

  it("handles legacy batches", async () => {
    const response = (await ask([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "nope" },
    ])) as unknown as Message[];
    expect(response).toHaveLength(2);
    expect(response[0]).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(response[1].error.code).toBe(-32601);
  });
});

describe("stdio transport", () => {
  it("writes only single-line JSON-RPC messages to stdout, in request order", async () => {
    const lines = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      "this is not json",
      "",
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { text: "multi\nline ✓" } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "crashes" } }),
      JSON.stringify({ jsonrpc: "2.0", id: 5, method: "nope" }),
      JSON.stringify({ jsonrpc: "2.0", id: 6, method: "server/discover" }),
    ];
    const { raw, messages, logs } = await session(`${lines.join("\r\n")}\r\n`);
    expect(raw.endsWith("\n")).toBe(true);
    const outputLines = raw.split("\n").filter(Boolean);
    expect(outputLines).toHaveLength(7);
    for (const line of outputLines) {
      const message = JSON.parse(line) as Message;
      expect(message.jsonrpc).toBe("2.0");
      expect("result" in message || "error" in message).toBe(true);
    }
    expect(messages.map((message) => message.id)).toEqual([1, null, 2, 3, 4, 5, 6]);
    expect(messages[3].result.structuredContent.echoed).toBe("multi\nline ✓");
    // Diagnostics go to the log, never to stdout.
    expect(logs.join("\n")).toContain("boom");
    expect(raw).not.toContain("tool crashes failed");
  });

  it("reassembles messages split across chunks, including multi-byte characters", async () => {
    const line = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: { text: "héllo ✓" } } })}\n`;
    const bytes = Buffer.from(line, "utf8");
    const split = bytes.indexOf(Buffer.from("✓")) + 1;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const chunks: Buffer[] = [];
    stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = serveMcp(options(), stdin, stdout);
    stdin.write(bytes.subarray(0, split));
    await new Promise((resolve) => setTimeout(resolve, 5));
    stdin.write(bytes.subarray(split));
    stdin.end();
    await done;
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Message;
    expect(message.result.structuredContent.echoed).toBe("héllo ✓");
  });

  it("answers a final message without a trailing newline and resolves on EOF", async () => {
    const { messages } = await session(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(messages).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
    expect((await session("")).raw).toBe("");
  });
});

describe("validateToolInput", () => {
  it("accepts valid input and ignores null optionals", () => {
    const schema = TOOLS[0].inputSchema;
    expect(validateToolInput(schema, { text: "ok" })).toBeNull();
    expect(validateToolInput(schema, { text: "ok", tags: null })).toBeNull();
    expect(validateToolInput(schema, { text: "ok", tags: ["a"] })).toBeNull();
  });
});
