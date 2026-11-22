import { z } from "zod";
import { blueprintIdSchema, type Blueprint, type BlueprintIssue } from "./schema";

// Runtime status: what is actually running, per component. Hosts (a GitHub
// Action, a cron job) probe the `runtime` declared in the blueprint and write
// the result to `.rassam/status.json`; the diagram overlays it on the design.

export const STATUS_VERSION = 1;
export const STATUS_PATH = ".rassam/status.json";

export const componentStateSchema = z.enum(["up", "degraded", "down", "unknown"]);
export type ComponentState = z.infer<typeof componentStateSchema>;

export const statusSourceSchema = z.enum(["health-check", "deployment", "workflow", "manual"]);
export type StatusSource = z.infer<typeof statusSourceSchema>;

const timestampSchema = z.string().trim().min(4).max(40);

export const componentStatusSchema = z
  .object({
    state: componentStateSchema,
    source: statusSourceSchema,
    detail: z.string().max(300).optional(),
    latencyMs: z.number().min(0).max(3_600_000).optional(),
    url: z.string().trim().max(500).optional(),
    checkedAt: timestampSchema.optional(),
  })
  .strict();
export type ComponentStatus = z.infer<typeof componentStatusSchema>;

export const systemStatusSchema = z
  .object({
    version: z.literal(STATUS_VERSION),
    /** ISO-8601 time of the probe run. */
    checkedAt: timestampSchema,
    commit: z.string().trim().max(64).optional(),
    components: z.record(blueprintIdSchema, componentStatusSchema),
  })
  .strict();
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export interface SystemStatusParseResult {
  ok: boolean;
  status?: SystemStatus;
  issues: BlueprintIssue[];
}

function issuePath(path: ReadonlyArray<PropertyKey>): string {
  return (
    path
      .map((segment) => (typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`))
      .join("")
      .replace(/^\./, "") || "(root)"
  );
}

/** Parse status JSON text. Never throws. */
export function parseSystemStatus(text: string): SystemStatusParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    return { ok: false, issues: [{ path: "(root)", message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }] };
  }
  const result = systemStatusSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((issue) => ({ path: issuePath(issue.path), message: issue.message })) };
  }
  return { ok: true, status: result.data, issues: [] };
}

const COMPONENT_KEY_ORDER = ["state", "source", "detail", "latencyMs", "url", "checkedAt"] as const;

/** Deterministic serialization: components sorted by id, fixed key order, trailing newline. */
export function serializeSystemStatus(status: SystemStatus): string {
  const components: Record<string, Record<string, unknown>> = {};
  for (const id of Object.keys(status.components).sort()) {
    const entry = status.components[id];
    const ordered: Record<string, unknown> = {};
    for (const key of COMPONENT_KEY_ORDER) if (entry[key] !== undefined) ordered[key] = entry[key];
    components[id] = ordered;
  }
  const ordered: Record<string, unknown> = { version: status.version, checkedAt: status.checkedAt };
  if (status.commit !== undefined) ordered.commit = status.commit;
  ordered.components = components;
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export type OverallStatus = "operational" | "degraded" | "outage" | "unknown";

export interface StatusSummary {
  up: number;
  degraded: number;
  down: number;
  unknown: number;
  /** Components that declare `runtime` in the blueprint. */
  monitored: number;
  overall: OverallStatus;
}

export function overallStatus(counts: { up: number; degraded: number; down: number }): OverallStatus {
  if (counts.down > 0) return "outage";
  if (counts.degraded > 0) return "degraded";
  return counts.up > 0 ? "operational" : "unknown";
}

/**
 * Roll the per-component states up. Only components that declare `runtime`
 * count as monitored; a monitored component without a status entry is unknown.
 */
export function summarizeStatus(status: SystemStatus | null | undefined, blueprint: Blueprint | null | undefined): StatusSummary {
  const summary: StatusSummary = { up: 0, degraded: 0, down: 0, unknown: 0, monitored: 0, overall: "unknown" };
  for (const component of blueprint?.components ?? []) {
    if (!component.runtime) continue;
    summary.monitored += 1;
    const entry = status?.components[component.id];
    summary[entry?.state ?? "unknown"] += 1;
  }
  summary.overall = overallStatus(summary);
  return summary;
}

/** True when the status is more than `maxAgeMinutes` away from `now`, or a timestamp is unreadable. */
export function isStale(status: SystemStatus, now: Date | number | string, maxAgeMinutes = 30): boolean {
  const checked = Date.parse(status.checkedAt);
  const current = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(checked) || !Number.isFinite(current)) return true;
  return Math.abs(current - checked) > maxAgeMinutes * 60_000;
}
