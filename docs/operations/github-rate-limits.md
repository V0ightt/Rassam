# Runbook: GitHub limits or outage

## Detect

- `upstream.completed` for GitHub shows `GITHUB_RATE_LIMITED`, `GITHUB_UNAVAILABLE`, timeouts, or elevated resolve/read latency.
- Analysis coverage jobs stop before a complete tree or pinned source reads fail.
- GitHub rate-limit headers reported by the gateway approach exhaustion.

## Respond

1. Confirm whether the incident is a shared token quota, an unauthenticated GitHub quota, or GitHub availability.
2. Stop retries that would amplify the incident. Keep bounded backoff and return typed, retryable errors.
3. Preserve pinned existing projects and cached source. Never substitute a moving branch head or represent a partial tree as a successful map.
4. If a shared public-only token is exhausted, reduce analysis concurrency. Never replace it with a token that can access private repositories.
5. Communicate the reset window without exposing token details, repository identity, or upstream response bodies.

## Recover

1. Confirm public visibility checks, ref resolution, complete-tree traversal, and pinned blob reads on deterministic fixtures.
2. Verify 403/429 errors map to safe error envelopes and do not leak upstream messages.
3. Restore concurrency gradually and watch GitHub latency/error events for 15 minutes.
4. Re-run one cached unchanged-revision analysis to ensure it avoids unnecessary enrichment work.

