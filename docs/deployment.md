# Deployment

## Supported 1.0 profile

The hosted profile is anonymous and public-repository-only. Blueprint drafts and preferences stay in the browser. The server performs ephemeral GitHub requests and, only when a user selects a model for "tell Rassam what to change", ephemeral AI requests.

Production must provide:

- A strong `SOURCE_GRANT_SECRET` and `SESSION_SIGNING_SECRET`
- A durable Redis-compatible rate-limit store (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- At least one explicitly configured AI provider if the model path of the intent bar is offered
- A GitHub token with public-repository access only, or no GitHub token
- HTTPS and the security headers emitted by the application

Readiness must fail when the public profile lacks the signing secrets or the durable limiter. Never deploy with a shared token that can read private repositories.

Every API route is rate limited per anonymous session and per IP address; the limits are set next to each route in `src/app/api/`. They are cost controls, not billing estimates.

## Operational checks

- `npm ci`
- `npm run check`
- Health and readiness endpoints
- Rate limits
- Redacted logs and metrics
- Dependency and secret scanning

Provider outages must not prevent opening a repository, checking it or editing the blueprint by hand or through the deterministic parser. Users should receive an actionable error and keep their current draft.

Operational telemetry and incident procedures are documented in:

- [Observability](./operations/observability.md)
- [Provider outage](./operations/provider-outage.md)
- [GitHub limits](./operations/github-rate-limits.md)
- [Quotas and spend](./operations/quotas-and-spend.md)
- [Dependency response](./operations/dependency-response.md)
- [Rollback](./operations/rollback.md)
