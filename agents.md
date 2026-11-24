# Rassam - Agent Guide

Read this before making changes. Rassam is checked against its own architecture contract, `.rassam/blueprint.json`. If you are a coding agent, the `rassam` MCP server in `.mcp.json` answers the questions below for you: call `explain_path` before editing a file, `check_dependency` before adding an import, `check_changes` before you finish, and `report_conflict` instead of weakening a test, a check or the blueprint.

## Project Overview

**Rassam** is the architecture contract for agent-built software. It has four parts that share one isomorphic engine:

1. **The blueprint** (`.rassam/blueprint.json`, spec in `docs/blueprint-spec.md`, schema in `src/blueprint/schema.ts`): components and the files they own, human-written intent, declared dependencies, rules, invariants, decisions and sign-offs.
2. **The engine** (`src/blueprint/`): import graph, component membership, rule evaluation, the change gate, reach analysis and report rendering. It must stay isomorphic: no `node:` imports, no DOM, no React/Next, no imports from the rest of the app. Only `zod`.
3. **The Node host** (`src/cli/`): the `rassam` CLI, git and GitHub Actions integration, and the dual-era MCP server. Bundled to `action/dist/rassam.mjs` (`npm run build:cli`; CI checks the bundle is fresh). The same bundle is the npm package `@v0ightt/rassam` (`packages/rassam/`, staged by `npm run pack:cli`, published only by `.github/workflows/release.yml` on a version tag; see `docs/releasing.md`). `PACKAGE_NAME` and `ENGINE_VERSION` in `src/blueprint/constants.ts` must match the package manifest (a test enforces it).
4. **The Studio** (Next.js app at `/`): one screen that answers "is the project on track?" for a local folder or a public GitHub repository (`src/components/studio/`, `src/components/blueprint/`, `src/components/ui/`, `src/hooks/useBlueprint.ts`, `src/lib/blueprint-client/`, `src/lib/blueprint-intent/`, `src/app/api/blueprint/**`, `src/app/api/live/**`), plus a settings page for the optional model.

### Engine module map (`src/blueprint/`)

| Module | Responsibility |
| --- | --- |
| `schema.ts` | Blueprint v0.1 zod schema, parse/validate/serialize, JSON Schema |
| `types.ts`, `constants.ts` | Shared engine types; ignore globs, test patterns, built-in tripwires |
| `glob.ts`, `paths.ts`, `util.ts` | Isomorphic glob matcher, POSIX paths, hashing |
| `imports.ts` | Multi-language import extraction and resolution → `FileGraph` |
| `env.ts`, `reach.ts` | Env/secret reads; agent configs, MCP servers, permissions, inline secrets |
| `selectors.ts`, `graph.ts` | Selector grammar; component membership, component graph, cycles |
| `rules.ts`, `stats.ts`, `impact.ts` | Rule and policy evaluation; human-authored ratio; blast radius |
| `diff.ts`, `blueprint-diff.ts`, `agents.ts` | Unified diff parsing, tripwires, verification-weakening heuristics; semantic contract diff; agent authorship |
| `check.ts` | `runCheck`: full and diff mode, base-contract judging, new-vs-existing, scoring |
| `workspace.ts` | Query layer for MCP/CLI/canvas: `explainPath`, `checkDependency`, `impact`, `componentSummary`, `overview`, `graphView` (cards with finding counts and worst severity; a dependency cycle is reported once in `cycles` and on its edges, never as a badge on every member) |
| `derive.ts`, `verify.ts`, `snapshot.ts` | Draft blueprints (`rassam init`); sign-off stamps; compact graph transport |
| `prose.ts` | The contract as plain-language rules for `AGENTS.md` (the block between `<!-- rassam:agents:start -->` and `<!-- rassam:agents:end -->`); pure and deterministic, so a stale block is found by regenerating it |
| `report.ts` | Text, Markdown sticky comment, SARIF, GitHub annotations, JSON, Mermaid, DOT |

### Node host map (`src/cli/`)

| Module | Responsibility |
| --- | --- |
| `main.ts`, `args.ts`, `io.ts` | Dispatch, flags and help, process seams (`Io.ask` exists only in an interactive terminal; commands must work without it) |
| `commands/init.ts` | Draft the blueprint, report drafted rules the code already breaks ("existed before the contract did"), then offer the wiring below |
| `agent-files.ts` | Idempotent writers for `.mcp.json`, the `AGENTS.md` block, the `CLAUDE.md` pointer and `.github/workflows/rassam.yml`; never touch text outside their markers or overwrite a person's own settings |
| `commands/instructions.ts` | `rassam instructions` (`--write`, `--check`): keep the `AGENTS.md` block in step with the contract |
| `gate.ts`, `commands/check.ts` | Assemble the change (git, merge-base, base blueprint) and run the engine; `check` also notes a stale `AGENTS.md` block |
| `mcp/` | The MCP server and its tools |

### Non-negotiable behaviors

- A change is judged by the **base** blueprint. Contract-weakening edits are errors until a human applies the approval label. Invariant commands run only from the base blueprint.
- Under the default `policy.verificationWeakening: "require-approval"`, the strong verification-weakening signals (skipped or focused tests, removed or trivialized assertions, deleted test files, lowered or removed coverage thresholds, forced success exits; the split is `WEAKENING_SIGNALS` in `diff.ts`) are errors until a human applies the same label. Weak signals and the generic test tripwire stay warnings, and no negative case in `bench/gate` may fail.
- Only **new** violations fail a change; fingerprints must stay stable (no line numbers in fingerprints).
- Static analysis is the only source of dependency edges. LLM output never becomes a blueprint fact without human acceptance, and agent proposals go to `.rassam/proposals/`, never into `blueprint.json`.
- Secrets are never printed: reports carry redacted previews only.

### Working on the blueprint itself

- Changes to architecture should be reflected in `.rassam/blueprint.json` in the same change (new components, paths, declared dependencies). Run `npm run rassam -- check` (full) and `npm run rassam -- check --base main` (as CI does).
- Edits that weaken rules need a human-approved label on the PR. Do not loosen a rule to make your change pass; use `report_conflict` and explain.

---

# The Studio (web app)

## Tech stack

-   **Framework**: Next.js 16 (App Router), React 19, TypeScript
-   **Styling**: Tailwind CSS v4 with design tokens in `src/app/globals.css` (dark and light themes, iris accent)
-   **Canvas**: React Flow, with dagre for components that have no saved position
-   **Browser storage**: Dexie (IndexedDB database `rassam-blueprints`) for drafts, layout and folder handles; localStorage for preferences
-   **GitHub**: Octokit, public repositories only, always at a pinned commit
-   **AI (optional)**: provider adapters for DeepSeek, OpenAI, Anthropic, Google and Ollama, used only by "tell Rassam what to change" when the built-in parser does not understand a request

## How a session flows

1.  **Open a source** (`StartScreen.tsx`, `useSourceActions.ts`): paste a GitHub URL, open a local folder, or try the bundled sample (`sample.ts`).
    -   GitHub: `POST /api/blueprint/open` resolves the repository to a pinned commit and returns a signed source grant; `POST /api/blueprint` downloads that commit, builds the engine's file graph and returns a compact snapshot plus the repository's `.rassam/blueprint.json` (or nothing, and the browser derives a draft).
    -   Local folder: `src/lib/blueprint-client/local-folder.ts` reads the folder through the File System Access API; analysis runs in `src/workers/blueprint-analysis.worker.ts`. Files never leave the machine.
2.  **Check** (`src/hooks/useBlueprint.ts`): the hook owns the session. It runs the engine against the draft on every edit, so findings, health and reach update instantly.
3.  **Read** (`Studio.tsx`): five persistent elements only: source pill, health pill, canvas, intent bar, zoom cluster. Sheets (`AttentionSheet.tsx`, `SourceSheet.tsx`) and the inspector open on demand.
4.  **Change**: the intent bar parses the sentence in the browser with the deterministic parser (`src/blueprint/intent.ts`). Only when the parser does not understand, and a model is selected in Settings, `POST /api/blueprint/edit` asks that exact provider and model (`src/lib/blueprint-intent/`: prompt building, tolerant JSON extraction, schema validation, dry run). Every change becomes a **proposal** drawn on the canvas (`ProposalCard.tsx`); nothing touches the draft until the person applies it, and every applied change is one undo step.
5.  **Save**: local folders are written back into the repository (`.rassam/blueprint.json`, layout in a separate file); GitHub projects download the file.
6.  **Stay live**: `POST /api/blueprint/commits` feeds the commit timeline and the optional watch; `/api/live/{owner}/{repo}/badge.svg` and `system.svg` serve the README badge and diagram.

## Key directories and files

### `src/app`
-   `page.tsx`: mounts the Studio client-side. Thin wiring only.
-   `settings/page.tsx`: provider and model selection for the optional model path. Reads `GET /api/settings/models`; "Test model" posts the exact selection.
-   `layout.tsx`, `globals.css`: fonts, theme boot script, design tokens.
-   `api/blueprint/**`: `open`, the snapshot route, `commits`, `edit`. `api/live/**`: badge and system-design SVGs. `api/settings/models`, `api/health`, `api/readiness`.
-   Every route validates its body with zod (`src/lib/api-request.ts`, `src/lib/contracts.ts`), goes through `guardApiRequest` in `src/lib/request-security.ts`, and answers errors with the JSON envelope from `src/lib/api-error.ts`.

### `src/components`
-   `studio/`: the screen itself (see the flow above). `commands.ts` is the ">" command list of the intent bar; `health.ts` and `proposal.ts` are pure helpers.
-   `blueprint/`: the canvas (`BlueprintCanvas.tsx`, `BlueprintNode.tsx`, `BlueprintEdge.tsx`, `useBlueprintCanvas.ts`), the inspector, and the manual editors behind progressive disclosure (`ComponentsTab`, `RulesTab`, `IntentTab`, `ReachTab`, `AttentionTab`). `kinds.ts` maps well-known component kinds to an icon and colour. `session.ts` is the contract these components code against; `useBlueprint` implements it.
-   `ui/`: the design system (buttons, sheets, popovers, pills, status glyphs, toasts, theme). It depends on nothing else in the app. Status is never shown by colour alone.

### `src/hooks`
-   `useBlueprint.ts`: session state: source, draft, history, proposals, receipts, live status, sync.

### `src/lib`
-   `blueprint-client/`: browser host for the engine (API clients, local folder access, drafts, layout, worker bridge).
-   `blueprint-intent/`: prompt and answer handling for the model path. Pure text in, typed edits out; it never calls a provider.
-   `github.ts`, `source-grant.ts`: the only code that talks to GitHub and holds `GITHUB_TOKEN`; signed grants bind repository and commit.
-   `llm/`: provider catalog, registry and adapters. `chat-runtime.ts` resolves exactly the requested provider and model, with no silent fallback.
-   `model-settings.ts`: the saved provider/model choice in localStorage. No credentials.
-   `request-security.ts`, `api-error.ts`, `api-request.ts`, `operational-telemetry.ts`, `src/proxy.ts`: rate limits, sessions, origin checks, error envelope, privacy-bounded telemetry.

## Common tasks

### Teaching the intent bar a new sentence
-   Add the phrase to the deterministic parser in `src/blueprint/intent.ts` and its tests. Prefer this over prompt changes: the common commands must work with no model.
-   A new edit operation goes into `src/blueprint/edits.ts`; keep `EDIT_OP_CATALOGUE` in `src/lib/blueprint-intent/prompt.ts` in step (a test enforces it).

### Adding a component kind
-   Add the icon and colour to `src/components/blueprint/kinds.ts`. Kinds are free-form slugs; unknown ones fall back to the default.

### Adding an LLM provider
1.  If OpenAI-compatible: extend `OpenAICompatibleAdapter` from `src/lib/llm/providers/OpenAICompatibleAdapter.ts`. Override only `providerId`, `defaultModel`, `apiKey`, and `baseURL`.
2.  Otherwise implement the `LLMProvider` interface from `src/lib/llm/types.ts` directly (see `AnthropicAdapter.ts`).
3.  Register the adapter in `src/lib/llm/registry.ts` and add its metadata to `src/lib/llm/catalog.ts`.

### Adding an API route
-   Validate the body with zod, call `guardApiRequest` with a quota scope, return errors through `toSafeApiError`, and add the route under the `api` component's rules (it already owns `src/app/api/**`).

## Environment Variables
Ensure these are set in `.env.local` for local development:
-   `DEEPSEEK_API_KEY`: Required when using the DeepSeek provider.
-   `OPENAI_API_KEY`: Required when using the OpenAI provider.
-   `ANTHROPIC_API_KEY`: Required when using the Anthropic provider.
-   `GOOGLE_API_KEY`: Required when using the Google provider.
-   `OLLAMA_BASE_URL`: Optional, defaults to `http://localhost:11434/v1`.
-   `OLLAMA_API_KEY`: Optional; set only when the Ollama endpoint requires it.
-   `GITHUB_TOKEN`: Recommended to avoid rate limits when opening repositories. Hosted deployments must use a public-repository-only token.
-   `SOURCE_GRANT_SECRET`, `SESSION_SIGNING_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: required by the public production profile (see `docs/deployment.md`).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
