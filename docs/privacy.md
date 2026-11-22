# Privacy and data flow

## Browser data

The Studio keeps unsaved blueprint drafts, canvas layout and the handle of the last opened local folder in IndexedDB (`rassam-blueprints`). Small preferences (theme, the last opened source, the chosen provider and model) use localStorage. Clearing site data removes this local information.

A local folder is read in the browser through the File System Access API. Its files never leave the machine; the blueprint is written back into the folder only when you save.

## Server processing

The server processes requests transiently and persists nothing. For a public GitHub repository it downloads the pinned commit, builds the import graph and returns the snapshot to the browser. When you ask for a change in words and the built-in parser does not understand it, the instruction and a compact digest of the blueprint (component names, paths, rules) are sent to the provider and model you explicitly selected. Source code is not sent to a model.

## Logging

Logs and metrics must not contain instructions, source content, repository URLs, filenames or credentials. Operational telemetry is limited to request IDs, timings, counts, outcome codes and provider/model identifiers.
