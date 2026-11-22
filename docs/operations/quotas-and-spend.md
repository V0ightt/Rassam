# Runbook: quotas, capacity, and spend

## Guardrails

Production requires the durable limiter. The defaults are cost controls, not billing predictions:

- Opening a repository (`/api/blueprint/open`): 120/hour per anonymous session, 600/day per IP.
- Building a snapshot (`/api/blueprint`): 30/hour per session, 200/day per IP, one active job per session.
- Commit timeline and live watch (`/api/blueprint/commits`): 400/hour per session, 4,000/day per IP.
- Change requests (`/api/blueprint/edit`): 60/hour per session, 300/day per IP, one active request per session. Only requests the built-in parser cannot answer reach a model.
- Model validation (`/api/settings/models`): 10/hour per session, 30/day per IP, one active request per session.

Changing limits requires an observed beta workload, a written expected-cost calculation, and rollback values. Never disable fail-closed behavior to recover availability.

## Respond to rejection spikes

1. Split `quota-rejected` from `capacity-rejected` and limiter `unavailable` events.
2. For quota rejection, confirm the reset metadata and look for organic load versus abuse using aggregate counts only.
3. For capacity rejection, inspect upstream latency and stuck leases before raising a limit.
4. For limiter unavailable, treat readiness as failed and restore the durable store; do not use the in-memory implementation in public production.
5. If model spend approaches your threshold, lower the change-request limits or unset the provider keys; the deterministic parser, checks and manual editing keep working without a model.

## Recover and tune

1. Confirm expired leases release and counters reset as designed.
2. Load-test with deterministic provider fixtures before raising any production value.
3. Raise one boundary at a time by no more than the measured capacity margin.
4. Verify rate-limit headers remain transparent and contain no cost or credential data.
5. Record the previous/new values, measured rationale, approval, and rollback trigger.

