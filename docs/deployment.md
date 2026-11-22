# Deployment

## Supported 1.0 profile

The hosted profile is anonymous and public-repository-only. Projects and cached source stay in the browser. The server performs ephemeral GitHub and AI requests.

Production must provide:

- A strong `SOURCE_GRANT_SECRET`
- A durable Redis-compatible rate-limit store
- At least one explicitly configured AI provider if chat or enrichment is enabled
- A GitHub token with public-repository access only, or no GitHub token
- HTTPS and the security headers emitted by the application

Readiness must fail when the public profile lacks the source-grant secret or durable limiter. Never deploy with a shared token that can read private repositories.

The application defaults to 1,000 analyses and 5,000 chat turns per deployment per day, with four concurrent analyses and twenty concurrent chat turns. Override these fail-closed circuit breakers with `RASSAM_DAILY_ANALYSIS_LIMIT`, `RASSAM_ANALYSIS_CONCURRENCY`, `RASSAM_DAILY_CHAT_LIMIT`, and `RASSAM_CHAT_CONCURRENCY` only after measuring a beta workload. These ceilings are cost controls, not billing estimates.

## Operational checks

- `npm ci`
- `npm run check`
- Health and readiness endpoints
- Rate-limit and spend circuit breakers
- Redacted logs and metrics
- Dependency and secret scanning

Provider outages must not prevent deterministic repository analysis. Users should receive an actionable error and retain their current local project.

Operational telemetry and incident procedures are documented in:

- [Observability](./operations/observability.md)
- [Provider outage](./operations/provider-outage.md)
- [GitHub limits](./operations/github-rate-limits.md)
- [Quotas and spend](./operations/quotas-and-spend.md)
- [Dependency response](./operations/dependency-response.md)
- [Rollback](./operations/rollback.md)
