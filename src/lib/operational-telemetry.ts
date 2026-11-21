import { z } from "zod";

/**
 * Privacy boundary for operational telemetry.
 *
 * Only the aggregate fields enumerated below can cross this boundary. In
 * particular, there is intentionally no generic metadata bag: chat text,
 * source text, repository identities, URLs, and file paths cannot be attached
 * to an event without both a TypeScript error and a runtime schema rejection.
 */

const requestIdSchema = z.string().refine((value) => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  || /^[0-9a-f]{32}$/i.test(value)
), "Request ID must be an opaque UUID or trace identifier");
const identifierSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const durationSchema = z.number().finite().nonnegative().max(24 * 60 * 60 * 1_000);
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const telemetryRouteSchema = z.enum([
  "/api/blueprint",
  "/api/chat",
  "/api/files",
  "/api/health",
  "/api/readiness",
  "/api/repo",
  "/api/settings/models",
  "/api/source-grant",
]);

const outcomeSchema = z.enum([
  "success",
  "error",
  "cancelled",
  "timeout",
  "quota-rejected",
  "capacity-rejected",
  "unavailable",
  "conflict",
  "recovered",
]);

const finishReasonSchema = z.enum(["stop", "length", "tool-call", "patch-proposed", "cancelled", "timeout", "error", "unknown"]);

const requestCompletedSchema = z.object({
  event: z.literal("request.completed"),
  requestId: requestIdSchema,
  route: telemetryRouteSchema,
  method: z.enum(["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]),
  status: z.number().int().min(100).max(599),
  outcome: outcomeSchema,
  durationMs: durationSchema,
  errorCode: identifierSchema.optional(),
  retryable: z.boolean().optional(),
  quotaLimit: countSchema.optional(),
  quotaRemaining: countSchema.optional(),
  quotaResetAt: z.number().int().nonnegative().optional(),
}).strict();

const upstreamCompletedSchema = z.object({
  event: z.literal("upstream.completed"),
  requestId: requestIdSchema,
  route: telemetryRouteSchema,
  upstream: z.enum(["github", "deepseek", "openai", "anthropic", "google", "ollama", "rate-limit-store"]),
  operation: z.enum([
    "resolve-revision",
    "fetch-tree",
    "read-blob",
    "read-analysis-source",
    "chat",
    "enrichment",
    "model-validation",
    "readiness-ping",
  ]),
  outcome: outcomeSchema,
  durationMs: durationSchema,
  providerId: z.enum(["deepseek", "openai", "anthropic", "google", "ollama"]).optional(),
  modelId: identifierSchema.optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  errorCode: identifierSchema.optional(),
  usageReported: z.boolean().optional(),
  inputTokens: countSchema.optional(),
  outputTokens: countSchema.optional(),
  totalTokens: countSchema.optional(),
  finishReason: finishReasonSchema.optional(),
  eventCount: countSchema.optional(),
  outputCharacters: countSchema.optional(),
}).strict();

const analysisStageSchema = z.object({
  event: z.literal("analysis.stage"),
  requestId: requestIdSchema,
  route: z.literal("/api/repo"),
  stage: z.enum(["validate", "resolve-revision", "fetch-tree", "determine-scope", "analyze", "enrich", "layout", "save"]),
  outcome: outcomeSchema,
  durationMs: durationSchema,
  discoveredCount: countSchema.optional(),
  analyzedCount: countSchema.optional(),
  excludedCount: countSchema.optional(),
  failedCount: countSchema.optional(),
  errorCode: identifierSchema.optional(),
}).strict();

const analysisCoverageSchema = z.object({
  event: z.literal("analysis.coverage"),
  requestId: requestIdSchema,
  route: z.literal("/api/repo"),
  treeComplete: z.boolean(),
  discoveredCount: countSchema,
  analyzedCount: countSchema,
  ignoredCount: countSchema,
  unsupportedCount: countSchema,
  oversizedCount: countSchema,
  failedCount: countSchema,
  unclassifiedCount: countSchema,
}).strict();

const quotaOutcomeSchema = z.object({
  event: z.literal("quota.outcome"),
  requestId: requestIdSchema,
  route: telemetryRouteSchema,
  scope: z.enum(["analysis", "chat", "source-read", "grant-refresh", "model-validation"]),
  outcome: z.enum(["success", "quota-rejected", "capacity-rejected", "unavailable"]),
  limit: countSchema.optional(),
  remaining: countSchema.optional(),
  resetAt: z.number().int().nonnegative().optional(),
}).strict();

const migrationOutcomeSchema = z.object({
  event: z.literal("migration.outcome"),
  migrationId: identifierSchema,
  fromVersion: countSchema,
  toVersion: countSchema,
  outcome: z.enum(["success", "error", "recovered"]),
  projectCount: countSchema,
  quarantinedCount: countSchema,
  durationMs: durationSchema,
  errorCode: identifierSchema.optional(),
}).strict();

const storageOutcomeSchema = z.object({
  event: z.literal("storage.outcome"),
  operation: z.enum(["open", "commit", "delete", "evict", "backup", "restore"]),
  outcome: z.enum(["success", "error", "conflict", "recovered"]),
  durationMs: durationSchema,
  recordCount: countSchema.optional(),
  byteCount: countSchema.optional(),
  errorCode: identifierSchema.optional(),
}).strict();

const patchOutcomeSchema = z.object({
  event: z.literal("patch.outcome"),
  requestId: requestIdSchema.optional(),
  outcome: z.enum(["success", "error", "cancelled", "conflict"]),
  operationCount: countSchema,
  nodeCount: countSchema.optional(),
  edgeCount: countSchema.optional(),
  durationMs: durationSchema,
  errorCode: identifierSchema.optional(),
}).strict();

const webVitalSchema = z.object({
  event: z.literal("web-vital"),
  metric: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
  value: z.number().finite().nonnegative(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
}).strict();

const clientSessionSchema = z.object({
  event: z.literal("client.session"),
  outcome: z.enum(["started", "completed", "crashed"]),
  durationMs: durationSchema.optional(),
}).strict();

export const operationalEventInputSchema = z.discriminatedUnion("event", [
  requestCompletedSchema,
  upstreamCompletedSchema,
  analysisStageSchema,
  analysisCoverageSchema,
  quotaOutcomeSchema,
  migrationOutcomeSchema,
  storageOutcomeSchema,
  patchOutcomeSchema,
  webVitalSchema,
  clientSessionSchema,
]);

export type OperationalEventInput = z.infer<typeof operationalEventInputSchema>;
export type TelemetryRoute = z.infer<typeof telemetryRouteSchema>;
export type TelemetryOutcome = z.infer<typeof outcomeSchema>;
export type TelemetryFinishReason = z.infer<typeof finishReasonSchema>;

export interface OperationalEventRecord {
  telemetrySchemaVersion: 1;
  service: "rassam";
  emittedAt: string;
  data: OperationalEventInput;
}

export type OperationalTelemetrySink = (record: Readonly<OperationalEventRecord>) => void;

const consoleSink: OperationalTelemetrySink = (record) => {
  // One JSON object per line works in serverless consoles and can be routed to
  // an external metrics backend later without coupling the application to one.
  console.info(JSON.stringify(record));
};

/**
 * Emits a validated, allow-listed operational event. Invalid/extended objects
 * are dropped silently so telemetry can neither leak data nor break a request.
 */
export function emitOperationalEvent(
  input: OperationalEventInput,
  sink: OperationalTelemetrySink = consoleSink,
  now: () => Date = () => new Date(),
): boolean {
  const parsed = operationalEventInputSchema.safeParse(input);
  if (!parsed.success) return false;

  try {
    sink({
      telemetrySchemaVersion: 1,
      service: "rassam",
      emittedAt: now().toISOString(),
      data: parsed.data,
    });
    return true;
  } catch {
    return false;
  }
}

export function telemetryNow(): number {
  return performance.now();
}

export function telemetryDuration(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}

export function normalizeTelemetryFinishReason(value: string | undefined): TelemetryFinishReason {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return "unknown";
  if (["stop", "completed", "end-turn"].includes(normalized)) return "stop";
  if (["length", "max-tokens", "max-output-tokens", "incomplete"].includes(normalized)) return "length";
  if (["tool-call", "tool-calls", "tool-use"].includes(normalized)) return "tool-call";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "timeout") return "timeout";
  if (["error", "failed"].includes(normalized)) return "error";
  return "unknown";
}

export function outcomeForErrorCode(code: string): TelemetryOutcome {
  if (code === "RATE_LIMITED") return "quota-rejected";
  if (code === "CAPACITY_EXCEEDED" || code === "REQUEST_IN_PROGRESS") return "capacity-rejected";
  if (code === "REQUEST_CANCELLED") return "cancelled";
  if (code.endsWith("UNAVAILABLE") || code === "PROVIDER_NOT_CONFIGURED" || code === "MODEL_NOT_AVAILABLE") {
    return "unavailable";
  }
  if (code.endsWith("CONFLICT") || code === "SOURCE_REVISION_CHANGED") return "conflict";
  return "error";
}
