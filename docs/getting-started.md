# Getting started with Rassam Blueprint

Five minutes from nothing to a contract that your coding agents read and your pull requests are checked against. The full format is in [blueprint-spec.md](blueprint-spec.md).

## Before you start

You need Node.js 20 or later and a git repository to protect.

Rassam is not published to npm yet, so run the CLI from a checkout of this repository. Throughout this guide `rassam` stands for one of:

```bash
# inside a Rassam checkout, from source
npx tsx src/cli/index.ts <command>

# anywhere, using the single-file bundle (build it once with `npm run build:cli`)
node /path/to/Rassam/action/dist/rassam.mjs <command>
```

To make the rest of the guide copy-pasteable, define a shell function once:

```bash
rassam() { node /path/to/Rassam/action/dist/rassam.mjs "$@"; }
```

Do not use `npx rassam` outside a Rassam checkout: npx would fetch whatever package has that name on the public registry.

Run the commands below from the root of the repository you want to protect, or pass `--root <dir>`.

## 1. Draft the blueprint (1 minute)

```bash
rassam init --dry-run   # look first
rassam init             # writes .rassam/blueprint.json
```

`init` reads your source tree and writes a draft from static analysis: components and the dependencies observed between them, marked `"provenance": { "source": "derived" }`. It describes what the code does today. It does not know what you intended, and that part is yours.

Useful flags: `--name "My System"` sets the system name, `--force` overwrites an existing blueprint.

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

Rules turn intent into something the gate can enforce. Add these to the `rules` array, with your own component IDs.

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

## 4. Check (30 seconds)

```bash
rassam check                      # the whole repository
rassam check --base origin/main   # only what your branch introduces
```

The first run on an existing codebase usually finds violations. That is expected and does not block adoption: in a pull request only *new* violations fail, and existing ones are reported collapsed. Fix them, or leave them and stop them growing.

Other things to try:

```bash
rassam explain src/api/payments/charge.ts   # what the contract says about a file
rassam impact src/domain/order.ts           # who depends on what you are about to change
rassam graph > architecture.mmd             # Mermaid diagram of the component graph
rassam reach                                # what coding agents can reach in this repo
```

Commit `.rassam/blueprint.json`.

## 5. Gate every pull request

Add `.github/workflows/rassam.yml`:

```yaml
name: Rassam Blueprint

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  blueprint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: V0ightt/Rassam@main
```

What matters in that file:

- `fetch-depth: 0` gives the gate the history it needs to find the merge-base. With the default shallow clone it cannot tell new violations from old ones.
- `pull-requests: write` lets it keep one sticky comment up to date. Without it, set `comment: "false"`; annotations and the job summary still work. Pull requests from forks get a read-only token, so the comment is skipped there too.
- Pin `@main` to a release tag or commit SHA once you depend on it. The gate should not change underneath you.

The pull request is judged by the blueprint on its **base branch**, so a pull request cannot relax the rules it is checked against. A change that weakens the contract (removing a rule, lowering a severity, widening an exception) fails until a human applies the `rassam:approved` label to the pull request.

Inputs, all optional:

| Input | Default | Meaning |
| --- | --- | --- |
| `base` | the pull request's base branch | Branch to diff against. Outside pull requests it is empty and the whole repository is checked. |
| `fail-on` | `error` | `error`, `warning` or `never` |
| `budget` | `5` | How many findings are shown in full |
| `comment` | `true` | Keep a sticky pull request comment |
| `approve-label` | `rassam:approved` | Label that approves contract-weakening changes |
| `sarif-output` | empty | Path for a SARIF 2.1.0 report |
| `run-invariants` | `false` | Run invariant commands from the base blueprint |
| `working-directory` | `.` | Directory containing `.rassam/` |
| `verbose` | `false` | Extra detail in the log |

Outputs: `verdict` (`pass`, `warn` or `fail`) and `report-path` (the JSON report).

To show findings in GitHub code scanning, add `security-events: write` to `permissions`, give the Rassam step `with: { sarif-output: rassam.sarif }`, and follow it with:

```yaml
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: rassam.sarif
```

## 6. Give your agents the contract

The gate catches violations after the fact. The MCP server lets an agent ask first: who owns this file, may I add this import, what breaks if I change this. Wire it into each agent you use. Every snippet runs the same command, `rassam mcp`, over stdio; replace the path with yours.

**Claude Code** — `.mcp.json` in the repository root:

```json
{
  "mcpServers": {
    "rassam": {
      "command": "node",
      "args": ["/path/to/Rassam/action/dist/rassam.mjs", "mcp"]
    }
  }
}
```

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "rassam": {
      "command": "node",
      "args": ["/path/to/Rassam/action/dist/rassam.mjs", "mcp"]
    }
  }
}
```

**Codex** — `.codex/config.toml` (or `~/.codex/config.toml` for every project):

```toml
[mcp_servers.rassam]
command = "node"
args = ["/path/to/Rassam/action/dist/rassam.mjs", "mcp"]
```

**VS Code** — `.vscode/mcp.json` (note the key is `servers`):

```json
{
  "servers": {
    "rassam": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/Rassam/action/dist/rassam.mjs", "mcp"]
    }
  }
}
```

The server uses the repository it is started in. If your agent starts MCP servers elsewhere, add `"--root", "/path/to/your/repo"` to `args`.

Then tell the agent to use it. Add this to `AGENTS.md`, `CLAUDE.md` or your agent's instruction file:

```markdown
## Architecture contract

This repository has a Rassam Blueprint (`.rassam/blueprint.json`). It is binding.

- Before editing a file, call `explain_path` for it. Before adding an import across components, call `check_dependency`.
- Before committing, call `check_changes` and fix what it reports.
- Never edit `.rassam/blueprint.json`, tests, or CI configuration to make a check pass.
- If the contract looks wrong, call `propose_change`. If the task cannot be done without breaking it, stop and call `report_conflict`.
```

All of these files are tripwires: the pull request that adds them will show `protected-path` findings for MCP configuration and agent instructions. That is the gate working. From now on, any change to what your agents can reach or are told gets a human look.

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
