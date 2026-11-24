# Rassam Blueprint specification, v0.1

Status: draft. The format is defined by `src/blueprint/schema.ts`; where this document and that file disagree, the file wins. Behavior that is not yet fixed is marked **implementation-defined**: do not rely on it.

Contents: [Purpose](#1-purpose) · [Files](#2-file-location-and-companions) · [Structure](#3-top-level-structure) · [Fields](#4-field-reference) · [Selectors](#5-selectors) · [Membership](#6-component-membership) · [Provenance](#7-provenance-and-verification) · [The gate](#8-how-the-gate-evaluates-a-change) · [Severity and budget](#9-severity-scoring-and-the-attention-budget) · [Output](#10-output-formats) · [MCP](#11-mcp-server) · [CLI](#12-cli-reference) · [Security](#13-security-model) · [Versioning](#14-versioning-and-compatibility) · [JSON Schema](#15-json-schema)

## 1. Purpose

A coding agent can read all of a repository's code, but it cannot read what the team meant: which boundaries are deliberate, which dependencies are forbidden, which properties must never break. That intent is not in the code, so no model can derive it, and it becomes more valuable as agents write more of the code. A Rassam Blueprint is a JSON file in the repository that records this intent as a contract. Agents query it before they act, a gate checks every change against it, and humans write it and sign off on a short, ranked list of exceptions. The three things the format exists to protect are the ones that stay scarce as agents improve: stated intent, enforcement that the agent under review cannot relax, and human sign-off.

## 2. File location and companions

All paths are relative to the repository root.

| Path | Role | Who writes it |
| --- | --- | --- |
| `.rassam/blueprint.json` | The contract. The only file the gate judges by. | Humans, directly or by accepting proposals |
| `.rassam/layout.json` | Canvas positions for the visual editor. Kept out of the contract so that moving a box never appears in a contract diff. Its format is implementation-defined in 0.1 and it has no effect on checks. | The canvas |
| `.rassam/proposals/` | Blueprint changes suggested by agents through the `propose_change` MCP tool. Proposals are never applied automatically. File format is implementation-defined. | Agents |
| `.rassam/escalations/` | Conflicts reported by agents through `report_conflict`: cases where the task cannot be done without breaking the contract. File format is implementation-defined. | Agents |
| `.rassam/status.json` | Runtime status of the components that declare `runtime`: what the last probe run found. Not part of the contract and never judged by the gate. Format in [`rassam status`](#rassam-status). | `rassam status --write`, usually in CI |
| `.rassam/live/` | Default output directory of [`rassam render`](#rassam-render): the system design as SVG, two badges and `system.json`. Generated; safe to delete. | `rassam render` |

`blueprint.json` is UTF-8 JSON (a leading byte-order mark is tolerated). Tools write it with two-space indentation, a trailing newline and the top-level keys in the order `$schema`, `version`, `system`, `policy`, `components`, `dependencies`, `rules`, `invariants`, `decisions`, so that diffs stay small.

## 3. Top-level structure

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `$schema` | no | — | Schema URL for editors: `https://raw.githubusercontent.com/V0ightt/Rassam/main/schema/blueprint-0.1.schema.json` |
| `version` | yes | — | Must be the string `"0.1"` |
| `system` | yes | — | Name and description of the system |
| `policy` | no | all defaults | How the gate treats things the rules do not mention |
| `components` | yes | — | The parts of the system and the files each one owns (may be `[]`) |
| `dependencies` | no | `[]` | Intended relationships between components |
| `rules` | no | `[]` | Constraints the code must satisfy |
| `invariants` | no | `[]` | Properties that must hold, with optional checks |
| `decisions` | no | `[]` | Architecture decision records |

Every object is strict: an unknown key anywhere is a validation error (see [Versioning](#14-versioning-and-compatibility)).

### Complete example

A small web shop: a React front end, an HTTP API, a domain layer, a data-access layer, a payments module, and two external systems.

```json
{
  "$schema": "https://raw.githubusercontent.com/V0ightt/Rassam/main/schema/blueprint-0.1.schema.json",
  "version": "0.1",
  "system": {
    "name": "Corner Shop",
    "description": "Storefront with card payments.",
    "repository": "https://github.com/example/corner-shop"
  },
  "policy": {
    "undeclaredDependencies": "warning",
    "unmappedFiles": "info",
    "includeTypeOnly": true,
    "tripwires": { "defaults": true, "paths": ["db/migrations/**"] },
    "verificationHeuristics": true,
    "verificationWeakening": "require-approval",
    "ignore": ["src/generated/**", "**/*.snap"]
  },
  "components": [
    {
      "id": "web",
      "name": "Web UI",
      "kind": "frontend",
      "intent": "Renders pages and talks to the API over HTTP. Holds no business rules and never touches the database.",
      "paths": ["src/web/**"],
      "tags": ["layer:ui"],
      "owners": ["@example/frontend"]
    },
    {
      "id": "api",
      "name": "HTTP API",
      "kind": "api",
      "intent": "Authenticates requests, validates input and delegates to the domain. No SQL here.",
      "paths": ["src/api/**"],
      "tags": ["layer:app"],
      "assurance": "tested",
      "provenance": { "source": "human", "by": "Dana Okafor", "at": "2026-11-02" },
      "verified": { "by": "Dana Okafor", "at": "2026-11-20", "commit": "3b107ef", "note": "Read every handler against the intent." }
    },
    {
      "id": "payments",
      "name": "Payments",
      "kind": "service",
      "intent": "The only code that talks to Stripe or reads Stripe credentials.",
      "paths": ["src/api/payments/**"],
      "priority": 10,
      "tags": ["layer:app", "pci"]
    },
    {
      "id": "domain",
      "name": "Domain",
      "kind": "domain",
      "intent": "Pure business rules: pricing, stock, orders. No I/O and no framework imports.",
      "paths": ["src/domain/**"],
      "exclude": ["src/domain/**/*.fixture.ts"],
      "tags": ["layer:core"],
      "assurance": "property-tested"
    },
    {
      "id": "db",
      "name": "Data access",
      "kind": "repository",
      "paths": ["src/db/**"],
      "tags": ["layer:data"],
      "provenance": { "source": "derived", "at": "2026-11-01", "commit": "a60113a" }
    },
    { "id": "postgres", "name": "PostgreSQL", "kind": "database", "external": true },
    { "id": "stripe", "name": "Stripe", "kind": "external-api", "external": true }
  ],
  "dependencies": [
    { "from": "web", "to": "api", "kind": "calls", "label": "REST" },
    { "from": "api", "to": "domain", "kind": "imports" },
    { "from": "api", "to": "db", "kind": "imports" },
    { "from": "payments", "to": "domain", "kind": "imports" },
    { "from": "payments", "to": "stripe", "kind": "calls", "reason": "Card payments." },
    { "from": "db", "to": "domain", "kind": "imports", "reason": "Repositories return domain types." },
    { "from": "db", "to": "postgres", "kind": "writes" }
  ],
  "rules": [
    {
      "id": "ui-never-touches-data",
      "kind": "forbid",
      "from": "web",
      "to": ["db", "package:pg"],
      "severity": "error",
      "reason": "All data access goes through the API so authorization is enforced in one place.",
      "provenance": { "source": "human", "by": "Dana Okafor" }
    },
    {
      "id": "domain-is-pure",
      "kind": "allow-only",
      "from": "domain",
      "to": ["package:zod", "package:node:crypto"],
      "reason": "The domain must stay testable without I/O."
    },
    {
      "id": "layering",
      "kind": "layers",
      "layers": ["tag:layer:ui", "tag:layer:app", "tag:layer:data", "tag:layer:core"],
      "includeTypeOnly": false
    },
    { "id": "no-cycles", "kind": "no-cycles" },
    {
      "id": "migrations-need-review",
      "kind": "protect",
      "paths": ["db/migrations/**", "src/api/auth/**"],
      "reason": "Schema and authentication changes are reviewed by a human, always."
    },
    {
      "id": "stripe-keys-stay-in-payments",
      "kind": "secret-access",
      "secrets": ["STRIPE_*"],
      "allow": "payments",
      "severity": "error"
    }
  ],
  "invariants": [
    {
      "id": "order-total-matches-lines",
      "statement": "An order's total always equals the sum of its line items plus tax.",
      "components": ["domain"],
      "check": { "run": "npm test -- src/domain/order.property.test.ts", "tests": ["src/domain/order*.test.ts"] },
      "severity": "error"
    }
  ],
  "decisions": [
    {
      "id": "adr-001",
      "title": "Payments are isolated in one module",
      "status": "accepted",
      "date": "2026-10-14",
      "components": ["payments"],
      "context": "PCI scope grows with every module that can see card data or keys.",
      "decision": "Only the payments component imports the Stripe SDK or reads STRIPE_* variables.",
      "consequences": "Other components call payments through its public functions.",
      "links": ["https://example.com/wiki/pci-scope"]
    }
  ]
}
```

Notes on the example:

- `payments` lives inside `src/api/`, which `api` also claims. `payments` wins those files because its `priority` is higher (it would also win on specificity; see [membership](#6-component-membership)).
- `postgres` and `stripe` are `external`: they own no files and exist so that dependencies and decisions can name them.
- `domain-is-pure` lists package selectors in `to`, so the domain's external imports are restricted to those packages as well as its internal ones.
- `layering` is ordered top to bottom. `db` (data) may import `domain` (core); `domain` may not import `db`.

## 4. Field reference

Common value types:

| Type | Constraint |
| --- | --- |
| ID | 1–80 characters from `A-Z a-z 0-9 . _ : -`, starting with a letter or digit. Regex: `^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$`. IDs are unique within their collection (components, rules, invariants, decisions). Avoid IDs that start with `component:`, `tag:`, `path:` or `package:`: selectors would read them as prefixes. |
| Glob | 1–400 characters, see [glob semantics](#glob-semantics) |
| Timestamp | 4–40 characters. ISO 8601 date or date-time is expected (`2026-11-21`, `2026-11-21T10:15:00Z`); the format is not validated so hand-edited files stay valid. |
| Severity | `"error"`, `"warning"` or `"info"` |

### 4.1 `system`

| Field | Required | Constraint | Meaning |
| --- | --- | --- | --- |
| `name` | yes | 1–200 chars | Display name |
| `description` | no | ≤ 4,000 chars | What the system is for |
| `repository` | no | ≤ 500 chars | Repository URL |

### 4.2 `policy`

Policy covers what the rules do not mention. Every field is optional.

| Field | Values | Default | Meaning |
| --- | --- | --- | --- |
| `undeclaredDependencies` | `off`, `info`, `warning`, `error` | `warning` | Severity of an observed cross-component dependency that has no entry in `dependencies` |
| `unmappedFiles` | `off`, `info`, `warning` | `info` | Severity of a source file that no component claims |
| `includeTypeOnly` | boolean | `true` | Whether type-only imports (TypeScript `import type`, `export type`) count as dependencies. A rule's own `includeTypeOnly` overrides this. |
| `tripwires.defaults` | boolean | `true` | Enable the built-in tripwires ([list](#84-tripwires)) |
| `tripwires.paths` | globs, ≤ 200 | none | Extra tripwire paths |
| `verificationHeuristics` | boolean | `true` | Enable the heuristics that flag weakened verification ([list](#85-verification-weakening-heuristics)) |
| `verificationWeakening` | `require-approval`, `warn` | `require-approval` | What a strong verification-weakening signal does (a skipped, focused, deleted or trivialized test, removed assertions, a lowered or removed coverage threshold, a forced zero exit). `require-approval`: an error until a human approves the change with the approval label. `warn`: a warning, except a forced zero exit, which stays an error. See [8.5](#85-verification-weakening-heuristics). |
| `ignore` | globs, ≤ 500 | `[]` | Paths excluded from analysis entirely, in addition to the [built-in ignore list](#built-in-ignore-list) |

### 4.3 `components[]`

At most 500 components.

| Field | Required | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | yes | ID | Stable identifier. Renaming an ID is a removal plus an addition. |
| `name` | yes | 1–200 chars | Display name |
| `kind` | no | lowercase slug `^[a-z][a-z0-9-]{0,39}$`; default `"default"` | Free-form category such as `api`, `service`, `database`, `external-api`. Not interpreted by rules. |
| `description` | no | ≤ 2,000 chars | What the component is |
| `intent` | no | ≤ 8,000 chars | Purpose, responsibilities and boundaries, written by a human. This is what agents are given before they edit the component. |
| `paths` | no | globs, ≤ 200; default `[]` | Files the component owns. A component that is not `external` must have at least one. |
| `exclude` | no | globs, ≤ 200 | Files matched by `paths` that the component does not own |
| `priority` | no | integer −100…100; default 0 | Resolves overlaps: higher wins |
| `external` | no | boolean | A system outside the repository (SaaS API, database, queue). Owns no files; `paths` is ignored. |
| `public` | no | boolean | Any component may depend on this one without declaring the dependency (contracts, types, utilities). Rules still apply to edges into it. Component IDs may not start with `component:`, `tag:`, `path:` or `package:`, and may not be `*`. |
| `tags` | no | ≤ 50 strings of 1–80 chars | Labels for `tag:` selectors. Tags may contain `:`. |
| `owners` | no | ≤ 50 strings of 1–120 chars | People or teams, free-form |
| `assurance` | no | `unknown`, `untested`, `tested`, `property-tested`, `formally-verified` | Declared level of verification. The gate may report `assurance-drift` when the repository no longer supports the claim; the evidence used is implementation-defined. |
| `runtime` | no | object, see below | Where the component runs, so `rassam status` can probe it. Has no effect on checks. |
| `provenance` | no | [Provenance](#7-provenance-and-verification) | Who asserted this component |
| `verified` | no | [Verification](#7-provenance-and-verification) | Human sign-off |

#### `runtime`: where a component runs

Optional. Each of the three signals is optional; a component may declare several, and the worst one decides its state. A component without `runtime` is "not monitored": it is never shown as down.

| Field | Constraint | Meaning |
| --- | --- | --- |
| `health.url` | `http://` or `https://` URL, ≤ 500 chars | Fetched by `rassam status`. Must be reachable from wherever the command runs and must not contain credentials or secrets: the blueprint is a committed file. |
| `health.method` | `GET` (default) or `HEAD` | Request method |
| `health.expectStatus` | integer 100–599 | The exact status that means healthy. Without it any 2xx is healthy. |
| `health.timeoutMs` | integer 100–30,000 | Timeout for this URL; overrides `rassam status --timeout` |
| `deployment.environment` | 1–100 chars | Name of a GitHub deployment environment. The state is the latest deployment status of that environment. |
| `workflow.file` | 1–200 chars | A workflow file such as `deploy.yml`. The state is the conclusion of its latest run on the default branch. |

```json
{
  "id": "api",
  "name": "API",
  "paths": ["src/api/**"],
  "runtime": {
    "health": { "url": "https://api.example.com/healthz", "expectStatus": 200 },
    "deployment": { "environment": "production" },
    "workflow": { "file": "deploy.yml" }
  }
}
```

### 4.4 `dependencies[]`

A dependency declares that one component is meant to depend on another. At most 5,000. Both ends must be existing component IDs. Declared dependencies permit; they do not forbid. An observed dependency without a declaration is reported according to `policy.undeclaredDependencies`, except edges whose source component has `kind: "test"` (tests may depend on anything) and edges into a `public` component.

| Field | Required | Constraint | Meaning |
| --- | --- | --- | --- |
| `from` | yes | component ID | The dependent |
| `to` | yes | component ID | What it depends on |
| `kind` | no | `imports`, `calls`, `reads`, `writes`, `sends`, `receives`, `uses` | Nature of the relationship. Descriptive; not used for matching. |
| `label` | no | ≤ 120 chars | Short label for diagrams |
| `reason` | no | ≤ 2,000 chars | Why the dependency exists |
| `provenance`, `verified` | no | | As for components |

Observed dependencies come from static analysis of import statements. A dependency has no `id`; tools address it as `<from>-><to>`, for example `api->db`. Declare each pair once: when a pair is repeated, the first entry is the one that counts.

### 4.5 `rules[]`

At most 500 rules. Every rule has these fields:

| Field | Required | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | yes | ID, unique among rules | Appears in findings and SARIF output |
| `kind` | yes | one of the six kinds below | Selects the rule's shape |
| `severity` | no | Severity | Severity of a violation. Default: `error` for `forbid`, `allow-only`, `layers` and `secret-access`; `warning` for `no-cycles` and `protect`. |
| `reason` | no | ≤ 2,000 chars | Why the rule exists. Shown to agents and reviewers with every violation. |
| `provenance`, `verified` | no | | As for components |

`forbid`, `allow-only`, `layers` and `no-cycles` also accept `includeTypeOnly` (boolean). When omitted, `policy.includeTypeOnly` applies.

Bare component IDs and `component:` entries in a rule's selectors must name existing components.

#### `forbid`

No dependency may go from files selected by `from` to files or packages selected by `to`.

```json
{ "id": "ui-never-touches-data", "kind": "forbid", "from": "web", "to": ["db", "package:pg"] }
```

Violations are `forbidden-dependency` findings located at the import.

#### `allow-only`

Files selected by `from` may depend only on files of their own component and on what `to` selects. When `from` selects several components, list in `to` the ones that may depend on each other. External packages are restricted only when `to` contains at least one `package:` entry; otherwise the rule constrains internal dependencies and leaves packages alone.

```json
{ "id": "domain-is-pure", "kind": "allow-only", "from": "domain", "to": ["package:zod"] }
```

Violations are `allow-only-violation` findings.

#### `layers`

`layers` is an ordered list of 2–20 selectors, top first. A layer may depend on layers listed after it and never on layers listed before it.

```json
{ "id": "layering", "kind": "layers", "layers": ["web", "api", ["db", "payments"], "domain"] }
```

Violations are `layer-violation` findings. A file or package belongs to the first layer that selects it. Dependencies within a layer, and dependencies that start or end outside every layer, are not constrained by the rule. A layer may skip over layers to reach a lower one. Layers may include `package:` selectors, which places external packages in the order.

#### `no-cycles`

No dependency cycle may exist between components. `scope` (a selector) limits the rule to the selected components; without it, all components are in scope.

```json
{ "id": "no-cycles-in-core", "kind": "no-cycles", "scope": "tag:layer:core" }
```

Violations are `dependency-cycle` findings, one per group of mutually dependent components, with one concrete path shown (`a → b → c → a`). Pictures show a cycle once: the graph view (`cycles`, and `cycle: true` on the edges of that path), the README diagram and the Studio canvas draw those edges in the warning colour with a dash-dot line and state the path in the header. Members of a cycle do not get a violation badge for it, because one cycle is one finding however many components it spans.

#### `protect`

A change to any file matching `paths` (1–200 globs) always requires human review. This is a project-specific tripwire.

```json
{ "id": "migrations-need-review", "kind": "protect", "paths": ["db/migrations/**"] }
```

Matches are `protected-path` findings. `protect` rules only act in diff mode: they are about changes, not states.

#### `secret-access`

Environment variables and secrets whose names match `secrets` (1–200 name patterns, 1–200 chars each) may only be read by code selected by `allow`.

```json
{ "id": "stripe-keys-stay-in-payments", "kind": "secret-access", "secrets": ["STRIPE_*"], "allow": "payments" }
```

Violations are `secret-access` findings at the line that reads the variable. Each `secrets` entry is a glob matched against the whole variable name, case-sensitively: `STRIPE_*`, `*_TOKEN`, `DATABASE_URL`. Reads are detected statically (for example `process.env.STRIPE_SECRET_KEY`); the set of languages and access forms recognized is implementation-defined.

### 4.6 `invariants[]`

An invariant is a property of the system stated in words, optionally backed by a command or by tests. At most 500.

| Field | Required | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | yes | ID, unique among invariants | |
| `statement` | yes | 1–2,000 chars | The property, in plain language |
| `components` | no | ≤ 100 existing component IDs | Components the invariant constrains |
| `check.run` | no | 1–1,000 chars | Shell command that exits 0 when the invariant holds. Run only with `check --run-invariants`, and in diff mode only as written in the base blueprint ([security](#13-security-model)). |
| `check.tests` | no | globs, ≤ 100 | Test files that exercise the invariant |
| `severity` | no | Severity | Severity of a failure. Default `error`. |
| `provenance`, `verified` | no | | As for components |

Findings: `invariant-failed` when `check.run` fails (each command is subject to `--invariant-timeout`, default 300 seconds); `invariant-at-risk` when a change touches the invariant's components or its `check.tests` files.

### 4.7 `decisions[]`

Architecture decision records, kept next to the structure they explain. At most 500.

| Field | Required | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | yes | ID, unique among decisions | |
| `title` | yes | 1–300 chars | |
| `status` | yes | `proposed`, `accepted`, `superseded`, `deprecated` | |
| `date` | no | Timestamp | |
| `components` | no | ≤ 100 existing component IDs | Components the decision applies to |
| `context` | no | ≤ 8,000 chars | The forces at play |
| `decision` | yes | ≤ 8,000 chars | What was decided |
| `consequences` | no | ≤ 8,000 chars | What follows from it |
| `supersededBy` | no | existing decision ID | |
| `links` | no | ≤ 20 strings of 1–500 chars | URLs or paths |
| `provenance` | no | | Decisions carry no `verified` stamp |

Decisions are not checked against code. Agents receive them through `get_component` and `list_decisions`.

### 4.8 Validation beyond the JSON Schema

A blueprint that passes the JSON Schema is still invalid when any of these hold:

- two components, rules, invariants or decisions share an ID;
- a component is not `external` and has no `paths`;
- a dependency's `from` or `to`, an invariant's or decision's `components` entry, or a bare or `component:` entry in a rule selector names a component that does not exist;
- a decision's `supersededBy` names a decision that does not exist.

An invalid blueprint produces an `invalid-blueprint` finding.

## 5. Selectors

A selector names a set of files, components or packages. It is a string, or an array of 1–100 strings whose positive entries are combined by union.

| Form | Selects |
| --- | --- |
| `*` | Every internal file |
| `<id>` | Files owned by component `<id>`. Same as `component:<id>`. |
| `component:<id>` | Files owned by component `<id>` |
| `tag:<pattern>` | Files owned by every component that has a matching tag. The pattern is matched against the whole tag and may use glob wildcards. Tags may contain `:`, so `tag:layer:ui` selects the tag `layer:ui`. |
| `path:<glob>` | Files matching the glob, whether or not a component owns them |
| `package:<glob>` | External packages by normalized name. The glob must match the whole name. |
| `!<selector>` | Exclusion. Only meaningful inside an array that also has positive entries. |

Rules:

- An entry that carries none of the prefixes `component:`, `tag:`, `path:`, `package:` and is not `*` is a component ID.
- Exclusions are applied after the union: `["*", "!web"]` is every internal file except those of `web`. `!path:` removes files, `!package:` removes packages, `!<id>` and `!tag:` remove components. An array with only exclusions selects nothing. `!*` has no effect.
- Internal and package entries are independent. `["api", "package:pg"]` selects the files of `api` and the package `pg`.
- Package names are normalized per ecosystem: `react`, `@scope/pkg`, `node:fs`, `github.com/x/y`, `org.springframework`. `*` does not cross `/`, so `package:@aws-sdk/*` matches every package in that scope and `package:github.com/**` matches every Go module hosted there.
- Where a rule needs whole components rather than files (`no-cycles` scope), `path:` entries are ignored.

Examples:

| Selector | Meaning |
| --- | --- |
| `"domain"` | The domain component |
| `["api", "payments"]` | Either component |
| `"tag:pci"` | Every component tagged `pci` |
| `"tag:layer:*"` | Every component with a tag starting `layer:` |
| `"path:src/**/*.sql.ts"` | Matching files anywhere under `src` |
| `["*", "!tag:layer:data"]` | Everything except the data layer |
| `"package:node:*"` | Every Node.js built-in imported with the `node:` prefix |
| `["package:node:fs", "package:node:child_process"]` | Two specific built-ins |
| `["package:*", "package:@*/*", "!package:zod"]` | Every unscoped and scoped npm package except `zod` |

## 6. Component membership

Every analyzed file belongs to at most one component. Rules, declared dependencies and impact analysis all work on this mapping.

### Glob semantics

Globs are matched against repository-relative paths with forward slashes. Matching is case-sensitive.

| Syntax | Matches |
| --- | --- |
| `**` | Any number of path segments, including none, when it is a whole segment: `src/**/x.ts` matches `src/x.ts` and `src/a/b/x.ts`. Elsewhere it behaves like `*`. |
| `*` | Any run of characters except `/`. Matches leading dots. |
| `?` | One character except `/` |
| `{a,b}` | Either alternative. May be nested and may contain `/`. |
| `[abc]`, `[a-z]` | One character from the class. `[!abc]` or `[^abc]` negates. |
| `\x` | The character `x` literally, for `* ? [ ] { } ! \` |

Three conventions follow `.gitignore`:

- **Basename-only patterns.** A pattern with no `/` matches the file name in any directory: `*.test.ts` matches `src/a/b/x.test.ts`. A leading `/` anchors a pattern to the repository root: `/Dockerfile` matches only the root file.
- **Directory patterns.** A pattern ending in `/` matches the directory and everything below it: `src/lib/` equals `src/lib/**`. A pattern that contains a `/` and no wildcard characters also matches everything below that path: `src/lib` matches `src/lib/ai.ts`.
- A leading `./` is ignored. Write globs with `/`: a `\` before an ordinary character is read as `/`, but before a wildcard character it is an escape.

Prefer the explicit `dir/**` form in blueprints; it reads unambiguously.

### Precedence

A component claims a file when at least one of its `paths` matches and none of its `exclude` globs match. External components claim nothing. When several components claim the same file, the owner is chosen by, in order:

1. the higher `priority` (default 0);
2. the higher glob specificity, where a component's specificity for a file is the largest count of literal characters among its matching `paths` globs. Literal characters are what remains after removing `**`, `*`, `?`, bracket classes and the punctuation of alternations (`{`, `}`, `,`). `src/api/payments/**` (17) beats `src/api/**` (8);
3. declaration order: the component listed first in `components`.

`exclude` only removes files from the component that declares it; another component may still claim them.

### Files outside every component

Files that no component claims are *unmapped*. They are reported as `unmapped-file` findings at the severity in `policy.unmappedFiles`. `path:` selectors and `*` still apply to them. A component whose globs match no file is reported as `empty-component`.

### Ignored files

Files matching `policy.ignore` or the built-in ignore list are not analyzed: they belong to no component, produce no dependencies and are not reported as unmapped. Whether tripwires still fire for ignored paths is implementation-defined.

#### Built-in ignore list

```
**/node_modules/**   **/.git/**        **/.next/**       **/.nuxt/**
**/.output/**        **/.svelte-kit/** **/.turbo/**      **/.cache/**
**/.venv/**          **/venv/**        **/__pycache__/** **/dist/**
**/build/**          **/out/**         **/coverage/**    **/target/**
**/vendor/**         **/*.min.js       **/*.map          **/*.d.ts
```

Files larger than 512 KiB and binary files are listed but not parsed. The contents of `.env` files are never read.

### Test files

A file is a test when it matches one of: `**/*.test.*`, `**/*.spec.*`, `**/*_test.go`, `**/test_*.py`, `**/*_test.py`, `**/__tests__/**`, `**/tests/**`, `**/test/**`, `**/spec/**`, `**/e2e/**`, `**/*Test.java`, `**/*Tests.java`, `**/*Test.kt`, `**/*Tests.cs`. Tests belong to components like any other file; the classification feeds the verification heuristics and the list of tests that exercise a component.

## 7. Provenance and verification

Components, dependencies, rules and invariants can carry `provenance` and `verified`. Decisions carry `provenance` only.

### `provenance`: who asserted the fact

| Field | Required | Constraint |
| --- | --- | --- |
| `source` | yes | `human`, `derived` or `agent` |
| `by` | no | ≤ 200 chars: person, tool or agent name |
| `at` | no | Timestamp |
| `commit` | no | ≤ 64 chars: commit the fact was asserted against |
| `note` | no | ≤ 1,000 chars |

- `human`: a person wrote it. This is intent, the part no tool can produce.
- `derived`: static analysis produced it (for example the draft from `rassam init`). It describes what the code does, not what it should do.
- `agent`: a coding agent proposed it and a human accepted the proposal into the file.

A fact with no `provenance` is treated as human-authored: tools that generate facts are expected to label them, so an unlabeled fact is assumed to have been written by hand.

### `verified`: a human sign-off

| Field | Required | Constraint |
| --- | --- | --- |
| `by` | yes | 1–200 chars: who signed |
| `at` | yes | Timestamp |
| `commit` | no | ≤ 64 chars: the commit the code was checked at |
| `note` | no | ≤ 1,000 chars: what was checked |

A `verified` stamp means "I checked this fact against the code at this commit". It is written by `rassam verify` or by hand. It is independent of `provenance`: a `derived` component becomes trustworthy when a human verifies it. When a change touches a component that carries a stamp, the gate reports `stale-verification` at `info` severity and suggests re-verifying. Adding, changing or removing a stamp shows up in a pull request as a `verification-changed` contract change, so sign-offs are reviewed like code.

### Human-authored ratio

Reports include `humanAuthoredRatio`: the share, from 0 to 1, of blueprint facts asserted or verified by a human. It measures how much of the contract is intent as opposed to a description of the current code. A blueprint at 0 only restates what any tool could derive.

The facts counted are all components, dependencies, rules, invariants and decisions. A fact is human when it has a `verified` stamp, or has no `provenance`, or has `provenance.source` equal to `human`. `derived` and `agent` facts count only once verified.

## 8. How the gate evaluates a change

`rassam check` runs in one of two modes.

- **Full mode** (no `--base`): the working tree is checked against its own blueprint. Every finding counts as new.
- **Diff mode** (`--base <ref>`): the change between the merge-base of `<ref>` and `HEAD`, and `HEAD`, is checked. This is the mode for pull requests.

### 8.1 The change is judged by the base blueprint

In diff mode the rules, policy, tripwires and invariant commands come from the blueprint at the merge-base, not from the one in the change. A pull request therefore cannot relax the rules it is judged by: deleting a `forbid` rule and adding the forbidden import in the same pull request fails on both counts.

When the base has no valid blueprint, for example in the pull request that introduces one, the change is judged by its own blueprint, and the new contract is reported as a `contract-changed` finding for review. A blueprint that is invalid at the head of a change is an `invalid-blueprint` error. Deleting the blueprint is a weakening change.

### 8.2 Only new violations fail

Each finding has a fingerprint that is stable across runs. A finding is *new* when the change introduces it and *pre-existing* when it was already present at the base. Only new findings affect the verdict. Pre-existing findings are counted and collapsed in the output (`--verbose` lists them). This lets a team adopt a blueprint on a codebase that already violates it and stop the violations from growing.

In full mode every finding is new, with one exception: a host that checks a blueprint it has just drafted from the same files (`rassam init`, the Studio) can say so (`preExisting` in the engine's `CheckInput`). Every rule and policy violation is then reported as pre-existing, with a note that it existed before the contract did: a draft describes the code as it is. Reach findings and an invalid blueprint are still new.

### 8.3 Contract changes

When the change edits `.rassam/blueprint.json`, the base and head blueprints are compared semantically: reordering keys or reformatting is not a change. An edit with no semantic change (formatting, key order, the `$schema` URL) also puts nothing in scope: even when a component's paths claim the blueprint file, it raises no `invariant-at-risk` or `stale-verification` notice. A semantic edit counts as a change to the component that owns the file, like any other file. Each difference is one of:

| Collection | Change kinds |
| --- | --- |
| Components | `component-added`, `component-removed`, `component-changed` |
| Rules | `rule-added`, `rule-removed`, `rule-weakened`, `rule-strengthened`, `rule-changed` |
| Dependencies | `dependency-added`, `dependency-removed` |
| Invariants | `invariant-added`, `invariant-removed`, `invariant-changed` |
| Decisions | `decision-added`, `decision-removed`, `decision-changed` |
| Policy | `policy-weakened`, `policy-changed` |
| Sign-offs | `verification-changed` |

Every change carries a `weakens` flag: true when the change loosens the contract agents are judged by. Weakening changes are reported as `contract-weakened` findings and are errors unless a human approves them. Other changes are reported as `contract-changed`.

The following are weakening changes. The `weakens` flag on each entry of `contractChanges` in the report is authoritative.

- **The blueprint is deleted.**
- **A rule is removed**, or its `kind` is changed.
- **A rule's severity is lowered**, counting the default when `severity` is omitted.
- **A rule stops counting type-only imports** (`includeTypeOnly` set to `false`).
- **A rule covers less or permits more.** Selectors are compared entry by entry: removing an entry or adding a `!` exclusion narrows a selector; adding an entry or removing a `!` exclusion widens it.
  - `forbid`: `from` or `to` narrowed.
  - `allow-only`: `from` narrowed, or `to` widened.
  - `layers`: a layer removed, or the order of the remaining layers changed.
  - `no-cycles`: a `scope` added where there was none, or `scope` narrowed.
  - `protect`: a path removed.
  - `secret-access`: a `secrets` pattern removed, or `allow` widened.
- **An invariant is removed**, its `check.run` is removed or changed, a `check.tests` entry is removed, or its severity is lowered.
- **Policy is loosened**: `undeclaredDependencies` or `unmappedFiles` lowered; `includeTypeOnly`, `tripwires.defaults` or `verificationHeuristics` turned off; `verificationWeakening` changed from `require-approval` to `warn` (removing the field restores the default, `require-approval`, so it is not a loosening); a `tripwires.paths` entry removed; an `ignore` glob added.
- **A component that base rules refer to loses coverage**: the component is removed, a `paths` glob is removed, or an `exclude` glob is added, when a rule names the component by ID or by tag; or a tag that a rule selects by is removed.
- **A component's `assurance` is lowered** from a stated level.
- **A component is made `public`, or its `kind` becomes `test`**: both exempt edges from undeclared-dependency checks.
- **Files leave a rule-constrained component.** Independently of the field-by-field diff, the gate assigns the head snapshot's files with both blueprints; any file that moves out of a component a base rule selects (through changed paths or excludes, a higher-priority or more specific component, or a removed component) is a `contract-weakened` finding.
- **A new or re-scoped component claims paths inside a rule-constrained component** (its glob's literal prefix is nested inside the constrained component's), unless the head rules select the new component wherever they selected the constrained one. Files created there later would otherwise escape the rules.
- **A dependency is declared while `policy.undeclaredDependencies` is `error`**, because under that policy the declaration is what legalizes a new edge.

The comparison is syntactic. Replacing a selector entry with a broader one registers as one removal and one addition, and so is reported as weakening even when the net effect is stricter. A human approves it once; that is the intended cost of editing a contract.

Not weakening: adding rules, invariants, components or decisions; tightening any of the above; rewording `reason`, `intent`, `statement` or names; removing a declared dependency; changing or removing a decision; adding, changing or removing a sign-off.

**Approval.** A weakening change is approved by a human, never by the change itself:

- in GitHub mode, by applying the approval label to the pull request (default `rassam:approved`, `--approve-label`). The label is read from the pull request, so a commit cannot set it;
- elsewhere, by passing `--approved`.

The report records `approved: true`. An approved weakening change is still listed, at `info` severity instead of `error`, so it no longer fails the gate. The same approval clears the strong verification-weakening signals that need one ([8.5](#85-verification-weakening-heuristics)). It does not excuse rule violations, tripwires or weak verification signals.

### 8.4 Tripwires

A tripwire is a path whose modification always surfaces for human review, whatever the change does to it. A changed tripwire path is a `protected-path` finding. Tripwires come from three places: the built-in list (unless `policy.tripwires.defaults` is `false`), `policy.tripwires.paths`, and `protect` rules.

Built-in tripwires:

| Category | Paths | Why |
| --- | --- | --- |
| `contract` | `.rassam/blueprint.json` | The contract itself changed |
| `tests` | `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, `**/*_test.go`, `**/test_*.py` | Tests are the checks agents are graded by |
| `tests` | `**/conftest.py` | Fixtures shape what tests can detect |
| `tests` | `{jest,vitest,playwright,cypress,karma}.config.*` | Runner configuration controls what runs and what counts as passing |
| `tests` | `pytest.ini`, `tox.ini`, `.coveragerc`, `codecov.yml`, `.nycrc`, `.nycrc.json` | Test and coverage configuration |
| `ci` | `.github/workflows/**`, `.gitlab-ci.yml`, `.circleci/**` | CI decides what is verified before merge |
| `ci` | `.husky/**`, `.pre-commit-config.yaml`, `lefthook.yml`, `.git-hooks/**` | Git hooks are local verification gates |
| `ci` | `.github/CODEOWNERS` | Ownership rules decide who must review |
| `dependencies` | `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`, `Cargo.lock`, `poetry.lock`, `uv.lock`, `go.sum`, `Gemfile.lock`, `composer.lock` | Lockfile changes alter the supply chain |
| `agent-permissions` | `.mcp.json`, `mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.windsurf/mcp_config.json` | MCP configuration controls which tools and credentials agents can reach |
| `agent-permissions` | `.claude/settings.json`, `.codex/**`, `.gemini/settings.json` | Agent permission, hook and configuration settings |
| `agent-permissions` | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/**`, `.github/copilot-instructions.md` | Instructions that steer coding agents |
| `secrets` | `**/.env*` | Environment files can carry credentials |
| `build` | `Dockerfile`, `**/Dockerfile`, `docker-compose*.yml`, `**/*.tf`, `**/*.tfvars` | Infrastructure and deployment definitions |

The test-runner, test-configuration and lockfile patterns contain no `/`, so they match in any directory. The other patterns that do not start with `**/` match only at the repository root.

Tripwire findings are warnings. A `protect` rule can set its own `severity`. With the default `--fail-on error` a tripwire therefore informs the reviewer without failing the check.

A tripwire does not say the change is wrong. Editing a test alongside the code it covers is normal. It says a human should look, and the ranking in [section 9](#9-severity-scoring-and-the-attention-budget) decides how prominently.

### 8.5 Verification-weakening heuristics

Tripwires see that a check changed. These heuristics read the diff to see whether it got weaker. Text inside single-line string literals in source code is ignored, so test fixtures that merely mention a pattern do not trigger a signal. They run in diff mode when `policy.verificationHeuristics` is `true` and produce `verification-weakened` findings. Each finding names its signal:

| Signal | Strength | What it detects |
| --- | --- | --- |
| `test-skipped` | strong | Added skip markers: `.skip`, `xit`, `xdescribe`, `@pytest.mark.skip`, `t.Skip()`, `@Disabled`, `@Ignore`, node:test's `{ skip: … }` and `{ todo: … }` options and equivalents. A bare `it.todo('…')` placeholder has no body to lose and is not a skip |
| `test-focused` | strong | Added focus markers (`.only`, `fit`, `fdescribe`), which silently disable every other test in the file |
| `test-file-deleted` | strong | A test file deleted, or renamed to a name the runner no longer picks up (e.g. `orders.test.ts` → `orders.disabled.ts`) |
| `assertions-removed` | strong | Assertions deleted (or commented out) from a test that still exists |
| `assertion-trivialized` | strong | An assertion replaced by one that cannot fail, such as `expect(true).toBe(true)`, `expect(x).toBe(x)` or `assert True` |
| `coverage-threshold-lowered` | strong | A coverage threshold reduced in test or coverage configuration |
| `coverage-threshold-removed` | strong | A coverage threshold deleted with no replacement |
| `exit-zero` | strong | A forced success exit: `process.exit(0)`, `sys.exit(0)`, `os.Exit(0)` in tests or runner config; in shell and CI, an `exit 0` that swallows a failure (`cmd \|\| exit 0`), shares a line with a verification command, or stands alone in a git hook. Guard clauses and the last line of a script are not flagged |
| `ci-weakened` | weak | CI configuration loosened: `continue-on-error`, `\|\| true`, `if: false`, removed verification steps, a dropped `pull_request` trigger |
| `tests-excluded` | weak | Test-runner configuration now excludes tests (`exclude`, `testPathIgnorePatterns`, `--ignore`, `--deselect`) |
| `test-script-changed` | weak | A verification script in `package.json` (`test`, `test:*`, `lint`, `typecheck`, `check`, `ci`) changed or was removed; new scripts are not flagged |
| `suppression-added` | weak | Added `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `# type: ignore`, `# noqa`, `#[allow(...)]`, `@SuppressWarnings` |
| `test-special-casing` | weak | Production code now detects a test runner (`process.env.NODE_ENV === "test"`, `process.env.VITEST`, `"pytest" in sys.modules`, `testing.Testing()`, an early `return` under `import.meta.vitest`), the pattern behind special-casing graded inputs |
| `snapshots-mass-updated` | weak | Many snapshot files rewritten in one change |

The strength of each signal is fixed by the engine (`WEAKENING_SIGNALS` in `src/blueprint/diff.ts`). A strong signal removes or disables a check outright. A weak signal loosens verification in a way that is routine often enough to need a reviewer's judgment rather than a sign-off.

**Severity and approval.** Weak signals are warnings (a single suppression, and mass snapshot updates, are info). What a strong signal does depends on `policy.verificationWeakening` in the blueprint the change is judged by:

| `verificationWeakening` | Strong signal | `exit-zero` | With the approval label |
| --- | --- | --- | --- |
| `require-approval` (default) | error | error | info |
| `warn` | warning | error | strong signals stay warnings; `exit-zero` becomes info |

Under `require-approval` a skipped, deleted or gutted test therefore fails the change until a human applies the approval label ([8.3](#83-contract-changes): `rassam:approved` by default, or `--approved`), the same mechanism that approves contract weakening. The finding's message says so, and the pull request comment lists the weakened checks and the label to apply. An approved signal is still listed, at `info` severity, with a note that a human approved it. `exit-zero` is an error under both settings, and the approval clears it under both, so `warn` is never stricter than `require-approval`. Changing the setting from `require-approval` to `warn` is a weakening change.

**Context from the same change.** A strong signal is reported as weak (a warning that needs no approval), or not at all, when the rest of the diff shows that no verification was lost or that what it verified is gone too:

- Assertions that reappear verbatim in another test file that the runner picks up the same way (tests moved between files, a test file split in several) are not counted as removed, and a deleted test file whose assertions all reappear is not flagged. A file only lends the assertions it gained beyond its own removals.
- Assertions folded into a parametrized test (`it.each`, `@pytest.mark.parametrize`, a Go table and similar) are not counted as removed when every value they checked appears in the added lines and the new test body makes a real assertion.
- A test file deleted together with the source file it imports or sits next to, and a test block deleted together with a function or class it calls whose definition the change removes, are reported as weak signals.
- A deleted file under a test directory that holds no test declarations and no assertions (a helper, a fixture, data) is not a deleted test. The tests tripwire still surfaces it.
- An assertion replaced by one that cannot fail is reported once, as `assertion-trivialized`.

This context is evidence, not proof: renaming a function and deleting the tests that called its old name reads as a removal with its code and stays a warning.

The exact patterns, thresholds and languages covered are implementation-defined. The heuristics are deliberately biased toward recall: a false alarm costs a reviewer a glance, a miss lets a disabled check through.

Rationale. The documented ways coding agents cheat on tasks do not attack the task; they attack the checks: editing tests so they pass, special-casing test inputs, patching the grader, exiting with status 0, weakening CI. Research on impossible tasks found that agents given an explicit way to stop and report used it instead of cheating far more often, which is why `report_conflict` exists ([section 11](#11-mcp-server)). A gate that only checks whether tests pass is blind to all of this, because the tests do pass. So the gate treats changes to the verification machinery as first-class findings.

### 8.6 Agent authorship

In diff mode the gate reads the commits in the change and detects coding agents from author names, author emails and commit-message trailers such as `Co-Authored-By:`. The report's `agentActivity` gives the number of commits, the number attributed to agents and the agent names found (for example "Claude", "GitHub Copilot").

Recognized agents in this version: Claude, GitHub Copilot, Devin, Cursor, Codex, Jules, Gemini, Aider, Amp and Factory, plus generic trailers such as `Generated-by:` and `Assisted-by:`. Ordinary automation (Dependabot, Renovate, GitHub Actions and similar) is not counted as a coding agent. The list of markers is implementation-defined and grows over time.

Authorship is evidence, not proof: trailers are voluntary and trivially omitted. The gate applies the same rules and the same verdict to every change. Authorship only affects ranking: in a change with agent commits, findings about weakened verification, tripwires, contract weakening and agent permissions are ranked higher.

### 8.7 Reach analysis

Reach is what coding agents working in the repository can touch. `rassam reach` and the `reach` section of a check report cover:

| Subject | What is reported |
| --- | --- |
| Agent configuration files | MCP configs, Claude settings, Codex config, Gemini settings, Cursor rules, instruction files, workflows; with the agent each belongs to |
| MCP servers | Name, config file, transport (`stdio`, `http`, `unknown`), command or URL, and the *names* of environment variables passed to the server |
| Permission grants | Allow, deny and ask rules per agent, with a `broad` flag for grants of unconstrained shell, network or write access |
| Inline secrets | Credentials written directly into configuration files: path, line, location within the file (for example `mcpServers.github.env.GITHUB_TOKEN`), kind, and a redacted preview |
| Environment access | For each environment variable read in code: whether its name looks like a credential, and which components and files read it |

In diff mode, changes to reach produce `agent-permission-change` findings, and inline credentials produce `inline-secret` findings. The detection patterns are implementation-defined.

### 8.8 Finding kinds

| Kind | Raised when |
| --- | --- |
| `invalid-blueprint` | The blueprint is missing, unparsable or fails validation |
| `forbidden-dependency` | A dependency violates a `forbid` rule |
| `allow-only-violation` | A dependency falls outside an `allow-only` rule |
| `layer-violation` | A lower layer depends on a higher one |
| `dependency-cycle` | Components form a cycle that a `no-cycles` rule prohibits |
| `undeclared-dependency` | An observed cross-component dependency is not in `dependencies` |
| `unmapped-file` | A source file belongs to no component |
| `empty-component` | A component's globs match no files |
| `protected-path` | A tripwire path changed |
| `verification-weakened` | A heuristic found weakened checks |
| `contract-weakened` | The blueprint was loosened |
| `contract-changed` | The blueprint changed without loosening |
| `secret-access` | A secret is read outside a `secret-access` rule's `allow` |
| `inline-secret` | A credential appears inline in an agent or tool configuration file |
| `agent-permission-change` | Agent permissions, MCP servers or instructions changed |
| `assurance-drift` | A declared `assurance` level is no longer supported by the repository |
| `stale-verification` | A sign-off predates changes to what it covers |
| `invariant-at-risk` | The change touches code or tests an invariant depends on |
| `invariant-failed` | An invariant's `check.run` failed |

## 9. Severity, scoring and the attention budget

**Severity.** Every finding is `error`, `warning` or `info`. Rule and invariant findings take the severity declared on the rule or invariant; policy findings take the level set in `policy`.

**Verdict.** With `--fail-on` set to `error` (the default), `warning` or `never`:

| Verdict | Condition | Exit code |
| --- | --- | --- |
| `fail` | At least one new finding at or above the `--fail-on` severity | 1 |
| `warn` | No failing finding, but at least one new finding that is a warning or an error | 0 |
| `pass` | Otherwise | 0 |

With `--fail-on never` the gate reports and never fails. Usage and configuration errors exit with 2.

**Score.** Each finding has a numeric `score`; a higher score means look first. Findings in every output are sorted by score, highest first. The score combines:

- severity (an error far outweighs a warning, a warning an info);
- whether the finding is new (pre-existing findings are heavily discounted);
- blast radius: how many components depend on the components involved;
- kind: contract weakening, weakened verification, inline secrets, failed invariants, secret access and agent permission changes rank above ordinary boundary violations;
- agent authorship, for the kinds listed in [8.6](#86-agent-authorship).

The weights are implementation-defined and may change between releases. Compare scores only within one report. The score never affects the verdict.

**Attention budget.** Human review is the scarce resource, and a report with two hundred findings is read by no one. `--budget <n>` (default 5) sets how many new findings are presented in full, with their rule, reason and `file:line` evidence. The rest are collapsed into grouped counts. The budget changes presentation only: it never changes the verdict, the exit code or the contents of the JSON and SARIF output. A budget of 0 shows counts only.

## 10. Output formats

`--format` selects what `check` prints (or writes to `--output <file>`). `--sarif-output <file>` writes SARIF in addition to the chosen format.

| Format | Purpose |
| --- | --- |
| `text` (default) | Terminal output. Leads with the verdict and the "needs your attention" list. Colored unless `--no-color` is passed or `NO_COLOR` is set. Control characters in repository-derived text are stripped. |
| `markdown` | The body of the pull request comment. Starts with the marker `<!-- rassam:blueprint-check -->`, which is how the gate finds and updates its one sticky comment instead of posting a new one for each push. Truncated to fit GitHub's comment size limit. |
| `json` | The complete report: `tool`, `generatedAt`, `mode`, `blueprint`, `base`, `head`, `summary`, `findings`, `impact`, `contractChanges`, `agentActivity`, `reach`, `approved`. The shape is `CheckReport` in `src/blueprint/types.ts`. Not affected by `--budget`. |
| `sarif` | SARIF 2.1.0 for GitHub code scanning and other viewers. One result per finding, with `score`, `isNew`, `components` and the blueprint rule ID in `properties`. |

`summary` holds: `errors`, `warnings`, `infos`, `newFindings`, `components`, `filesAnalyzed`, `filesMapped`, `filesUnmapped`, `componentEdges`, `undeclaredEdges`, `humanAuthoredRatio`.

Each finding holds: `id` (the stable fingerprint), `kind`, `severity`, `ruleId`, `title`, `message`, `reason` (the human-written reason from the rule), `components`, `locations` (`path`, `line`, `endLine`), `isNew`, `score`.

**GitHub mode** (`--github`) reads the pull request context from the Actions environment and, in addition to the selected format:

- emits workflow annotations (`::error`, `::warning`, `::notice`) for new findings, highest score first, capped at 50;
- writes the markdown report to the job's step summary;
- with `--comment`, creates or updates the sticky pull request comment (needs `pull-requests: write`);
- reads the approval label from the pull request.

## 11. MCP server

`rassam mcp` starts a Model Context Protocol server on stdio. It is how an agent learns the contract before it acts, instead of discovering it from a failed check afterwards. Tools return small, referenced answers (IDs, paths, line numbers) and not prose dumps.

| Tool | What it does | When an agent should call it |
| --- | --- | --- |
| `blueprint_overview` | Returns the system, its components, and counts of rules, invariants and decisions | Once, at the start of a task |
| `explain_path` | For a file path: the owning component, its intent, and the rules, invariants and decisions that apply | Before editing a file |
| `get_component` | One component in full: intent, paths, owners, declared dependencies in and out, rules, invariants, decisions, assurance and sign-off | Before changing a component's behavior or interface |
| `check_dependency` | Whether a dependency from one file or component to another (or to a package) is allowed, and which rule decides | Before adding an import |
| `impact` | For a set of paths: the components touched and the components that depend on them, nearest first | Before a change that crosses files, to size the blast radius |
| `check_changes` | Runs the gate on the current working tree and returns the findings | Before committing or opening a pull request |
| `list_decisions` | Architecture decisions, optionally filtered | When a constraint looks arbitrary and the reason matters |
| `architecture_diff` | What the working tree changed in the system design compared with a base: components and dependencies added or removed, dependencies whose status changed (declared, undeclared, forbidden, no longer observed), and one sentence summarizing it | Before reporting to the user what a change did to the architecture. It reports structure; `check_changes` reports violations. |
| `system_status` | The runtime status recorded in `.rassam/status.json`: overall summary, the state of every component that declares `runtime`, how old the data is and whether it is stale | When the task depends on what is running. It never probes anything itself, and stale data must be treated as unknown. |
| `propose_change` | Records a suggested blueprint change in `.rassam/proposals/` for a human to review | When the contract is wrong or out of date. Never by editing `blueprint.json` directly. |
| `report_conflict` | Records in `.rassam/escalations/` that the task cannot be completed without breaking the contract, and why | When the only ways forward are to violate a rule, weaken a check, or stop. The correct choice is to stop and report. |

Arguments in this version (the authoritative schemas are the ones the server publishes through `tools/list`; they may gain optional fields):

| Tool | Arguments |
| --- | --- |
| `blueprint_overview` | none |
| `explain_path` | `path` |
| `get_component` | `id` |
| `check_dependency` | `from_path`, `target` (a repository path or a package name such as `octokit` or `node:fs`) |
| `impact` | `paths` (1–500) |
| `check_changes` | `base` (optional; default: the repository's default branch). Includes uncommitted and untracked files. |
| `list_decisions` | `component` (optional) |
| `architecture_diff` | `base` (optional; default: the repository's default branch). Includes uncommitted and untracked files. |
| `system_status` | none |
| `propose_change` | `title`, `rationale`, `changes` (a precise description or a JSON patch), `agent` (optional) |
| `report_conflict` | `summary`, `details`, `rule_id`, `paths`, `agent` (see `tools/list` for which are required) |

All tools are read-only except `propose_change` and `report_conflict`, which write one file each and never touch `.rassam/blueprint.json`.

`propose_change` and `report_conflict` are the sanctioned alternatives to working around the contract. They write files; they change nothing the gate judges by. `rassam proposals` lists what is pending.

**Protocol versions.** The server supports two generations of the protocol so that it works with clients on either side of the transition:

- MCP 2025-11-25 and earlier (back to 2024-11-05): the stateful handshake, where the client sends `initialize` and then makes requests;
- MCP 2026-07-28: the stateless form, where each request carries its protocol version and client capabilities in `params._meta`, and `server/discover` replaces the handshake.

The server answers whichever the client uses.

**Advisory, not enforcing.** Nothing forces an agent to call these tools or to respect the answers. Enforcement is the gate's job. The server exists because an agent that knows the rules produces fewer violations to review.

## 12. CLI reference

```
rassam <command> [arguments] [--flag value]
```

Flags accept `--flag value` and `--flag=value`. Boolean flags accept `--no-flag`. `-h`/`--help` and `-v`/`--version` work everywhere. Every command except `schema` accepts `--root <dir>` (default: the git root of the current directory).

Exit codes: `0` success, `1` the check failed, `2` usage or configuration error. In full mode an invalid blueprint is a configuration error (2); in diff mode it is a finding of the change.

### `rassam init`

Derives a draft blueprint from the working tree and writes `.rassam/blueprint.json`, then offers to wire the repository up. The draft records only what static analysis can see, marked `derived`. Intent, rules and invariants are left for a human.

How the draft is cut into components (deterministic, at most 20 components plus Tests by default):

- The repository root is always split; then the largest folder with more than 40 source files is split, again and again, while the total stays within the budget. A split must yield at least two pieces of 10 or more files, otherwise the folder stays whole.
- One folder yields at most 10 components. Past that, only children with 10 or more files stay separate and the rest are merged into `<Folder> (other)` with explicit globs, so no file becomes unmapped. `benchmarks`, `bench`, `examples`, `docs`, `scripts`, `e2e`, `fixtures`, `testdata` and `migrations` are never split per child.
- Java, Kotlin and Scala sources under `src/main/<language>/` (also per module) are split by the subpackages of their base package, whatever their size.
- Root-level code is kind `core`, named after the module or package (Go `module`, Python and Rust package names); root-level files that are only configuration are kind `config`.
- Drafted rules: `no-component-cycles` (warning), `tests-are-leaves` when there are tests, and one `secret-access` rule per secret-like variable read by at most three components. When the code already breaks a drafted rule, `init` counts the violations and says they existed before the contract did (in a pull request only new violations fail).

Then, for each of `.mcp.json` (the MCP server, pinned to this version), `AGENTS.md` (the contract as prose between `<!-- rassam:agents:start -->` and `<!-- rassam:agents:end -->`, plus a `<!-- rassam:claude:start -->` block in `CLAUDE.md` that imports it) and `.github/workflows/rassam.yml` (the gate): in an interactive terminal `init` asks; elsewhere it writes only what the flags ask for. Every write is idempotent. Text outside the markers is never changed, an existing `rassam` MCP entry or workflow file is kept, and no second gate workflow is added when another workflow already runs it.

| Flag | Meaning |
| --- | --- |
| `--force` | Replace an existing blueprint with a fresh draft |
| `--name <name>` | System name (default: the directory name) |
| `--dry-run` | Print the draft and write nothing |
| `--yes` | Write all three files without asking |
| `--mcp`, `--agents`, `--workflow` | Write that file (`--no-mcp`, `--no-agents`, `--no-workflow` to skip it) |

With a blueprint already in place and no `--force`, `init` skips the draft and only wires up what the flags ask for; with none of them it refuses, as before.

### `rassam instructions`

States the contract in plain language in `AGENTS.md` (found in any letter case): the dependency rules with their reasons, the protected paths, where the named components live, the invariants, and standing orders (never skip, delete, loosen or rewrite a test, a CI step or a coverage threshold to make a check pass; never edit the blueprint to pass; if a task needs a rule broken, stop and say so, even when asked for the shortcut; run the check before finishing). The text is a pure function of the blueprint, so it is regenerated and compared to detect a stale block; `rassam check` notes when it is stale.

| Flag | Meaning |
| --- | --- |
| `--write` | Create or refresh the block (text outside the markers is kept) |
| `--check` | Exit `1` when the block is missing or out of date |
| `--file <path>` | Another instruction file |
| `--command <cmd>` | How agents run the CLI here (default: the command recorded in the existing block, else `npx -y @v0ightt/rassam@<version>`) |
| `--no-mcp` | Leave out the MCP tool sentences (they are included when `.mcp.json` configures a `rassam` server) |

### `rassam check`

Checks the repository, or a change, against the blueprint.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--base <ref>` | — | Diff mode: judge the change since the merge-base with `<ref>`, using the blueprint at that merge-base. Without it, full mode. |
| `--format <fmt>` | `text` | `text`, `markdown`, `json` or `sarif` |
| `--output <file>` | — | Write the report to a file instead of stdout |
| `--sarif-output <file>` | — | Additionally write a SARIF report |
| `--fail-on <level>` | `error` | `error`, `warning` or `never` |
| `--budget <n>` | 5 | Attention budget: findings shown in full |
| `--approved` | off | A human approved the weakening changes (contract or tests) in this change |
| `--run-invariants` | off | Run invariant `check.run` commands (from the base blueprint in diff mode) |
| `--invariant-timeout <seconds>` | 300 | Timeout for each invariant command |
| `--github` | off | GitHub Actions mode: pull request context, annotations, step summary |
| `--comment` | off | With `--github`: create or update the sticky pull request comment |
| `--approve-label <label>` | `rassam:approved` | With `--github`: the pull request label that counts as human approval |
| `--verbose` | off | List pre-existing findings and extra detail |
| `--no-color` | — | Disable colored output (also `NO_COLOR`) |

```
rassam check
rassam check --base origin/main
rassam check --github --comment --sarif-output rassam.sarif
```

### `rassam explain <path>`

Shows what the blueprint says about a path: owning component, intent, applicable rules, invariants and decisions. `--format text|json`.

### `rassam impact <paths...>`

Shows the blast radius of changing the given paths: components touched and their transitive dependents with distance. `--format text|json`.

### `rassam graph`

Prints the component graph with declared, undeclared and forbidden edges. `--format mermaid|dot|json` (default `mermaid`).

### `rassam verify <id>`

Records a human sign-off on a component, rule, dependency or invariant by writing its `verified` stamp with the current commit. `<id>` is a component, rule or invariant ID, looked up in that order, or `<from>-><to>` for a dependency (quote it in a shell: `rassam verify "api->db"`).

| Flag | Meaning |
| --- | --- |
| `--by <name>` | Who is signing (default: `git config user.name`) |
| `--note <text>` | What was checked |

The stamp lands in `.rassam/blueprint.json` and is reviewed in a pull request like any other change.

### `rassam sync`

Keeps the blueprint in step with the code. Proposes a component for each cluster of source files no component claims, and declares each observed dependency that is not declared, all with `provenance.source: "derived"`. It never changes or removes an existing fact, and never moves a file out of the component that owns it (a proposed component that would do so is narrowed to the exact unclaimed files). Dry run by default.

| Flag | Meaning |
| --- | --- |
| `--write` | Apply the additions to `.rassam/blueprint.json` |
| `--no-components` | Do not propose components |
| `--no-dependencies` | Do not declare dependencies |
| `--format text\|json` | Output format |

### `rassam render`

Draws the system design as files a README can show. The output is a function of the blueprint, the code and the status file; no model is involved. A file whose content did not change is not rewritten, and the time is drawn into the pictures only with `--stamp`, so the same commit always gives the same pictures. How to publish them on every push is described in [live-system-design.md](live-system-design.md).

Written to `--out`:

| File | Content |
| --- | --- |
| `system-light.svg`, `system-dark.svg` | The diagram: components as cards, dependencies as arrows (declared, undeclared, forbidden, declared but not observed), violation counts, runtime status, and with `--base` what the change added or removed. Self-contained: no scripts, no external resources. |
| `badge-blueprint.svg` | `blueprint: passing`, `N warnings` or `failing` |
| `badge-system.svg` | `system: operational`, `degraded`, `outage`, `no data` or `not monitored` |
| `system.json` | The same information for programs: `schemaVersion`, `system`, `commit`, `generatedAt`, `verdict`, `summary`, `graph` (the component graph), `status` (or `null`), `base` and `diff` (or `null`). Only `generatedAt` differs between two runs on the same input, and that alone does not cause a rewrite. |

| Flag | Meaning |
| --- | --- |
| `--out <dir>` | Output directory. Default `.rassam/live`. |
| `--theme light\|dark\|both` | Which diagrams to write. Default `both`. |
| `--detail calm\|full` | `calm` (default) leaves out test components, edges into `public` components and declared dependencies already implied by a longer declared path, and says so in a footnote. Undeclared, forbidden and unobserved dependencies and everything the change touched are always drawn. `full` draws everything. |
| `--base <ref>` | Highlight what changed in the architecture since the merge-base with `<ref>` (working tree included) |
| `--status <file>` | Runtime status to overlay. Default: `.rassam/status.json` when it exists. |
| `--status-max-age <minutes>` | Status older than this is drawn as "No data". Default 60. |
| `--stamp` | Draw the time (of the status, else of the run) into the diagrams |
| `--readme [file]` | Update the block between `<!-- rassam:system:start -->` and `<!-- rassam:system:end -->` in `README.md` (or `<file>`). Without the markers the command prints them and changes nothing. A block that differs only in its time is left alone. |
| `--image-base <url\|path>` | Where the README loads the images from. Default: the `rassam-live` branch on `raw.githubusercontent.com` when the origin is on github.com, else the path from the README to `--out`. |
| `--link <url>` | Where the README picture links to. Default: the repository URL. |
| `--format svg\|mermaid\|json` | `svg` (default) writes the files. `mermaid` prints the graph as Mermaid and `json` prints `system.json`; both write no files. |

Violations are shown in the picture and do not fail the command. Exit codes: `0` rendered, `2` usage or configuration error.

### `rassam status`

Probes the `runtime` each component declares (see [4.3](#runtime-where-a-component-runs)) and reports what is running.

| Signal | How it is read | up | degraded | down | unknown |
| --- | --- | --- | --- | --- | --- |
| `health` | One `GET` or `HEAD` request from the machine running the command | 2xx, or exactly `expectStatus` | any other status below 500 | 5xx, timeout, network error | URL refused (not http(s), or contains credentials) |
| `deployment` | Latest deployment of the environment and its latest status, from the GitHub API | `success` | `in_progress`, `queued`, `pending`, `waiting` | `failure`, `error` | no deployment, `inactive`, API not reachable |
| `workflow` | Latest run of the workflow file on the default branch, from the GitHub API | `success` | run not finished | `failure`, `timed_out`, `startup_failure` | no run, cancelled or skipped, API not reachable |

The worst signal decides the component's state; a signal without data never hides one that has it. GitHub is asked only with `--github` or when `GITHUB_TOKEN` is set, for the repository named by `GITHUB_REPOSITORY` or the `origin` remote. Response bodies of health checks are never read or printed, and the recorded URL drops the query string.

| Flag | Meaning |
| --- | --- |
| `--write` | Save the result to `.rassam/status.json`. Nothing is written when no component declares `runtime`. |
| `--format text\|json` | A table and an overall line, or the status file's JSON |
| `--timeout <ms>` | Timeout of each request, 100–60,000. Default 5,000. |
| `--github` | Read deployments and workflow runs from the GitHub API |
| `--fail-on-down` | Exit 1 when a component is down |

Exit codes: `0` always, unless `--fail-on-down` and a component is down (`1`); `2` usage or configuration error. In GitHub Actions the command also sets the step outputs `monitored` (number of components with `runtime`) and `overall`.

`.rassam/status.json`:

```json
{
  "version": 1,
  "checkedAt": "2026-05-01T14:05:09Z",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "components": {
    "api": {
      "state": "up",
      "source": "health-check",
      "detail": "HTTP 200 in 84 ms; production: success at 0123456",
      "latencyMs": 84,
      "url": "https://api.example.com/healthz",
      "checkedAt": "2026-05-01T14:05:09Z"
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `version` | `1` |
| `checkedAt` | ISO-8601 time of the probe run. Readers treat a status older than their threshold (30 minutes in the MCP server, 60 in `rassam render`) as unknown. |
| `commit` | Optional. The commit that was checked out when the probe ran. |
| `components.<id>.state` | `up`, `degraded`, `down` or `unknown` |
| `components.<id>.source` | The signal that decided the state: `health-check`, `deployment`, `workflow` or `manual` |
| `components.<id>.detail`, `latencyMs`, `url`, `checkedAt` | Optional. A short description of every signal, the latency of the health check, its URL without the query string, and the time of this component's probe. |

The file is strict: unknown keys are rejected. It is written with components sorted by id and a fixed key order.

### `rassam do "<instruction>"`

Changes the blueprint from a plain-language instruction, for example `rassam do "forbid ui from importing db because pages go through the API"`. The instruction is parsed by fixed rules, not by a model: the same words always give the same typed edits. Several instructions can be joined with `;`. Quote the instruction so the shell passes it as one argument.

The command prints how it understood the instruction and one line per edit. It is a dry run unless `--write` is given. New facts are recorded with `provenance.source: "human"`, `by` set to `--by` or `git config user.name`, and the current time.

| Flag | Meaning |
| --- | --- |
| `--write` | Save the change to `.rassam/blueprint.json` |
| `--allow-weakening` | Allow an instruction that loosens the contract (removing a rule, lowering a severity, and so on). Without it such an instruction is refused. The flag only lets the edit into the file: in a pull request the gate still reports `contract-weakened` until a human approves it ([8.3](#83-contract-changes)). |
| `--choose <n>` | Pick option `<n>` when the instruction is ambiguous |
| `--by <name>` | Who is making the change |
| `--format text\|json` | Output format |

Exit codes: `0` understood (and saved with `--write`); `2` when the instruction is ambiguous (the options are listed), not understood (examples are listed), refused as weakening, or cannot be applied.

### `rassam reach`

Summarizes what coding agents can reach: MCP servers, permissions, inline secrets, environment access. `--format text|json`.

### `rassam proposals`

Lists pending agent proposals and escalations. `--format text|json`.

### `rassam schema`

Prints the JSON Schema of `.rassam/blueprint.json`.

### `rassam mcp`

Starts the MCP server on stdio. See [section 11](#11-mcp-server).

## 13. Security model

The gate runs with access to a repository and sometimes a token, on changes that may be written by an agent or an outside contributor. Its guarantees:

- **The change cannot choose its own rules.** In diff mode everything the gate enforces comes from the base blueprint ([8.1](#81-the-change-is-judged-by-the-base-blueprint)).
- **Invariant commands come only from the base blueprint.** `check.run` is arbitrary shell. It runs only with `--run-invariants`, and in diff mode only as written at the merge-base, so a pull request cannot introduce a command and have the gate execute it. A command added in a pull request first runs after a human has merged it. In full mode the commands come from the working tree: run `--run-invariants` only on a tree you trust.
- **Secrets are never printed.** Reach analysis reports environment variable names and locations. An inline credential is shown as a redacted preview (prefix, suffix and length), never in full, in every output format. The contents of `.env` files are not read.
- **Approval is out of band.** A weakening change, to the contract or to the tests, is approved by a label on the pull request or by an explicit flag from whoever runs the command, never by content inside the change.
- **Proposals are never applied automatically.** `propose_change` and `report_conflict` write files under `.rassam/proposals/` and `.rassam/escalations/`. Only a human editing `blueprint.json`, in a change that itself passes through the gate, alters the contract.
- **Local first.** The CLI and the canvas work on the local checkout. The CLI makes network requests only in `--github` mode, to the GitHub API, to read pull request labels and write the comment. No repository content is sent to a model or to a Rassam service.
- **Untrusted text is treated as data.** Paths, commit messages and file contents shown in reports are stripped of control characters and escaped, so repository content cannot forge terminal output, annotations or comment structure.

Limits to be aware of:

- The gate judges by the base blueprint, but it executes its own code. In CI, run a pinned release of the action, not a copy of the gate that the pull request can modify.
- Static analysis sees imports and environment reads that are written plainly. Dependencies built at run time (computed import paths, reflection, dependency injection by string) are not seen.
- Agent authorship detection and the verification heuristics are heuristics. They reduce what a reviewer has to find unaided; they do not replace review.

## 14. Versioning and compatibility

- `version` is the string `"0.1"`. A tool that implements 0.1 rejects any other value.
- Within 0.x, changes to the format are intended to be additive: new optional fields, new rule kinds, new enum values. A change that alters the meaning of existing content gets a new `version` value.
- **Unknown fields are rejected.** Validation in 0.1 is strict at every level. This is deliberate, for three reasons:
  1. *A typo must not silently disable a rule.* With lenient parsing, `"serverity": "error"` or `"form": "web"` would be ignored and the rule would quietly mean something else. In a contract, failing loudly is the safe behavior.
  2. *The contract is an attack surface.* Agents edit repositories. Rejecting unknown fields means nothing can be placed in the file that the gate does not understand and account for in its semantic diff.
  3. *It keeps additions unambiguous.* A field introduced in a later version cannot collide with ad hoc keys already in use.
- The consequence: a blueprint that uses a field from a later version does not validate with an older tool. Upgrade the tool before, or in the same change as, the blueprint. For free-form annotations use the fields provided for them: `description`, `intent`, `reason`, `note`, `tags`, `links`.
- Defaults are part of the version. A file that omits `policy` means the 0.1 defaults listed in [4.2](#42-policy).

## 15. JSON Schema

- In the repository: `schema/blueprint-0.1.schema.json` (JSON Schema draft 2020-12), generated from `src/blueprint/schema.ts` by `npm run blueprint:schema`. Do not edit it by hand.
- Published identifier (`$id`), for the `$schema` key of a blueprint: `https://raw.githubusercontent.com/V0ightt/Rassam/main/schema/blueprint-0.1.schema.json`.
- From the CLI: `rassam schema`.

The schema describes the file as authored: fields with defaults are optional. It cannot express the referential checks in [4.8](#48-validation-beyond-the-json-schema), so a file that validates against the schema can still be rejected by `rassam check`.
