# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## This repository has an architecture contract

Rassam is checked against its own blueprint at `.rassam/blueprint.json` (format: `docs/blueprint-spec.md`). The `rassam` MCP server is configured in `.mcp.json`. Use it:

- `explain_path` before editing a file: who owns it, its intent, the rules that constrain it, whether it is protected.
- `check_dependency` before adding an import across components.
- `check_changes` before you finish, and fix new findings.
- `report_conflict` if the task seems to require breaking a rule. Never weaken a test, a CI step, a coverage threshold or the blueprint to make a change pass.

When you add a component, move files, or create a new cross-component dependency on purpose, update `.rassam/blueprint.json` in the same change (paths, declared dependencies). Edits that loosen rules need a human-approved label on the PR.

## Commands

```bash
npm run dev           # Next.js dev server
npm test              # vitest (all tests)
npx vitest run src/blueprint/engine.test.ts   # a single file
npm run typecheck
npm run lint
npm run build         # production build
npm run build:cli     # rebuild action/dist/rassam.mjs (commit it; CI checks freshness)
npm run rassam -- check                # full check against the blueprint
npm run rassam -- check --base main    # judge the branch the way CI does
npm run blueprint:schema               # regenerate schema/blueprint-0.1.schema.json
```

Tests use **vitest** (`import { describe, it, expect } from "vitest"`); component tests use `// @vitest-environment jsdom` and Testing Library.

## Architecture in one screen

- `src/blueprint/` — the isomorphic engine (format, import graph, rules, gate, reach, reports). No `node:` imports, no DOM, no React/Next, no imports from the rest of the app; only `zod`. Use relative imports inside it.
- `src/cli/` — Node host: `rassam` CLI, git and GitHub Actions integration, the dual-era MCP server. May depend only on the engine, Node built-ins and zod.
- `src/components/blueprint/`, `src/hooks/useBlueprint.ts`, `src/lib/blueprint-client/`, `src/app/api/blueprint/` — the Blueprint view and its data layer (GitHub projects and local folders via the File System Access API).
- `src/app/`, `src/components/`, `src/hooks/`, `src/lib/` — the Next.js workbench (Map view, evidence inspector, chat). Browser code must not import server modules that read credentials (`src/lib/github.ts`, `src/lib/llm/**`, chat agent, request security); type-only imports are fine.

Read `agents.md` before substantial architecture changes, and update `agents.md`, `README.md` and the blueprint when architecture or documented behavior changes.

## Conventions

- Path alias `@/*` → `./src/*` in app code; relative imports inside `src/blueprint` and `src/cli` (they are bundled for the CLI).
- Streaming chat API returns NDJSON; pre-stream errors return the JSON error envelope.
- Requests, repository content and AI output are untrusted. Credentials stay server-side and are never exported or printed; reports show redacted previews only.
- `page.tsx` and `Workbench.tsx` stay thin wiring layers: put logic in hooks and libraries.
- This Next.js version has breaking changes; check `node_modules/next/dist/docs/` before using Next-specific APIs.
