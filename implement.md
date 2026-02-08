# Implementation Plan (Phase 0 to Phase 6)

This plan follows the Immediate Next Steps ordering from [roadmap.md](roadmap.md) and targets Windows-first for the Local Agent Service (LAS). Each phase includes verification checkpoints and dependencies.

## Phase 0: Modular Core

### 0.1 LLMProvider abstraction
- Goal: Support multiple providers behind one interface (DeepSeek, OpenAI, Anthropic, Google, Ollama).
- Deliverables:
  - `src/lib/llm/` with a provider interface and adapters.
  - Settings model for provider selection and API keys (UI wiring can be minimal in Phase 0).
  - Replace direct DeepSeek usage with provider selection.
- Steps:
  1) Add `LLMProvider` interface with `generateStructure()` and `chat()` methods.
  2) Implement adapters: `DeepSeekAdapter`, `OpenAIAdapter`, `AnthropicAdapter`, `GoogleAdapter`, `OllamaAdapter`.
  3) Add a provider registry and simple selection (env based is OK initially).
  4) Update analysis and chat calls to go through `LLMProvider`.
- Dependencies: None.
- Verification:
  - Unit tests for provider selection.
  - Manual test: analysis and chat still work with DeepSeek.

### 0.2 FileSystemProvider abstraction
- Goal: Decouple file access from GitHub only.
- Deliverables:
  - `IFileSystem` interface with `readDir()`, `readFile()`, `writeFile()`.
  - `GitHubProvider` adapter that uses existing GitHub API calls.
  - Stub `LocalAgentProvider` for LAS integration.
- Steps:
  1) Define `IFileSystem` interface and provider registry.
  2) Wrap existing GitHub logic into `GitHubProvider`.
  3) Add `LocalAgentProvider` with mocked or placeholder transport.
  4) Update repo analysis pipeline to accept a provider instance.
- Dependencies: None.
- Verification:
  - Unit tests for provider method contracts.
  - Manual test: GitHub repo analysis still works.

### 0.3 Local Agent Service (LAS) skeleton
- Goal: Provide local filesystem, git, and terminal access for Windows.
- Deliverables:
  - Minimal service process that exposes scoped endpoints: `fs.read`, `fs.write`, `fs.list`, `git.status`, `git.diff`, `git.commit`, `cmd.run`.
  - Project-scoped permissions and allowlist.
  - File watcher that emits change events.
- Steps:
  1) Define LAS protocol (HTTP or IPC) and request/response schema.
  2) Implement a Windows-first local service skeleton.
  3) Add a lightweight permission gate per project and per tool.
  4) Add file watcher events and a client stub for the UI.
- Dependencies: 0.2 for `LocalAgentProvider` shape.
- Verification:
  - Manual: read and list operations on a local folder.
  - Manual: permission gating prompts.

### 0.4 GraphDoc schema
- Goal: Persist graph state and metadata in `.rassam/`.
- Deliverables:
  - GraphDoc schema with versioning and migrations.
  - Read/write helpers for `.rassam/graph.json`.
- Steps:
  1) Define schema types: graphs, tabs, nodes, edges, templates, techStack.
  2) Add versioned migrations and validation.
  3) Create helpers for load, save, and upgrade.
- Dependencies: None.
- Verification:
  - Unit tests for schema validation and migrations.
  - Manual: graph load/save roundtrip.

## Phase 1: Local Workspace + Versioned Sync

### 1.1 Workspace selector + project store
- Goal: Switch between local projects and load their GraphDoc state.
- Deliverables:
  - Project selector backed by LAS.
  - `.rassam/` layout: `graph.json`, `history/`, `settings.json`.
  - Per-project chat and graph context isolation.
- Steps:
  1) Add project store to track current project metadata.
  2) Hook LAS to open a local folder and read `.rassam/` state.
  3) Persist settings and per-project chat history.
- Dependencies: Phase 0.3 and 0.4.
- Verification:
  - Manual: switching projects swaps graph and chat context.

### 1.2 File watcher + incremental updates
- Goal: Update graph from local file changes without full re-run.
- Deliverables:
  - LAS watcher events (add/change/delete).
  - Incremental analysis for affected nodes only.
- Steps:
  1) Subscribe to LAS file events per project.
  2) Map file changes to affected nodes.
  3) Re-run analysis for changed nodes only.
- Dependencies: Phase 0.3 and 0.4.
- Verification:
  - Manual: update a file and observe graph changes.

### 1.3 Sync + history (reversible)
- Goal: Every sync creates a reversible snapshot.
- Deliverables:
  - Always-visible sync button when dirty.
  - Confirmation dialog for sync.
  - Snapshot storage in `.rassam/history/` (GraphDoc + working tree diff).
  - Diff viewer and one-click revert.
- Steps:
  1) Track graph and filesystem dirty state.
  2) Capture snapshots on sync.
  3) Add diff viewer and revert flow.
- Dependencies: Phase 0.3, 0.4.
- Verification:
  - Manual: sync, view diff, revert.

## Phase 2: System Design Canvas

### 2.1 Tabbed graphs
- Goal: Multi-tab graphs for system design surfaces.
- Deliverables:
  - Tab bar with keyboard navigation.
  - Double-click node to open child graph.
  - Shared templates across tabs.
- Steps:
  1) Extend GraphDoc to support tabs and child graphs.
  2) Add tab UI and navigation bindings.
  3) Wire node double-click to open child graph.
- Dependencies: Phase 0.4.
- Verification:
  - Manual: create tabs and navigate graphs.

### 2.2 Rich node editor
- Goal: Nodes support instructions and attachments.
- Deliverables:
  - Inline editor in nodes.
  - Side panel editor for long descriptions.
  - Tech Stack node (singleton, main tab only).
  - Custom node options: allow/deny images, long text area descriptions, multiple connection points, and opening a child flowchart (default: text area on, others off).
- Steps:
  1) Extend node data model for instructions and attachments.
  2) Add inline editor with persisted state.
  3) Add side panel editor for long-form content.
- Dependencies: Phase 0.4.
- Verification:
  - Manual: edit and persist node instructions.

### Notes / Risks
- Roadmap calls out media references for Frontend page nodes, but Phase 2.2 deliverables do not include that capability.

### 2.3 Essential system design nodes (v1)
- Goal: Add minimal, high-value node set.
- Deliverables:
  - Node palette entries for Frontend, Backend, Database Schema, API Gateway, Load Balancer, Cache, Queue, Storage, CDN, Firewall, External API, Docker, Kubernetes.
- Steps:
  1) Extend node category types and icons.
  2) Add color and minimap support for new categories.
  3) Add palette items and defaults.
- Dependencies: Phase 2.2.
- Verification:
  - Manual: create nodes and see correct styles.

### 2.4 Specialized node UIs (v1)
- Goal: Typed editors for critical nodes.
- Deliverables:
  - API node editor (endpoints table).
  - Database node editor (schema or SQL input).
  - Infra node editor (replicas, ports, env vars, image, scaling).
- Steps:
  1) Define typed data models for specialized nodes.
  2) Add modal or panel editors with validation.
  3) Persist into GraphDoc.
- Dependencies: Phase 2.2.
- Verification:
  - Manual: edit and persist specialized data.

## Phase 3: Bidirectional Graph to Code

### 3.1 Graph to code generation
- Goal: Node edits scaffold and refactor code safely.
- Deliverables:
  - Rules engine for safe scaffolding.
  - Edge direction drives imports and call direction.
- Steps:
  1) Define scaffolding rules per node type.
  2) Add file generators and import wiring.
  3) Add preview and confirmation flow.
- Dependencies: Phase 1.3.
- Verification:
  - Manual: generate a tiny app skeleton.

### 3.2 Code to graph updates
- Goal: Graph stays in sync with code changes.
- Deliverables:
  - Update nodes from diffs or summaries.
  - Conflict UI for mismatched changes.
- Steps:
  1) Detect code changes and summarize impacts.
  2) Update nodes or prompt for conflict resolution.
- Dependencies: Phase 1.2 and Phase 3.1.
- Verification:
  - Manual: change code and reconcile graph.

## Phase 4: Execution Loop

### 4.1 Integrated terminal
- Goal: Terminal tabs in the app with LAS PTY.
- Deliverables:
  - Terminal tabs in center view.
  - Per-project command permission gating.
- Steps:
  1) Expose a PTY interface in LAS.
  2) Add terminal UI with tabs and session state.
  3) Add per-command permissions.
- Dependencies: Phase 0.3.
- Verification:
  - Manual: run a command and see output.

### 4.2 Context-aware run
- Goal: Run scripts from nodes and show results on the graph.
- Deliverables:
  - Run and test buttons on relevant nodes.
  - Status overlays (pass/fail/build errors).
- Steps:
  1) Add run/test actions to nodes.
  2) Map node actions to scripts or tasks.
  3) Display output status overlays.
- Dependencies: Phase 4.1.
- Verification:
  - Manual: run and see status on node.

## Phase 5: Agent modes and permissions

### 5.1 Modes and permissions
- Goal: Planner, Agent, Ask, Researcher with explicit approvals.
- Deliverables:
  - Mode selector with capability gating.
  - Per-tool permission UI and rate limits.
- Steps:
  1) Define capability matrix by mode.
  2) Enforce permissions on LAS actions.
  3) Add UI for tool permissions.
- Dependencies: Phase 0.3.
- Verification:
  - Manual: verify mode restrictions.

## Phase 6: Advanced features (long-term)

- Dream mode: natural language to graph prototypes.
- Self-healing graph: detect broken edges and repair.
- Collaboration: CRDT-based multi-user graph editing.

### Steps
1) Define success criteria and prototype scope for each feature.
2) Build isolated prototypes to validate feasibility.
3) Merge into main product after core loop is stable.

### Verification
- Prototype demos and usability checks per feature.
