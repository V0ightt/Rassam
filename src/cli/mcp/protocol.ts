// A dependency-free MCP server over stdio that speaks both protocol eras:
//
//   Legacy (2024-11-05 … 2025-11-25): `initialize` handshake, then requests.
//   Modern (2026-07-28): stateless; each request carries its protocol version
//   and client capabilities in `params._meta`, and `server/discover` replaces
//   the handshake.
//
// Framing is newline-delimited JSON-RPC 2.0: one message per line on stdout,
// nothing else. Diagnostics go to the injected `log` (stderr).

import { StringDecoder } from "node:string_decoder";
import type { Readable, Writable } from "node:stream";

export const MODERN_PROTOCOL_VERSION = "2026-07-28";
export const LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS];

export const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
export const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  UnsupportedProtocolVersion: -32022,
} as const;

export type JsonObject = Record<string, unknown>;
type JsonRpcId = string | number;

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: false;
}

export interface ToolOutcome {
  /** Machine-readable result, returned as `structuredContent`. */
  structured: JsonObject;
  /** Text shown to the model; defaults to the structured result as JSON. */
  text?: string;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  annotations: ToolAnnotations;
  handler(args: JsonObject): Promise<ToolOutcome> | ToolOutcome;
}

/** Thrown by tool handlers for failures the model can act on (bad input, missing blueprint). */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export interface McpServerOptions {
  name: string;
  title: string;
  version: string;
  instructions: string;
  tools: readonly McpTool[];
  log?(message: string): void;
}

class RpcError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function errorResponse(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonObject {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

// ── Tool input validation (the JSON Schema subset the tools use) ──

function typeMatches(type: unknown, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    default:
      return true;
  }
}

function validateProperty(name: string, schema: JsonObject, value: unknown): string | null {
  if (!typeMatches(schema.type, value)) return `"${name}" must be ${schema.type === "array" ? "an array" : `a ${String(schema.type)}`}`;
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.trim().length < schema.minLength) return `"${name}" must not be empty`;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return `"${name}" is too long (max ${schema.maxLength} characters)`;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return `"${name}" needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}`;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return `"${name}" has too many items (max ${schema.maxItems})`;
    const items = isObject(schema.items) ? schema.items : null;
    if (items && value.some((item) => !typeMatches(items.type, item))) return `"${name}" must be an array of ${String(items.type)}s`;
  }
  return null;
}

/** Returns a human-readable problem, or null when `args` satisfies `schema`. */
export function validateToolInput(schema: JsonObject, args: JsonObject): string | null {
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((key): key is string => typeof key === "string") : [];
  for (const key of required) {
    if (args[key] === undefined || args[key] === null) return `Missing required argument "${key}"`;
  }
  for (const [key, value] of Object.entries(args)) {
    const property = properties[key];
    if (!isObject(property)) {
      if (schema.additionalProperties === false) {
        const known = Object.keys(properties);
        return `Unknown argument "${key}"${known.length ? ` (expected: ${known.join(", ")})` : " (this tool takes no arguments)"}`;
      }
      continue;
    }
    if (value === undefined || value === null) continue;
    const problem = validateProperty(key, property, value);
    if (problem) return problem;
  }
  return null;
}

// ── Request handling ──────────────────────────────────────────

export interface McpHandler {
  /** Handle one line of input; resolves to the line to write back, or null for none. */
  handleLine(line: string): Promise<string | null>;
  /** Handle one decoded message (a request, notification, response or batch). */
  handleMessage(message: unknown): Promise<unknown | null>;
}

export function createMcpHandler(options: McpServerOptions): McpHandler {
  const log = options.log ?? (() => undefined);
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  const serverInfo = { name: options.name, title: options.title, version: options.version };
  const serverMeta = { [META_SERVER_INFO]: { name: options.name, version: options.version } };

  function listTools(): JsonObject {
    return {
      tools: options.tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      })),
    };
  }

  function toolFailure(message: string): JsonObject {
    return { content: [{ type: "text", text: message }], isError: true };
  }

  async function callTool(params: JsonObject): Promise<JsonObject> {
    if (typeof params.name !== "string" || !params.name) throw new RpcError(ErrorCode.InvalidParams, "tools/call requires params.name");
    const tool = tools.get(params.name);
    if (!tool) throw new RpcError(ErrorCode.InvalidParams, `Unknown tool: ${params.name}`);
    const args = params.arguments ?? {};
    if (!isObject(args)) return toolFailure(`Arguments for ${tool.name} must be a JSON object.`);
    const problem = validateToolInput(tool.inputSchema, args);
    if (problem) return toolFailure(`Invalid arguments for ${tool.name}: ${problem}.`);
    try {
      const outcome = await tool.handler(args);
      const text = outcome.text ?? JSON.stringify(outcome.structured, null, 2);
      return { content: [{ type: "text", text }], structuredContent: outcome.structured, isError: false };
    } catch (error) {
      if (!(error instanceof ToolError)) log(`tool ${tool.name} failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      return toolFailure(error instanceof Error ? error.message : String(error));
    }
  }

  function initialize(params: JsonObject): JsonObject {
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    const legacy: readonly string[] = LEGACY_PROTOCOL_VERSIONS;
    return {
      protocolVersion: legacy.includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo,
      instructions: options.instructions,
    };
  }

  function discover(): JsonObject {
    return {
      supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      capabilities: { tools: {} },
      instructions: options.instructions,
      ttlMs: 60_000,
      cacheScope: "private",
    };
  }

  async function dispatch(method: string, params: JsonObject): Promise<JsonObject> {
    switch (method) {
      case "initialize":
        return initialize(params);
      case "ping":
        return {};
      case "server/discover":
        return discover();
      case "tools/list":
        return listTools();
      case "tools/call":
        return callTool(params);
      default:
        throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${method}`);
    }
  }

  /** The per-request protocol version of the stateless era, if the request carries one. */
  function carriedVersion(params: JsonObject): unknown {
    return isObject(params._meta) ? params._meta[META_PROTOCOL_VERSION] : undefined;
  }

  async function handleRequest(id: JsonRpcId, method: string, rawParams: unknown): Promise<JsonObject> {
    if (rawParams !== undefined && !isObject(rawParams)) return errorResponse(id, ErrorCode.InvalidParams, "params must be an object");
    const params = rawParams ?? {};
    const requested = carriedVersion(params);
    // `server/discover` is how a client learns the versions, so it always answers.
    if (requested !== undefined && method !== "server/discover" && !(typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested))) {
      return errorResponse(id, ErrorCode.UnsupportedProtocolVersion, `Unsupported protocol version: ${String(requested)}`, {
        supported: [...SUPPORTED_PROTOCOL_VERSIONS],
        requested,
      });
    }
    const modern = method === "server/discover" || requested === MODERN_PROTOCOL_VERSION;
    try {
      const result = await dispatch(method, params);
      if (!modern) return { jsonrpc: "2.0", id, result };
      const meta = isObject(result._meta) ? { ...result._meta, ...serverMeta } : serverMeta;
      return { jsonrpc: "2.0", id, result: { resultType: "complete", ...result, _meta: meta } };
    } catch (error) {
      if (error instanceof RpcError) return errorResponse(id, error.code, error.message, error.data);
      log(`internal error in ${method}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      return errorResponse(id, ErrorCode.InternalError, "Internal error");
    }
  }

  async function handleSingle(message: unknown): Promise<JsonObject | null> {
    if (!isObject(message)) return errorResponse(null, ErrorCode.InvalidRequest, "Invalid request: expected a JSON-RPC object");
    const hasId = "id" in message && message.id !== undefined;
    const id = isId(message.id) ? message.id : null;
    if (typeof message.method !== "string") {
      // A response to a request we never sent (we send none): ignore it.
      if (message.jsonrpc === "2.0" && ("result" in message || "error" in message)) return null;
      return errorResponse(id, ErrorCode.InvalidRequest, "Invalid request: missing method");
    }
    if (message.jsonrpc !== "2.0") {
      return hasId ? errorResponse(id, ErrorCode.InvalidRequest, 'Invalid request: jsonrpc must be "2.0"') : null;
    }
    // Notifications (initialized, cancelled, progress, ...) never get a response.
    if (!hasId) return null;
    if (id === null) return errorResponse(null, ErrorCode.InvalidRequest, "Invalid request: id must be a string or number");
    return handleRequest(id, message.method, message.params);
  }

  async function handleMessage(message: unknown): Promise<unknown | null> {
    if (!Array.isArray(message)) return handleSingle(message);
    if (message.length === 0) return errorResponse(null, ErrorCode.InvalidRequest, "Invalid request: empty batch");
    const responses: JsonObject[] = [];
    for (const entry of message) {
      const response = await handleSingle(entry);
      if (response) responses.push(response);
    }
    return responses.length ? responses : null;
  }

  async function handleLine(line: string): Promise<string | null> {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return JSON.stringify(errorResponse(null, ErrorCode.ParseError, "Parse error: invalid JSON"));
    }
    try {
      const response = await handleMessage(message);
      return response === null ? null : JSON.stringify(response);
    } catch (error) {
      log(`unexpected failure: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      return JSON.stringify(errorResponse(null, ErrorCode.InternalError, "Internal error"));
    }
  }

  return { handleLine, handleMessage };
}

// ── Transport ─────────────────────────────────────────────────

/**
 * Serve MCP on a pair of streams. Requests are processed one at a time, in
 * order. Resolves when the input ends (the client closed stdin) and every
 * pending response has been written.
 */
export function serveMcp(options: McpServerOptions, input: Readable, output: Writable): Promise<void> {
  const handler = createMcpHandler(options);
  const log = options.log ?? (() => undefined);
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let queue: Promise<void> = Promise.resolve();
  let closed = false;

  function send(line: string): void {
    if (closed) return;
    // JSON.stringify never emits raw newlines, so one message is one line.
    output.write(`${line}\n`);
  }

  function enqueue(line: string): void {
    queue = queue
      .then(() => handler.handleLine(line))
      .then((response) => {
        if (response !== null) send(response);
      })
      .catch((error) => log(`failed to handle message: ${error instanceof Error ? error.message : String(error)}`));
  }

  function drain(final: boolean): void {
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      enqueue(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (final && buffer.trim()) {
      enqueue(buffer);
      buffer = "";
    }
  }

  return new Promise((resolvePromise) => {
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      buffer += decoder.end();
      drain(true);
      void queue.then(() => resolvePromise());
    };
    output.on("error", (error: NodeJS.ErrnoException) => {
      // The client went away; stop writing and wind down.
      closed = true;
      if (error.code !== "EPIPE") log(`output error: ${error.message}`);
      finish();
    });
    input.on("data", (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
      drain(false);
    });
    input.on("end", finish);
    input.on("close", finish);
    input.on("error", (error) => {
      log(`input error: ${error.message}`);
      finish();
    });
  });
}
