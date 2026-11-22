# Operational observability

Rassam emits newline-delimited JSON operational events to the server process console. No external telemetry vendor is required. The deployment platform may retain, aggregate, alert on, or forward these events according to its own retention policy.

## Privacy boundary

All events pass through `src/lib/operational-telemetry.ts`, a strict runtime schema and TypeScript discriminated union. There is no arbitrary metadata field. Invalid or extended events are discarded and never allowed to fail a user request.

Allowed fields are limited to:

- Request ID, allow-listed route, method, safe outcome/error code, status, latency, and aggregate quota state.
- Upstream name/operation, latency, configured provider/model identifier, aggregate usage when a provider reports it, finish reason, event count, and output character count.
- Analysis stage, aggregate coverage counts, and tree completeness.
- Aggregate migration, storage, patch, Web Vital, and crash/session outcomes.

Never log chat text, prompts, source excerpts, repository owner/name/URL, commit data, branch/ref, file path/name, credentials, cookies, IP addresses, source grants, exports, request bodies, upstream response bodies, or raw error objects. Request IDs are the only supported correlation key.

Provider adapters forward native aggregate usage and finish metadata through a content-free callback when the upstream response supplies it. Some OpenAI-compatible streaming servers omit usage; those events set `usageReported: false`. Never estimate tokens from source/prompt text. Record only trusted non-negative token counts and a normalized finish reason.

## Core event types

| Event | Purpose |
|---|---|
| `request.completed` | Route status, outcome, Rassam overhead, and aggregate quota state. Streaming routes emit this after stream termination. |
| `upstream.completed` | GitHub, provider, or limiter latency and bounded outcome metadata. |
| `quota.outcome` | Accepted, quota-rejected, capacity-rejected, or unavailable limiter decisions. |
| `analysis.stage` / `analysis.coverage` | Stage timings and aggregate file accounting. |
| `migration.outcome` / `storage.outcome` | Browser-reported aggregate durability outcomes. |
| `patch.outcome` | Aggregate proposal application result; never patch contents or labels. |
| `web-vital` / `client.session` | Privacy-safe browser quality and crash-free-session signals. |

## Recommended alerts

- Readiness is non-200 for two consecutive probes.
- Internal non-upstream 5xx outcomes exceed 0.5% over 15 minutes.
- A provider or GitHub `unavailable` rate exceeds 10% over 10 minutes.
- Quota or capacity rejection increases above the beta baseline.
- p95 Rassam route overhead or upstream latency exceeds the published budget for three windows.
- Any migration/storage error, patch invariant error, or unexpected telemetry schema rejection occurs.
- Crash-free sessions fall below 99.5% during beta/RC.

Do not add high-cardinality repository, path, session, or user labels to metrics derived from these events.

## Probes

- `GET /api/health` is a liveness check. It performs no upstream work.
- `GET /api/readiness` validates schema versions, source/session configuration, the static provider catalog, and the durable limiter. Provider readiness never performs a billable completion.
- Public-profile readiness is fail-closed without strong signing secrets and a reachable durable rate-limit store.
