# Changelog

All notable changes are documented here. Rassam follows Semantic Versioning once 1.0.0 is released.

## Unreleased

### Added

- **Rassam Blueprint** (format v0.1): an open, human-owned architecture contract at `.rassam/blueprint.json` with components, intent, declared dependencies, six rule kinds (`forbid`, `allow-only`, `layers`, `no-cycles`, `protect`, `secret-access`), invariants, decisions, provenance and human sign-offs. Spec in `docs/blueprint-spec.md`, JSON Schema in `schema/`.
- An isomorphic engine (`src/blueprint/`) with multi-language import analysis (TypeScript/JavaScript, Python, Go, Java/Kotlin, Rust, C/C++, Ruby), rule evaluation, blast radius, and reach analysis of agent configs, MCP servers, permissions, committed credentials and secret reads.
- A change gate that judges pull requests by the base blueprint, fails only on new violations, diffs the contract semantically (weakening edits need human approval), protects tests/CI/agent configs with tripwires, and detects weakened verification (skipped or focused tests, removed or trivialized assertions, forced exit(0), suppressions, CI and coverage weakening).
- The `rassam` CLI (`init`, `check`, `explain`, `impact`, `graph`, `verify`, `reach`, `proposals`, `schema`, `mcp`), a composite GitHub Action with a sticky PR comment, annotations and SARIF, and a dual-era MCP server (2025-11-25 and 2026-07-28) for coding agents.
- A Blueprint view in the workbench for local folders (File System Access API, saves into the repository) and public GitHub projects (`POST /api/blueprint`).
- Rassam's own blueprint; the repository is checked against it.

- Versioned release-quality, security, and browser-test tooling.
- Work toward revision-pinned repository analysis, durable local projects, evidence-linked navigation, and atomic AI proposals.

### Changed

- The map analyzer now uses the engine's import graph, so the map and the gate agree on every edge.
- Moved the editor tab model to `src/lib/editor-tabs.ts`, removing a hooks ↔ components dependency cycle found by the gate.

- The 1.0 release is scoped to public GitHub.com repositories and local browser persistence.

## 0.3.0

- Added multi-project workflows, file exploration and caching, editor tabs, multi-session chat, ask/agent modes, streamed tool activity, canvas editing, history, clipboard operations, and model settings.
