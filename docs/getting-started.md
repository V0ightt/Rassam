# Getting started with Rassam

Five minutes from nothing to a contract that your coding agents read and your pull requests are checked against. The full format is in [blueprint-spec.md](blueprint-spec.md).

## Before you start

You need Node.js 20 or later and a git repository to protect. Rassam is one npm package with no dependencies, [`@v0ightt/rassam`](https://www.npmjs.com/package/@v0ightt/rassam), built from this repository's release workflow and attached to every [GitHub release](https://github.com/V0ightt/Rassam/releases) with its checksum. Nothing to clone.

In this guide, `rassam` is short for `npx @v0ightt/rassam`. In a JavaScript project you can also install it, so the version is pinned in your lockfile and `npx rassam` finds it:

```bash
npm install --save-dev @v0ightt/rassam
```

Run the commands from the root of the repository you want to protect, or pass `--root <dir>`.

## 1. Draft and wire up (1 minute)

```bash
npx @v0ightt/rassam init
```

`init` reads your source tree and drafts `.rassam/blueprint.json` from static analysis: components and the dependencies observed between them, marked `"provenance": { "source": "derived" }`. It describes what the code does today. It does not know what you intended, and that part is yours.

Then it asks before writing each of these. Every file is written idempotently: text outside Rassam's markers and settings you already have are never changed, and running it again changes nothing.

| File | What it does |
| --- | --- |
| `.mcp.json` | Starts the Rassam MCP server for Claude Code and other agents that read `.mcp.json`, pinned to this version |
| `AGENTS.md` | The contract's rules, protected paths and invariants as plain prose, between `<!-- rassam:agents:start -->` and `<!-- rassam:agents:end -->`, plus the standing orders: never weaken a test or a check, and stop and report when a task needs a rule broken |
| `CLAUDE.md` | A short marked block that imports `AGENTS.md`, because Claude Code reads `CLAUDE.md` |
| `.github/workflows/rassam.yml` | The pull request gate (step 5). Not written when another workflow already runs it |

Outside a terminal (CI, an agent running it for you) `init` writes only the blueprint unless you say more: `--yes` for all of them, or pick with `--mcp`, `--agents`, `--workflow` and their `--no-` forms. With a blueprint already in place, `init --yes` skips the draft and only wires up what is missing. Other flags: `--dry-run` prints a draft and writes nothing, `--name "My System"` sets the system name, `--force` replaces an existing blueprint with a fresh draft.

If the code already breaks one of the drafted rules (for example a script that imports a test helper, against "production code must never depend on test code"), `init` says so and counts them. Those violations existed before the contract did: in a pull request only new violations fail, so nobody's change is blamed for them.

Why prose in `AGENTS.md` as well as the MCP server: in a 27-run pilot, rules written as prose steered three models exactly as well as querying the contract did, and almost every agent reads `AGENTS.md`. The gate is what holds when steering fails.

## 2. Write the intent (2 minutes)

Open `.rassam/blueprint.json`. For the two or three components that matter most, fix the name and add an `intent`: what the component is for, and what it must never do. Write what a new engineer would have to be told, because that is exactly what an agent has to be told.

```json
{
  "id": "payments",
  "name": "Payments",
  "kind": "service",
  "intent": "The only code that talks to Stripe or reads Stripe credentials. Exposes charge() and refund(); nothing else calls the Stripe SDK.",
  "paths": ["src/api/payments/**"],
  "provenance": { "source": "human", "by": "Your Name", "at": "2026-11-21" }
}
```

Change `provenance.source` to `human` on what you write or rewrite. If components overlap, the more specific glob wins; set `priority` to override.

## 3. Add two rules (1 minute)

Rules turn intent into something the gate can enforce. Add these to the `rules` array, with your own component IDs, or say them in words: `rassam do "forbid web from importing db because all data access goes through the API" --write`.

A boundary: the UI never reaches the data layer.

```json
{
  "id": "ui-never-touches-data",
  "kind": "forbid",
  "from": "web",
  "to": ["db", "package:pg"],
  "severity": "error",
  "reason": "All data access goes through the API so authorization is enforced in one place."
}
```

A secret boundary: only one component may read the payment keys.

```json
{
  "id": "stripe-keys-stay-in-payments",
  "kind": "secret-access",
  "secrets": ["STRIPE_*"],
  "allow": "payments",
  "severity": "error",
  "reason": "Keeps card-processing credentials out of every other module."
}
```

Always write the `reason`. It is shown to the agent and to the reviewer with every violation, and it is what stops an agent from "fixing" the violation by arguing with the rule. The other rule kinds (`allow-only`, `layers`, `no-cycles`, `protect`) are in the [spec](blueprint-spec.md#45-rules).

The rules in `AGENTS.md` are generated from the blueprint, so refresh them whenever the contract changes:

```bash
rassam instructions --write   # rewrite the block in AGENTS.md
rassam instructions --check   # exit 1 when it is out of date (for CI or a pre-commit hook)
```

`rassam check` also prints a note when the block has fallen behind the contract.

## 4. Check (30 seconds)

```bash
rassam check                      # the whole repository
rassam check --base origin/main   # only what your branch introduces, the way CI judges it
```

The first run on an existing codebase usually finds violations. That is expected and does not block adoption: in a pull request only *new* violations fail, and existing ones are reported collapsed. Fix them, or leave them and stop them growing.

Other things to try:

```bash
rassam explain src/api/payments/charge.ts   # what the contract says about a file
rassam impact src/domain/order.ts           # who depends on what you are about to change
rassam graph > architecture.mmd             # Mermaid diagram of the component graph
rassam reach                                # what coding agents can reach in this repo
```

Commit `.rassam/blueprint.json` and the files `init` wrote.

## 5. Gate every pull request

`init --workflow` writes `.github/workflows/rassam.yml`. This is what it contains, with the action pinned to a full commit SHA, which is the version we recommend once you depend on it:

```yaml
name: Rassam

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write # one sticky comment; drop it and set comment: "false" to run read-only

concurrency:
  group: rassam-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  blueprint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the gate needs the merge-base to tell new findings from old ones
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: V0ightt/Rassam@<full 40-character commit SHA> # v0.4.1
```

### Pin the action

A gate that runs with your repository's token should not change underneath you. In order of preference:

1. **A full commit SHA, with the version as a comment**: `uses: V0ightt/Rassam@<sha> # v0.4.1`. A SHA cannot be moved. When tj-actions/changed-files was compromised in 2025, workflows pinned to a SHA were the ones that stayed safe. Find the SHA of a release with `git ls-remote https://github.com/V0ightt/Rassam refs/tags/v0.4.1` (it is also on the release page). Dependabot (`package-ecosystem: github-actions`) and Renovate update SHA pins and keep the comment in step.
2. **A release tag**: `uses: V0ightt/Rassam@v0.4.1`. Readable, and what `init` writes. A tag can in principle be re-pointed by whoever controls this repository (GitHub's immutable releases prevent that once enabled), so organisations that require pinning usually ask for SHAs.
3. **Never a branch** such as `@main`: every push to it would change the checker that judges your code.

The CLI and the action come from the same release, so keep `npx @v0ightt/rassam@0.4.1` in `.mcp.json` and `V0ightt/Rassam@… # v0.4.1` in the workflow on the same version.

### Permissions

The workflow above asks for the least it needs: `contents: read` to check out the code, and `pull-requests: write` only to keep one sticky comment up to date. Without the comment, drop `pull-requests: write` and add `with: { comment: "false" }`; annotations and the job summary still work. Pull requests from forks get a read-only token, so the comment is skipped there. To show findings in GitHub code scanning, add `security-events: write`, give the Rassam step `with: { sarif-output: rassam.sarif }`, and follow it with:

```yaml
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: rassam.sarif
```

### What it decides

`fetch-depth: 0` gives the gate the history it needs to find the merge-base. With the default shallow clone it cannot tell new violations from old ones.

The pull request is judged by the blueprint on its **base branch**, so a pull request cannot relax the rules it is checked against. Two kinds of change fail until a human applies the `rassam:approved` label to the pull request:

- **Weakening the contract**: removing a rule, lowering a severity, widening an exception, moving files out of a constrained component.
- **Weakening the tests**: a skipped or focused test, a removed or trivialised assertion, a deleted test file, a lowered or removed coverage threshold, a forced success exit. Other changes to tests, CI and agent configuration are warnings: a person should look, and nothing blocks. Set `policy.verificationWeakening` to `"warn"` to make these warnings too; that edit is itself a weakening and needs the label.

Inputs, all optional:

| Input | Default | Meaning |
| --- | --- | --- |
| `base` | the pull request's base branch | Branch to diff against. Outside pull requests it is empty and the whole repository is checked. |
| `fail-on` | `error` | `error`, `warning` or `never` |
| `budget` | `5` | How many findings are shown in full |
| `comment` | `true` | Keep a sticky pull request comment |
| `approve-label` | `rassam:approved` | Label that approves contract- and test-weakening changes |
| `sarif-output` | empty | Path for a SARIF 2.1.0 report |
| `run-invariants` | `false` | Run invariant commands from the base blueprint |
| `working-directory` | `.` | Directory containing `.rassam/` |
| `verbose` | `false` | Extra detail in the log |

Outputs: `verdict` (`pass`, `warn` or `fail`) and `report-path` (the JSON report).

Protect the label itself. Anyone, and any token, that can triage or write pull requests can add a label, so an agent whose token has `pull-requests: write` could approve its own change. Give agents tokens without it, and require the Rassam check in branch protection or a ruleset so a red gate blocks the merge.

## 6. Give your agents the contract

Two channels, and you want both. `AGENTS.md` (step 1) tells every agent the rules before it starts; the MCP server lets an agent ask while it works: who owns this file, may I add this import, what breaks if I change this, does my change pass. `init --mcp` writes the Claude Code entry. For other tools, every snippet runs the same command over stdio:

**Claude Code**: `.mcp.json` in the repository root:

```json
{
  "mcpServers": {
    "rassam": { "command": "npx", "args": ["-y", "@v0ightt/rassam@0.4.1", "mcp"] }
  }
}
```

**Cursor**: `.cursor/mcp.json`, the same `mcpServers` object.

**Codex**: `.codex/config.toml` (or `~/.codex/config.toml` for every project):

```toml
[mcp_servers.rassam]
command = "npx"
args = ["-y", "@v0ightt/rassam@0.4.1", "mcp"]
```

**VS Code**: `.vscode/mcp.json` (note the key is `servers`):

```json
{
  "servers": {
    "rassam": { "type": "stdio", "command": "npx", "args": ["-y", "@v0ightt/rassam@0.4.1", "mcp"] }
  }
}
```

On native Windows some clients cannot start `npx` directly; use `"command": "cmd", "args": ["/c", "npx", "-y", "@v0ightt/rassam@0.4.1", "mcp"]` there. The server uses the repository it is started in; if your agent starts MCP servers elsewhere, add `"--root", "/path/to/your/repo"` to `args`.

All of these files are tripwires: the pull request that adds them shows `protected-path` findings for MCP configuration and agent instructions. That is the gate working. From now on, any change to what your agents can reach or are told gets a human look.

`rassam proposals` lists what agents have proposed or escalated. Proposals are files under `.rassam/proposals/`; nothing applies them for you.

## 7. Sign off

A draft that nobody checked is a guess. When you have read a component's code against its intent, or confirmed a rule says what you mean, record it:

```bash
rassam verify payments --note "Read charge() and refund() against the intent"
rassam verify stripe-keys-stay-in-payments --by "Dana Okafor" --note "Confirmed no other reader"
```

`verify` takes the ID of a component, rule or invariant, or `"from->to"` for a dependency, and writes a `verified` stamp with your name (default: `git config user.name`), the time and the current commit into `.rassam/blueprint.json`. Commit it; the sign-off is reviewed in a pull request like any other change. Reports show the share of the contract that is human-authored or human-verified, so you can see how much of it is intent and how much is still a machine's description of the code.

## Where next

- [blueprint-spec.md](blueprint-spec.md): every field, the selector grammar, how the gate decides, the security model.
- Add an invariant with a `check.run` command for a property that must never break, and turn on `run-invariants`.
- Add `protect` rules for the paths in your system that should never change without a person looking: migrations, authentication, billing.
- Working from a checkout of Rassam itself: `npm run rassam -- <command>` runs the CLI from source, and `node action/dist/rassam.mjs <command>` runs the committed bundle.
