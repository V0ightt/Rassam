# Runbook: dependency vulnerability response

## Triage

1. Confirm the advisory from the package manager audit, dependency review, CodeQL, or the upstream maintainer.
2. Determine whether the vulnerable code is direct/transitive, production/development, reachable, and exploitable in Rassam’s deployment profile.
3. Treat high/critical exploitable findings, credential exposure, authorization bypass, source-grant bypass, and browser data-loss defects as release blockers.
4. Do not paste secrets, source, user exports, or private incident material into public issues.

## Remediate

1. Prefer the smallest patched compatible version and authoritative upstream migration guidance.
2. Update the lockfile with a clean install. Do not use blanket force upgrades without reviewing breaking changes.
3. Run lint, typecheck, unit/integration/E2E, production build, bundle budget, dependency review, and the relevant security regression suite.
4. Revalidate security headers, origin/session enforcement, source grants, quotas, migration fixtures, and pinned reads when their dependency surface changes.
5. Document the advisory, reachability decision, patch, tests, and any temporary mitigation in the private incident record and changelog as appropriate.

## Emergency exception

If no patch exists, disable the reachable feature or roll back to a non-vulnerable artifact. Any temporary risk acceptance requires an owner, rationale, compensating control, and expiry before release; 1.0 ships with no high/critical exploitable finding.

