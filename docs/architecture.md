# Rassam architecture

Rassam keeps a human-owned architecture contract (`.rassam/blueprint.json`) in the repository, answers agents' questions about it over MCP, and checks every change against it. One isomorphic engine powers every surface.

```
                 .rassam/blueprint.json  (human-owned contract, versioned with the code)
                            │
                ┌───────────┴────────────┐
                │   src/blueprint/ engine │  isomorphic: format · import graph · rules ·
                │                         │  gate · reach · reports (only depends on zod)
                └──┬───────┬────────┬─────┘
                   │       │        │
     src/cli/ (Node host)  │   Studio (browser + Next.js routes)
     ├─ rassam check ──────┼── GitHub Action (action.yml → action/dist/rassam.mjs)
     ├─ rassam mcp ── agents (Claude Code, Codex, Cursor, Copilot, …)
     └─ init/explain/impact/graph/verify/reach/proposals
                           └── Studio: local folder (File System Access API)
                               or public GitHub repo via POST /api/blueprint
```

## Trust boundaries

- Repository content, pull requests, agent output and browser requests are untrusted.
- A change is judged by the **base** blueprint: a pull request cannot relax the contract it is checked against. Weakening edits require a human approval label. Invariant commands are read only from the base blueprint.
- Agents never edit the contract directly: `propose_change` and `report_conflict` write files under `.rassam/proposals/` and `.rassam/escalations/` for humans.
- Secrets are never printed; reach analysis reports redacted previews.
- Public repository identity and commit are bound by a signed source grant; GitHub and provider credentials stay server-side.

## Gate flow (`rassam check --base <ref>`)

1. Resolve the merge-base; collect changed files (working tree vs merge-base, plus untracked files), base versions of changed files, commits, and the base blueprint.
2. Build the observed file graph for head and reconstructed base snapshots (static import analysis with `file:line` evidence).
3. Assign files to components with the judging (base) blueprint and evaluate rules and policy on both snapshots; findings present only at head are new.
4. Add tripwire hits, verification-weakening signals, the semantic contract diff, reach findings, stale sign-offs and invariants in scope.
5. Score findings by severity, novelty, blast radius and kind; render text, a sticky PR comment, annotations, JSON or SARIF; exit non-zero only for new findings at or above `--fail-on`.

## Studio

The web app is one screen at `/` plus a settings page.

- **Studio** (`src/components/studio/`, `src/components/blueprint/`, `src/hooks/useBlueprint.ts`, `src/lib/blueprint-client/`) loads a blueprint (or derives a draft) for a local folder or a public GitHub repository, re-evaluates edits instantly from a serialized file graph, and shows a health pill, a ranked attention list and the live system design. People say what they want changed in the intent bar; every change is a previewed proposal before it is applied, and can be undone. Manual editors for components, rules, intent and reach sit behind progressive disclosure. Local folders are saved back into the repository; GitHub projects are downloaded as `blueprint.json`.
- **Server routes** (`src/app/api/`): `/api/blueprint/open` resolves a public repository to a pinned commit and issues a signed source grant, `/api/blueprint` builds the snapshot for that grant, `/api/blueprint/commits` powers the commit timeline and live watch, `/api/blueprint/edit` turns an instruction into typed edits (deterministic parser first, the explicitly selected model only when the parser does not understand), `/api/live/{owner}/{repo}/…` serves the live badge and system-design SVGs, `/api/settings/models` reports provider configuration, and `/api/health` and `/api/readiness` are probes.
- **Settings** (`/settings`) chooses the provider and model used by the optional model path of the intent bar. Keys are read from the server environment only.

See `docs/blueprint-spec.md` for the format and gate semantics, `docs/getting-started.md` for setup, `docs/support.md` for the supported envelope and `docs/privacy.md` for the data flow.
