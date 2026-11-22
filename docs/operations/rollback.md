# Runbook: release rollback

## Preconditions

- Retain the previous verified production artifact and configuration.
- A server rollback must never delete or rewrite browser data: drafts live in the `rassam-blueprints` IndexedDB database and survive any server version.

## Trigger

Rollback for an authorization/source-grant defect, loss of drafts, unbounded spend, persistent readiness failure, severe performance regression, or a P0/P1 defect without a safe forward fix.

## Procedure

1. Freeze deploys and capture request IDs, aggregate outcome counts, versions, and timestamps. Do not capture request bodies or repository, instruction or source data.
2. Lower the route limits or unset provider keys when spend is the trigger.
3. Route traffic to the prior immutable artifact without changing browser schemas or clearing site data.
4. Restore the prior environment configuration and verify signing secrets and limiter credentials refer to the intended environment.
5. Run `/api/health` and `/api/readiness`, then fixture-only smoke journeys for the sample project, opening a public repository at a pinned commit, a parsed change request, and explicit provider error handling.
6. Confirm the rolled-back build still opens existing drafts and leaves them intact for a later forward recovery.
7. Monitor readiness, 5xx and quota signals for at least 30 minutes.

## Forward recovery

Prepare a new artifact from the last known-good commit plus the narrowly scoped fix. Re-run the rollback drill before promoting it. Never repair browser data by destructive blanket deletion.

