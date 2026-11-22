# Privacy and data flow

## Browser data

Rassam stores project graphs, chat sessions, editor state, and cached public source in IndexedDB. Small preferences and the active project identifier may use localStorage. Clearing site data removes this local information.

## Server processing

The server processes requests transiently. It does not persist project graphs, chats, or cached source. Public repository paths and selected source excerpts are sent to GitHub or the explicitly selected AI provider only when needed for the requested action.

## Exports

Graph exports exclude chat and cached source. A project backup can include chat only after explicit selection. Provider credentials are never exported. Cached source requires a separate opt-in and warning.

## Logging

Logs and metrics must not contain chat text, source content, repository URLs, filenames, credentials, or exported project data. Operational telemetry is limited to request IDs, timings, counts, outcome codes, provider/model identifiers, and aggregate coverage.
