# Rassam export formats

Rassam 1.x reads two versioned JSON formats. Both are local downloads; exporting does not upload project data.

## Graph export

`rassam.graph` with `schemaVersion: 2` is the portable diagram format. It contains:

- the Rassam application version and generation timestamp;
- non-secret project identity and source type;
- repository owner, name, requested ref, pinned commit, tree, and immutable snapshot when available;
- graph revision, layout direction, nodes, edges, and source evidence;
- analysis coverage, analyzer metadata, and warnings.

It deliberately excludes chat sessions, cached source content, source grants, and provider credentials. Import creates fresh node and edge UUIDs to avoid collisions while retaining edge relationships and evidence.

## Project backup

`rassam.project-backup` with `schemaVersion: 2` adds project file-tree metadata. Cached source and credentials are always excluded. Chat sessions are excluded by default and are added only through the separately confirmed **Backup with chats…** action. The confirmation warns that chat text may contain source excerpts or other sensitive information.

Restoring a backup creates a new local project and fresh project, chat-session, message, node, and edge identifiers. It does not overwrite an existing project.

## Compatibility and validation

Imports validate field sizes, enum values, finite coordinates, UUID uniqueness, and edge endpoints before creating a project. Corrupt v2 documents fail as a unit. The legacy pre-1.0 shape using `metadata.version: "1.0"` plus top-level `nodes` and `edges` remains supported; legacy identifiers are migrated to UUIDs and dangling legacy edges are omitted as in the earlier importer.

The `appVersion` remains `0.3.0` until all 1.0 release criteria pass. `schemaVersion` identifies the data contract and is independent of the application release number.
