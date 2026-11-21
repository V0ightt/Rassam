# Runbook: AI provider outage

## Detect

- `upstream.completed` for one provider shows elevated `unavailable`, `timeout`, or `error` outcomes.
- Chat time-to-first-token or model-validation latency breaches its alert threshold.
- Provider status communication confirms an incident.

## Respond

1. Confirm `/api/health` and `/api/readiness` remain healthy; deterministic repository analysis must remain available without AI.
2. Identify the affected configured provider/model using telemetry identifiers. Never inspect or copy chat/source payloads into an incident channel.
3. Reduce the affected provider’s deployment concurrency or disable its configured models if repeated requests are increasing cost or failure load.
4. Preserve explicit-selection behavior. Do not silently route requests to another provider or model.
5. Publish a user-facing incident note: existing local projects are safe; AI enrichment/chat for the selected provider may fail; users may deliberately choose another configured provider or continue without AI.

## Recover

1. Use the user-triggered exact-model test with a strict spend cap.
2. Observe successful provider events and normal latency for at least 15 minutes.
3. Restore concurrency gradually.
4. Verify ordinary Settings loads make no provider completion and deterministic analysis still succeeds.
5. Record timestamps, affected provider/model, aggregate failure counts, and remediation only—never request content.

