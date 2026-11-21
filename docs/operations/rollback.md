# Runbook: release rollback

## Preconditions

- Retain the previous verified production artifact and configuration.
- Keep the legacy `repoAgent_projects` localStorage key untouched through the first 1.x maintenance release.
- Keep analysis V2 and stream V2 behind reversible deployment controls through RC.
- Browser migration remains copy-first and idempotent; server rollback must never delete or rewrite IndexedDB V2 records.

## Trigger

Rollback for an authorization/source-grant defect, data loss or cross-project mutation, corrupt migration, unbounded spend, persistent readiness failure, severe performance regression, or a P0/P1 defect without a safe forward fix.

## Procedure

1. Freeze deploys and capture request IDs, aggregate outcome counts, versions, and timestamps. Do not capture request bodies or repository/chat/source data.
2. Lower analysis/chat concurrency or engage the spend breaker when relevant.
3. Route traffic to the prior immutable artifact without changing browser schemas or clearing site data.
4. Restore the prior environment configuration and verify signing secrets and limiter credentials refer to the intended environment.
5. Run `/api/health` and `/api/readiness`, then fixture-only smoke journeys for local project load, legacy migration visibility, deterministic analysis, pinned read, and explicit provider error handling.
6. Confirm the rolled-back server ignores unknown V2 browser data safely and leaves it intact for a later forward recovery.
7. Monitor readiness, 5xx, quota, storage/migration, and crash-free signals for at least 30 minutes.

## Forward recovery

Prepare a new artifact from the last known-good commit plus the narrowly scoped fix. Re-run migration and rollback drills before restoring V2 flags. Never repair browser data by destructive blanket deletion.

