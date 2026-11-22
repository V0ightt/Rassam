# Changelog

All notable changes are documented here. Rassam follows Semantic Versioning once 1.0.0 is released.

## Unreleased

### Added

- **Rassam Blueprint** (format v0.1): an open, human-owned architecture contract at `.rassam/blueprint.json` with components, intent, declared dependencies, six rule kinds (`forbid`, `allow-only`, `layers`, `no-cycles`, `protect`, `secret-access`), invariants, decisions, provenance and human sign-offs. Spec in `docs/blueprint-spec.md`, JSON Schema in `schema/`.
- An isomorphic engine (`src/blueprint/`) with multi-language import analysis (TypeScript/JavaScript, Python, Go, Java/Kotlin, Rust, C/C++, Ruby), rule evaluation, blast radius, and reach analysis of agent configs, MCP servers, permissions, committed credentials and secret reads.
- A change gate that judges pull requests by the base blueprint, fails only on new violations, diffs the contract semantically (weakening edits need human approval), protects tests/CI/agent configs with tripwires, and detects weakened verification (skipped or focused tests, removed or trivialized assertions, forced exit(0), suppressions, CI and coverage weakening).
- The `rassam` CLI (`init`, `check`, `explain`, `impact`, `graph`, `verify`, `reach`, `proposals`, `schema`, `mcp`), a composite GitHub Action with a sticky PR comment, annotations and SARIF, and a dual-era MCP server (2025-11-25 and 2026-07-28) for coding agents.
- A Blueprint view for local folders (File System Access API, saves into the repository) and public GitHub projects (`POST /api/blueprint`).
- Rassam's own blueprint; the repository is checked against it.

- Versioned release-quality, security, and browser-test tooling.

### Changed

- The 1.0 release is scoped to public GitHub.com repositories and local browser persistence.

### Removed

- The classic map workspace at `/map` and everything only it used: the workbench shell, map canvas, file explorer and viewer, evidence inspector, chat panel and chat agent, the deterministic map analyzer and its AI enrichment, the local project store with JSON/PNG/SVG export and import, and the `/api/chat`, `/api/files`, `/api/repo` and `/api/source-grant` routes. The Studio at `/` is the product. Projects saved by the classic map stay in the browser's storage but are no longer read.
- The `RASSAM_DAILY_ANALYSIS_LIMIT`, `RASSAM_ANALYSIS_CONCURRENCY`, `RASSAM_DAILY_CHAT_LIMIT` and `RASSAM_CHAT_CONCURRENCY` environment variables, which nothing reads any more.
- Dependencies used only by the classic map: `react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `html-to-image`, `zustand`, `@tanstack/react-virtual`, `@radix-ui/react-dropdown-menu` and `fast-check`.
- `docs/export-format.md`, which documented the removed export formats.
- The blueprint components `workbench-shell`, `workbench-ui`, `chat-agent` and `analysis` (ADR-006).

## 0.3.0

- Added multi-project workflows, file exploration and caching, editor tabs, multi-session chat, ask/agent modes, streamed tool activity, canvas editing, history, clipboard operations, and model settings.
