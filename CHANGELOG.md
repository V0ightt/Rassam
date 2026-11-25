# Changelog

All notable changes are documented here. Rassam follows Semantic Versioning once 1.0.0 is released.

## Unreleased

### Fixed

- A small repository is no longer drafted as one component. When it has at most 40 source files and its folders name layers (`src/web`, `src/api`, `src/db`), `rassam init` and the Studio make each of those folders a component however few files it holds, so there is something to put a rule between. Larger repositories draft as before.
- The release guide's first manual publish: `--provenance=false`, two-factor authentication without a USB key, and when to approve the waiting deployment.

## 0.4.0 (2026-11-25)

### Added

- **Rassam Blueprint** (format v0.1): an open, human-owned architecture contract at `.rassam/blueprint.json` with components, intent, declared dependencies, six rule kinds (`forbid`, `allow-only`, `layers`, `no-cycles`, `protect`, `secret-access`), invariants, decisions, provenance and human sign-offs. Spec in `docs/blueprint-spec.md`, JSON Schema in `schema/`.
- An isomorphic engine (`src/blueprint/`) with multi-language import analysis (TypeScript/JavaScript, Python, Go, Java/Kotlin, Rust, C/C++, Ruby), rule evaluation, blast radius, and reach analysis of agent configs, MCP servers, permissions, committed credentials and secret reads.
- A change gate that judges pull requests by the base blueprint, fails only on new violations, diffs the contract semantically (weakening edits need human approval), protects tests/CI/agent configs with tripwires, and detects weakened verification (skipped or focused tests, removed or trivialized assertions, forced exit(0), suppressions, CI and coverage weakening).
- The `rassam` CLI (`init`, `check`, `explain`, `impact`, `graph`, `verify`, `reach`, `proposals`, `schema`, `mcp`), a composite GitHub Action with a sticky PR comment, annotations and SARIF, and a dual-era MCP server (2025-11-25 and 2026-07-28) for coding agents.
- A Blueprint view for local folders (File System Access API, saves into the repository) and public GitHub projects (`POST /api/blueprint`).
- Rassam's own blueprint; the repository is checked against it.
- **One-command install.** The CLI and MCP server ship as the npm package `@v0ightt/rassam` (`packages/rassam/`): the dependency-free bundle, the JSON Schema, the license and a short README, nothing else. `npm run pack:cli` stages and checks it (bundle present and self-contained, versions and names in step, license equal to the root), CI stages it on every pull request, and `packages/rassam/server.json` describes it for the official MCP Registry (`io.github.V0ightt/rassam`).
- **Release workflow** (`.github/workflows/release.yml`, `docs/releasing.md`): on a `vX.Y.Z` tag it checks the tag against the package version and `ENGINE_VERSION`, runs lint, typecheck and tests, fails on a stale committed bundle, publishes the exact packed tarball with npm trusted publishing (OIDC, provenance, behind the `npm` environment) and creates the GitHub release with the notes from `docs/releases/vX.Y.Z.md`, the tarball, `rassam.mjs` and `SHA256SUMS`. A manual run is a dry run. Third-party actions are pinned to commit SHAs.
- **`rassam init` wires everything.** After drafting the blueprint it offers (asks in a terminal; `--yes`, `--mcp`, `--agents`, `--workflow` and their `--no-` forms elsewhere) to write the pinned MCP server entry in `.mcp.json`, the contract as plain-language rules in `AGENTS.md` with a pointer from `CLAUDE.md`, and `.github/workflows/rassam.yml` with least-privilege permissions. Every write is idempotent and stays inside Rassam's markers; existing settings are kept. With a blueprint already present, `init --yes` only wires it up.
- **`rassam instructions`** (`--write`, `--check`) keeps the `AGENTS.md` block in step with the contract: rules with their reasons, protected paths, where components live, invariants, and the standing orders (never weaken a test or a check; if a task needs a rule broken, stop and report). The prose generator is pure (`src/blueprint/prose.ts`); `rassam check` notes a stale block.
- **`policy.verificationWeakening`** (`"require-approval"` by default, or `"warn"`): skipped or focused tests, removed or trivialized assertions, deleted test files, lowered or removed coverage thresholds and forced success exits are errors until a human applies the approval label, the same mechanism as contract weakening. The other weakening signals and the test tripwire stay warnings. Lowering the setting to `"warn"` is itself a contract weakening. `set_policy` (and so `rassam do` and the Studio's model path) can change it.
- The sticky comment and terminal report have a "Weakened tests and checks" section that says what a human must do; `--approve-label` is named in that advice.
- `CheckInput.preExisting` for hosts that check a blueprint they just drafted: violations are reported as having existed before the contract did, not as new.
- `WorkspaceGraphView.cycles`, `cycle` on edges and a worst `severity` per card.

- Versioned release-quality, security, and browser-test tooling.

### Changed

- **License:** Rassam is now released under the Apache License 2.0 (previously AGPL-3.0-only). Earlier releases keep the license they were published under.
- Contact and security reports go to the maintainer's email in `SECURITY.md`; links to the retired rassam.dev site are gone and the blueprint `$schema` URL now resolves on GitHub.

- The 1.0 release is scoped to public GitHub.com repositories and local browser persistence.
- **Strong test-weakening signals now fail the gate by default** (they were warnings). Set `policy.verificationWeakening: "warn"` to keep the old behaviour. A human approval now also clears a forced success exit (`exit-zero`).
- The weakening detector is more precise, so legitimate refactors do not need approval: assertions moved or split into another test file, folded into a parametrized table, or deleted together with the code they tested, and deleted test helpers, are not treated as weakened tests. Benchmark: 116 labelled cases, 48 of 79 attacks fail (31 before), no legitimate change fails.
- **Better first drafts** from `rassam init` and the Studio: at most 20 components plus Tests, splitting the largest folders first and merging long runs of small sibling folders into `<Folder> (other)`; standard Java, Kotlin and Scala layouts split by package; a Go, Python or Rust root package is code named after the module, not `config`; `benchmarks`, `examples`, `docs`, `scripts` and similar folders are not split per child. On the trial repositories: spring-petclinic 2 → 6 components, hono 29 → 16, excalidraw 39 → 18, documenso's `apps/` split per app.
- **A dependency cycle is shown once**, on its edges (warning colour, dash-dot, "cycle" label) and in the header of the README diagram and the Studio canvas, instead of a red badge on every component in it (12 of 15 cards on documenso). Card badges follow the worst severity: warnings are an outlined amber pill.
- A freshly drafted blueprint opens "On track" in the Studio and `rassam init` says so when the code already breaks a drafted rule: those violations existed before the contract did.
- The README leads with the gate and the 27-run pilot, and adds "Why not just CLAUDE.md, dependency-cruiser or CODEOWNERS?" and "Limitations". The docs pin the Action to a commit SHA or release tag instead of `@main`, with least-privilege permissions.

### Fixed

- A change whose only blueprint edit is non-semantic (the `$schema` line, formatting) no longer puts invariants in scope or marks sign-offs stale.
- `**` inside braces now respects path segments, so the built-in tests tripwire `{**/tests/**,**/test/**,…}` matches root-level and nested `tests/` and `test/` folders, and `{**/Dockerfile,**/*.tf}` matches at any depth.
- The graph view no longer marks an arbitrary pair of a cycle's members as a forbidden edge.

### Removed

- The classic map workspace at `/map` and everything only it used: the workbench shell, map canvas, file explorer and viewer, evidence inspector, chat panel and chat agent, the deterministic map analyzer and its AI enrichment, the local project store with JSON/PNG/SVG export and import, and the `/api/chat`, `/api/files`, `/api/repo` and `/api/source-grant` routes. The Studio at `/` is the product. Projects saved by the classic map stay in the browser's storage but are no longer read.
- The `RASSAM_DAILY_ANALYSIS_LIMIT`, `RASSAM_ANALYSIS_CONCURRENCY`, `RASSAM_DAILY_CHAT_LIMIT` and `RASSAM_CHAT_CONCURRENCY` environment variables, which nothing reads any more.
- Dependencies used only by the classic map: `react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `html-to-image`, `zustand`, `@tanstack/react-virtual`, `@radix-ui/react-dropdown-menu` and `fast-check`.
- `docs/export-format.md`, which documented the removed export formats.
- The blueprint components `workbench-shell`, `workbench-ui`, `chat-agent` and `analysis` (ADR-006).

## 0.3.0

- Added multi-project workflows, file exploration and caching, editor tabs, multi-session chat, ask/agent modes, streamed tool activity, canvas editing, history, clipboard operations, and model settings.
