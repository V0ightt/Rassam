# Rassam Roadmap v2 - From Repo Visualizer to Bidirectional System Design Workspace

> [!IMPORTANT]
> **Updated vision**: Turn Rassam into a local-first engineering workspace where architecture graphs, code, and execution state stay in sync with reversible history.

---

## 0) Reality Check (Current Implementation Baseline)

This roadmap is based on the current codebase status, not assumptions.

### Already Implemented (and should be treated as completed foundation)
- Multi-provider LLM abstraction with adapters (`deepseek`, `openai`, `anthropic`, `google`, `ollama`) under `src/lib/llm/`.
- Provider registry with environment-based selection and tests (`registry.test.ts`).
- Core GitHub flow: fetch repo tree, AI grouping, dagre layout, render via React Flow.
- AI-assisted chat with repo/node context and README/file content retrieval logic.
- Manual graph editing capabilities: add/edit/delete nodes, custom edges, relayout, export (PNG/SVG/JSON).
- Project/session persistence in browser `localStorage` (project list + chat sessions).

### Gaps and Risks (must be addressed before major expansion)
- **Quality gate is red**: lint currently reports significant type and hook-rule issues.
- No typed graph document schema (`GraphDoc`) and no migration/versioning system.
- Local workspace support is missing (still GitHub-only data source).
- No Local Agent Service (LAS) for filesystem/git/terminal.
- No reversible sync engine or snapshot-based history model.
- No true tabbed graph model with parent-child graph navigation.
- Current state persistence is browser-local, not in-repo portable metadata.

### Strategy Shift
- Keep ambitious long-term direction.
- Re-sequence execution to first stabilize and formalize data contracts.
- Deliver user-visible value each phase without accruing hidden architecture debt.

---

## 1) Guiding Product and Architecture Principles (Locked)

- **Local-first architecture**: local project workflows are first-class, not secondary.
- **Reversible by default**: every graph/code sync operation produces a restorable snapshot.
- **Portable state**: canonical project state lives in `.rassam/` inside the project.
- **Provider-agnostic AI**: all AI operations run through the LLM abstraction.
- **Permissioned execution**: all filesystem/git/terminal actions route through LAS with explicit policy.
- **Ship thin vertical slices**: each release must be usable end-to-end.

---

## 2) Program Structure (Execution Tracks)

All phases are delivered through parallel tracks with explicit owners/checkpoints:

1. **Platform Track**: GraphDoc, LAS, storage, sync, migration engine.
2. **Canvas Track**: tabs, node UX, templates, specialized editors.
3. **Code Sync Track**: graph-to-code generation and code-to-graph reconciliation.
4. **Runtime Track**: terminal execution, run/test status overlays.
5. **Agent Track**: mode system, permissions, approval UX.
6. **Reliability Track**: types, lint, tests, telemetry, error handling.

---

## 3) Phased Roadmap (Revised)

## Phase A - Stabilization and Contract Hardening (Immediate)
**Objective**: Establish engineering reliability and strong contracts before local-workspace expansion.

### Deliverables
- [x] Fix lint/type issues in critical paths (`app`, `api`, `types`, core components).
- [x] Replace broad `any` usage with typed DTOs for nodes/edges/chat payloads.
- [x] Add strict API response schemas and runtime validation for `/api/repo` and `/api/chat`.
- [x] Introduce baseline error taxonomy (provider error, GitHub error, parse error, permission error).
- [x] Expand test coverage around provider registry and API request/response shaping.

### Acceptance Criteria
- [x] `npm run lint` passes with zero errors.
- [x] `npm run test` passes and includes API contract tests.
- [x] API routes reject malformed input with deterministic error payloads.

### Exit Artifacts
- Typed domain models for graph analysis payloads.
- Reliability checklist for future phases.

---

## Phase B - GraphDoc Foundation and Persistence (Core Platform)
**Objective**: Move state from browser-only persistence to portable, versioned project state.

### Deliverables
- [ ] Define `GraphDoc` schema (`version`, `graphs`, `tabs`, `nodes`, `edges`, `templates`, `techStack`, `meta`).
- [ ] Add migration engine (`v1 -> v2` style) with backward compatibility helpers.
- [ ] Create `.rassam/` layout:
  - [ ] `.rassam/graph.json`
  - [ ] `.rassam/history/`
  - [ ] `.rassam/settings.json`
- [ ] Add serialization/deserialization boundaries and schema validation.
- [ ] Keep browser storage as fallback cache, not source of truth.

### Acceptance Criteria
- Graph edits survive reload through `GraphDoc` persistence.
- Older `GraphDoc` versions migrate automatically.
- Corrupt docs fail safely with recovery prompt and fallback path.

### Exit Artifacts
- Formal schema docs and migration test fixtures.

---

## Phase C - Local Agent Service (LAS) and FileSystem Abstraction
**Objective**: Enable secure local project access and decouple data source from GitHub-only flow.

### Deliverables
- [ ] Define `IFileSystem` abstraction (`readDir`, `readFile`, `writeFile`, `stat`, `watch`).
- [ ] Implement providers:
  - [ ] `GitHubProvider` (current behavior wrapped)
  - [ ] `LocalAgentProvider` (LAS-backed)
- [ ] Build LAS skeleton (HTTP or IPC) with scoped root access.
- [ ] Implement LAS endpoints:
  - [ ] `fs.list`, `fs.read`, `fs.write`
  - [ ] `git.status`, `git.diff`, `git.commit`
  - [ ] `cmd.run`
- [ ] Add permission prompts and per-project policy storage.

### Acceptance Criteria
- User can open local folder and generate graph via LAS.
- All LAS calls are blocked outside approved project root.
- Permission decisions are explicit and auditable.

### Exit Artifacts
- LAS API spec and threat model summary.

---

## Phase D - Reversible Sync Engine (Code <-> Graph)
**Objective**: Make every sync operation inspectable and reversible.

### Deliverables
- [ ] Add graph dirty-state model (`graphDirty`, `codeDirty`, `syncNeeded`).
- [ ] Implement snapshot creation on sync:
  - [ ] GraphDoc snapshot
  - [ ] Working tree diff snapshot
  - [ ] Optional AI summary of changes
- [ ] Build diff viewer (graph changes + file changes).
- [ ] Implement one-click revert to snapshot.
- [ ] Add conflict states when graph and code diverge.

### Acceptance Criteria
- Any sync action creates a recoverable snapshot.
- Revert restores both graph and filesystem state (within permission scope).
- Dirty indicators are accurate and deterministic.

### Exit Artifacts
- Snapshot format spec under `.rassam/history/`.

---

## Phase E - System Design Canvas v1 (Tabbed, Structured Editing)
**Objective**: Evolve canvas from flat visualizer into multi-graph design workspace.

### Deliverables
- [ ] Multi-tab graph model (`Main`, `Frontend`, `Backend`, `Database`, custom tabs).
- [ ] Node deep dives via `childGraphId` and node double-click navigation.
- [ ] Global node template registry shared across tabs.
- [ ] Rich node description editing (inline + side panel).
- [ ] Tech Stack singleton node in `Main` graph.

### Essential Node Palette v1
- [ ] Frontend, Backend, Database Schema
- [ ] API Gateway, Load Balancer, Cache, Queue, Storage
- [ ] CDN, Firewall, External API
- [ ] Container (Docker), Orchestrator (Kubernetes)

### Acceptance Criteria
- Users navigate tabs as architecture document sections.
- Node metadata persists in GraphDoc and reloads accurately.
- Template-created nodes are consistent across tabs.

---

## Phase F - Specialized Node Editors and Typed Domain Data
**Objective**: Make critical nodes actionable, not just visual.

### Deliverables
- [ ] API Node editor: endpoint table (method/path/params/response/errors).
- [ ] Database Node editor: schema DSL or SQL input with validation.
- [ ] Infra Node editor: replicas/ports/env/image/autoscaling fields.
- [ ] Validation rules per editor with user-friendly errors.
- [ ] Persist typed editor data in GraphDoc.

### Acceptance Criteria
- Structured data round-trips without loss.
- Validation blocks invalid configurations before sync/generation.

---

## Phase G - Graph-to-Code and Code-to-Graph Sync v1
**Objective**: Enable practical bidirectional evolution between architecture and code.

### Deliverables
- [ ] Graph-to-code scaffolding for a minimal app skeleton.
- [ ] Rules engine for safe file generation and import wiring.
- [ ] Edge semantics mapped to code relationships (calls/imports/dependency).
- [ ] Incremental code-to-graph updates from watched file diffs.
- [ ] Conflict resolution UI when inferred graph differs from user intent.

### Acceptance Criteria
- Small graph generates runnable project skeleton.
- File edits trigger targeted graph updates without full rebuild.
- Conflict prompts appear only on meaningful divergence.

---

## Phase H - Execution Loop (Terminal-Connected Design Runtime)
**Objective**: Run code/tests from architecture context and reflect status on canvas.

### Deliverables
- [ ] Multi-tab terminal UI backed by LAS PTY.
- [ ] Node-level run/test actions.
- [ ] Status overlays on nodes (success/fail/running).
- [ ] Structured parsing of test/build output into graph annotations.

### Acceptance Criteria
- Users run project tasks without leaving workspace.
- Node status reflects latest execution result with timestamp.

---

## Phase I - Agent Modes and Permission Model
**Objective**: Introduce safe autonomy levels with explicit boundaries.

### Deliverables
- [ ] Modes: `Planner`, `Agent`, `Ask`, `Researcher`.
- [ ] Per-tool permission controls and approval policies.
- [ ] Rate limiting and audit log for LAS actions.
- [ ] Mode-specific UI indicators and guardrails.

### Acceptance Criteria
- Every privileged operation is policy-checked.
- User can inspect and revoke permissions per project.

---

## Phase J - Advanced and SaaS Tracks (Post-Core)
**Objective**: Scale beyond solo local workflows after core loop is stable.

### Advanced
- [ ] Dream mode (prompt -> initial system design graph).
- [ ] Self-healing graph suggestions.
- [ ] Collaborative editing model evaluation.

### SaaS / Enterprise
- [ ] Authentication and cloud sync for GraphDoc history.
- [ ] Quotas/subscriptions.
- [ ] Team workflows (PR linkage, hosted projects).

---

## 4) Milestone Gates (Go/No-Go)

### Gate 1 - Stability Gate
- Lint/test green, typed API contracts, deterministic error handling.

### Gate 2 - Persistence Gate
- GraphDoc + migration + recovery path proven.

### Gate 3 - Local Workspace Gate
- LAS + permissions + local project graphing working end-to-end.

### Gate 4 - Reversible Sync Gate
- Snapshot, diff, revert functional and trusted.

### Gate 5 - Bidirectional MVP Gate
- Graph-to-code and incremental code-to-graph round-trip for minimal app.

---

## 5) Risks and Mitigations

### Technical Risks
- **Schema churn**: frequent GraphDoc changes can break history compatibility.
  - Mitigation: explicit versioning + migration tests from day one.
- **Agent safety**: LAS misuse could impact local filesystem.
  - Mitigation: root scoping, per-tool permissions, explicit approvals, audit log.
- **Model inconsistency**: different providers return different structure quality.
  - Mitigation: provider-normalized post-processing + validation + retries.
- **UX complexity creep**: too many controls can overwhelm solo users.
  - Mitigation: progressive disclosure and sensible defaults.

### Delivery Risks
- **Overbuilding before usage feedback**.
  - Mitigation: ship vertical slices with strict acceptance criteria per phase.
- **Reliability debt blocking velocity**.
  - Mitigation: mandatory quality gate at start of roadmap.

---

## 6) Updated Non-Goals (Near-Term)

- No enterprise compliance/SSO before local-first core is proven.
- No broad plugin marketplace before GraphDoc and LAS stabilize.
- No cloud-first storage as primary path before reliable local reversible sync.

---

## 7) Next 5 Execution Sprints (Actionable)

## Sprint 1 - Stability Baseline
- [x] Resolve current lint/type errors.
- [x] Add API input/output validation.
- [x] Add regression tests for provider selection and API contracts.

## Sprint 2 - GraphDoc v1
- [ ] Implement schema, migration framework, and persistence adapter.
- [ ] Move current project/session state into GraphDoc-compatible model.

## Sprint 3 - LAS Skeleton
- [ ] Implement minimal LAS with `fs.list` and `fs.read`.
- [ ] Add local folder open flow and permission prompts.

## Sprint 4 - Reversible Sync MVP
- [ ] Dirty-state + sync button.
- [ ] Snapshot creation and restore for graph + file changes.

## Sprint 5 - Tabbed Canvas v1
- [ ] Add tab model, child graph navigation, template registry.
- [ ] Persist tab/node metadata in GraphDoc.

---

## 8) Definition of Done (Program-Level)

Feature work is complete only when all are true:
- [ ] User-visible flow works end-to-end.
- [ ] Data model is versioned and migration-safe.
- [ ] Permission model is enforced for local actions.
- [ ] Lint/tests pass.
- [ ] Docs updated (`README.md`, `agents.md`, and roadmap).

---

## 9) Immediate Priority Order (Updated)

1. Stabilize code quality and typing baseline.
2. Implement GraphDoc schema + migration + persistence.
3. Build LAS skeleton and local workspace support.
4. Add reversible sync and history viewer.
5. Deliver tabbed system design canvas and typed node editors.
6. Ship bidirectional graph-code MVP.

This sequence maximizes delivery speed while reducing long-term architecture risk.