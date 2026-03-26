# Make Agent-Mode Diagram Requests Transactional and Grounded

## Summary
- The current agent stack is not fail-closed: explicit draw/edit requests in `src/lib/chat-agent.ts` can still fall through to a normal assistant answer when no canvas write succeeded.
- File grounding is weak in `src/app/api/chat/route.ts`: the server only resolves exact or case-insensitive paths, so a basename request like `iraq-ascii.html` is guessy unless the full path is already known.
- Read context is truncated in the wrong way in `src/lib/chat-tools.ts` and `src/lib/ai.ts`: large files keep only the front of the file, which is especially bad for single-file HTML pages where the real behavior often sits in bottom `<script>` blocks.
- The planner/fallback path relies on prompt-only JSON compliance instead of enforced structured output, so a model can degrade into prose/mermaid and the system silently accepts that failure.
- Chat context can go stale after agent writes because `src/components/sidebar/EnhancedChatbot.tsx` prefers `syncedCanvasContext` over live canvas even when the canvas has changed since the last manual sync.

## Key Changes
- Treat write-intent turns as transactional mutation turns.
- In `streamChatResponse`, if a turn requires canvas mutation and planner + repair/fallback produce zero successful writes, emit a clear failure event and stop. Do not generate a normal final assistant explanation for that turn.
- After successful agent writes, generate the final user-visible reply from deterministic operation summaries instead of another open-ended LLM pass.
- Pass the active project’s blob paths to `/api/chat` as `availableFiles`, and upgrade the read resolver to support exact match, case-insensitive match, unique basename, and unique suffix/contains match.
- If file resolution is ambiguous, return candidates and fail explicitly instead of guessing.
- Replace prefix-only file truncation with file-type-aware read summaries.
- For `.html`, include title, key DOM ids/classes, inline `<script>` blocks, event-listener hints, and head+tail excerpts.
- For JS/TS, include exports, function/class signatures, and head+tail excerpts.
- Extend the planner/fallback LLM calls with structured JSON mode where supported; keep the existing parser as last-resort salvage, not the primary path.
- Add a single repair pass that converts invalid model output into write-plan JSON before failing the turn.
- Change chat context selection so live canvas is used whenever the canvas is newer than the last synced snapshot.
- Batch agent-applied write events into one history transaction so a generated flowchart is one undo step.
- Add canvasLastModifiedAt timestamp tracking in page.tsx or a new useLiveCanvasMetadata hook.
- Cap availableFiles at 2000 entries, sourced from project fileTree.
- For ambiguous file resolution, return candidates to the agent in the tool result and let it re-issue with a specific path.

## Interface Changes
- `/api/chat` request payload adds `availableFiles: string[]`.
- The read tool result adds `resolutionStrategy`, `resolvedPath`, and optional `candidates` for ambiguous filenames.
- The internal LLM chat input adds an optional structured-output flag for non-streaming planner/fallback calls.
- Agent-mode final responses for write-intent turns become system-generated success/failure summaries, not free-form fallback explanations.

## Test Plan
- Add a regression test for write-intent detection on: `draw a detailed flowchart of how iraq-ascii.html works`.
- Add resolver tests for exact path, basename match, ambiguous basename, and missing file cases.
- Add read-summary tests proving large HTML keeps bottom-script context instead of only the file prefix.
- Add `streamChatResponse` tests proving write-required turns fail explicitly when no writes are applied.
- Add `streamChatResponse` tests proving successful write plans emit canvas operations and a deterministic final summary.
- Add UI/request-construction coverage proving chat uses live canvas when it is newer than the last synced snapshot.

## Assumptions
- Keep the existing `ask` vs `agent` mode split.
- Keep the existing canvas write schema (`write` and `write_batch`) rather than redesigning React Flow data contracts.
- Fail-explicit behavior applies only to turns that are detected as requiring canvas mutation; normal ask-mode or read-only turns remain conversational.
- Manual sync remains a user feature, but stale synced snapshots must no longer override newer live canvas state for chat requests.
- Undo batching is a follow-up enhancement, not blocking for the transactional write behavior.
- Structured output support is provider-dependent; OpenAI/DeepSeek yes, Anthropic no.