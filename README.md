>[!NOTE]
>Rassam is under active development and has not reached 1.0. The blueprint format is versioned (`0.1`) and may gain fields; existing files stay valid within a version.

>[!Tip]
>Why Rassam? Rassam (رسّام) means "painter" in Arabic. It used to paint portraits of code. Now it paints the blueprint that code is checked against.

# Rassam

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/fFtMjNQTFJ)
[![Website](https://img.shields.io/badge/Website-rassam.dev-blue?style=for-the-badge&logo=google-chrome&logoColor=white)](https://rassam.dev)
![AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=for-the-badge)

**The architecture contract for agent-built software.** Rassam keeps a human-owned blueprint of your system in the repository, gives coding agents a way to ask it what they may do before they act, and checks every change against it in CI.

<div align="center">
  <a href="https://rassam.dev" target="_blank"><img src="./public/logo.png" alt="Rassam logo" width="180" height="180" /></a>
</div>

## Why

Coding agents now start a large and fast-growing share of pull requests, and the measured bottleneck has moved from writing code to verifying it. Repository-to-diagram tools are free everywhere, so a picture of your code is no longer scarce. What stays scarce as models improve is what a model cannot infer from the code: **what the system is supposed to be, what each part may depend on and reach, and who approved it.**

Rassam captures exactly that, enforces it mechanically, and spends human attention only on a short, ranked list of exceptions. The evidence behind this direction is in [`reports/Rassam pivot for the AGI era.md`](reports/Rassam%20pivot%20for%20the%20AGI%20era.md).

## What you get

| Piece | What it does |
| --- | --- |
| **Blueprint** — `.rassam/blueprint.json` | An open, versioned JSON contract: components and the files they own, intent written by people, declared dependencies, rules (`forbid`, `allow-only`, `layers`, `no-cycles`, `protect`, `secret-access`), invariants, decisions, and human sign-offs. [Spec](docs/blueprint-spec.md) · [JSON Schema](schema/blueprint-0.1.schema.json) |
| **Gate** — `rassam check` + GitHub Action | Re-derives the import graph from source, judges a change **by the base branch's blueprint** (a PR cannot relax its own rules), fails only on *new* violations, flags contract-weakening edits, tests or CI being weakened, and changes to agent permissions or committed credentials. Output as text, a sticky PR comment, annotations, JSON or SARIF. |
| **MCP server** — `rassam mcp` | Lets Claude Code, Codex, Cursor, Copilot and others ask before acting: `explain_path`, `check_dependency`, `impact`, `check_changes`, and a sanctioned `report_conflict` instead of quietly weakening a test. Supports MCP 2025-11-25 and the stateless 2026-07-28 protocol. |
| **Canvas** — the web app | Open a local folder (Chromium) or a public GitHub repo, see declared vs. observed dependencies, write intent, draw a forbidden edge, sign off, and save the blueprint straight back into your repository. |
| **Reach map** | What agents can touch: MCP servers and the credentials they receive, broad permission grants, secrets committed in agent configs, and which components read which environment variables. |

## Quickstart

```bash
npm install
npx tsx src/cli/index.ts init          # draft a blueprint from your code (all facts marked "derived")
# open .rassam/blueprint.json: write intent, add a rule or two
npx tsx src/cli/index.ts check         # full check of the working tree
npx tsx src/cli/index.ts check --base main   # judge your branch the way CI will
```

The bundled single-file CLI lives at `action/dist/rassam.mjs` (`node action/dist/rassam.mjs check`). See [docs/getting-started.md](docs/getting-started.md) for wiring the GitHub Action and connecting the MCP server to your agents.

A minimal blueprint:

```json
{
  "$schema": "https://rassam.dev/schema/blueprint-0.1.json",
  "version": "0.1",
  "system": { "name": "Shop" },
  "components": [
    { "id": "ui", "name": "Storefront", "kind": "component", "paths": ["src/ui/**"],
      "intent": "Renders the shop. Never touches storage directly." },
    { "id": "db", "name": "Database access", "kind": "database", "paths": ["src/db/**"] },
    { "id": "payments", "name": "Payments", "kind": "service", "paths": ["src/payments/**"] }
  ],
  "rules": [
    { "id": "ui-no-db", "kind": "forbid", "from": "ui", "to": "db",
      "reason": "The UI reaches data only through the domain layer." },
    { "id": "stripe-key", "kind": "secret-access", "secrets": ["STRIPE_*"], "allow": "payments" }
  ]
}
```

## How the gate thinks

- **Judged by the base contract.** In a pull request, rules come from the merge-base blueprint. Edits to the blueprint itself are diffed semantically; anything that loosens it (a removed rule, a narrowed forbid, a lowered severity, a new ignore glob) is an error until a human applies the approval label (`rassam:approved` by default).
- **Only new violations fail.** Pre-existing violations are reported, collapsed, so you can adopt Rassam on a legacy codebase without a wall of red.
- **The checks are protected.** Documented reward hacks by coding agents attack the checks themselves, so changes to tests, CI, lockfiles, agent configuration and the blueprint always surface, and heuristics flag skipped or focused tests, removed or trivialized assertions, forced `exit(0)`, new suppressions, weakened CI steps and lowered coverage thresholds.
- **A small attention budget.** Findings are scored by severity, novelty, blast radius and kind; the top few go first. Every finding cites `file:line` evidence.
- **Humans stay authors, not rubber stamps.** Each blueprint fact records whether a person asserted it, it was derived from code, or an agent proposed it; the report shows the human-authored share. Agent proposals land in `.rassam/proposals/` and never edit the contract directly.

## The web app

```bash
npm install
npm run dev     # http://localhost:3000
```

Open a local folder from the start screen (Chrome/Edge) to edit `.rassam/blueprint.json` in place, or analyze a public GitHub repository. Optional `.env.local` keys: `GITHUB_TOKEN` (rate limits), and `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_API_KEY` for the Rassam chat assistant and optional AI enrichment. See [docs/deployment.md](docs/deployment.md) for server settings.

The original map workspace (evidence-linked architecture map, file explorer, editor tabs, and the ask/agent chat that proposes validated canvas patches) is still available under the **Map** view.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/blueprint/` | The isomorphic engine: format, import graph (TS/JS, Python, Go, Java/Kotlin, Rust, C/C++, Ruby), rules, gate, reach, reports |
| `src/cli/` | `rassam` CLI, git and GitHub Actions integration, MCP server |
| `src/components/blueprint/`, `src/hooks/useBlueprint.ts`, `src/lib/blueprint-client/` | Blueprint canvas, data layer, local-folder access |
| `src/app/`, `src/components/`, `src/lib/` | The Next.js workbench and its server routes |
| `action.yml`, `action/dist/` | The GitHub Action and its bundled CLI |
| `.rassam/blueprint.json` | Rassam's own contract; Rassam is checked against it |

## Development

```bash
npm test              # vitest
npm run typecheck
npm run lint
npm run build         # Next.js production build
npm run build:cli     # rebuild action/dist/rassam.mjs (CI checks it is fresh)
npm run rassam -- check --base main
```

Read [`agents.md`](agents.md) before architectural changes. If you are a coding agent working on this repository, use the `rassam` MCP server configured in `.mcp.json`.

## Thanks and contact

- **GitHub Student Pack** for the Student Developer Pack.
- **Anthropic**: this project is built with Claude.
- Discord `v0ight_` · [LinkedIn](https://www.linkedin.com/in/momen-saeb-b88183283/) · `contact@rassam.dev`
