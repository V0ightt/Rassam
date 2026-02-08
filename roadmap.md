# Feature Roadmap: Rassam - The System Design Coding Environment

> [!IMPORTANT]
> **Vision**: Move from a passive repository visualizer to a bidirectional system design coding environment where graphs and code evolve together. This is the new age of coding: deliberate system planning, rapid iteration, and real execution with AI assistance.

## Guiding Decisions (Locked In)
- **Local Agent Service (LAS)**: A local companion service provides filesystem, git, and terminal access.
- **Sync is reversible**: Every sync creates a history entry that can be diffed and reverted.
- **GraphDoc in-repo**: State lives in `.rassam/` to keep projects portable and versionable.
- **Essential system design nodes first**: Ship a minimal, high-value node set before expanding.
- **Solo dev velocity first**: Optimize for fast feedback and lightweight setup.

## Main Roadmap (All Phases)
1. **Phase 0: Modular Core** - Provider abstractions, GraphDoc schema, LAS skeleton.
2. **Phase 1: Local Workspace + Reversible Sync** - Project store, file watching, history.
3. **Phase 2: System Design Canvas** - Multi-tab graphs, node templates, rich editing.
4. **Phase 3: Bidirectional Graph to Code** - Generate and refactor code from nodes.
5. **Phase 4: Execution Loop** - Terminal and run feedback embedded in the graph.
6. **Phase 5: Agent Modes** - Planner/Agent/Ask/Researcher permissions.
7. **Phase 6: Advanced** - Dream mode, self-healing, collaboration.
8. **Phase 7: SaaS and Enterprise** - Auth, cloud storage, quotas.

---

## Phase 0: Architecture Refactoring (Modular Core)
*Crucial for supporting multiple providers and future scale.*

### Implementation Roadmap
#### 0.1 AI Abstraction Layer (`LLMProvider`)
- **Goal**: Switch between DeepSeek, OpenAI, Claude, Gemini, and local LLMs easily.
- **Deliverables**:
    - [ ] `src/lib/llm/` with `generateStructure()` and `chat()`.
    - [ ] Adapters: `DeepSeekAdapter`, `OpenAIAdapter`, `AnthropicAdapter`, `GoogleAdapter`, `OllamaAdapter`.
    - [ ] Settings UI for provider selection and keys.
- **Acceptance**: Existing analysis and chat work with DeepSeek via the new interface.

#### 0.2 Data Source Abstraction (`FileSystemProvider`)
- **Goal**: Decouple the app from GitHub and enable local projects.
- **Deliverables**:
    - [ ] `IFileSystem` interface: `readDir()`, `readFile()`, `writeFile()`.
    - [ ] Providers: `GitHubProvider`, `LocalAgentProvider` (via LAS).
- **Acceptance**: Repo visualizer can run against GitHub and local projects.

#### 0.3 Local Agent Service (LAS)
- **Goal**: Secure, local access to filesystem, git, and terminal.
- **Deliverables**:
    - [ ] Local HTTP service or IPC with scoped project access.
    - [ ] Endpoints: `fs.read`, `fs.write`, `fs.list`, `git.status`, `git.diff`, `git.commit`, `cmd.run`.
    - [ ] Permission gates per project and per tool.
    - [ ] File watcher to emit change events.
- **Acceptance**: UI can read local files through LAS with explicit permission.

#### 0.4 Graph Document Schema (`GraphDoc`)
- **Goal**: Single JSON document for graphs, tabs, nodes, edges, templates.
- **Deliverables**:
    - [ ] `GraphDoc` schema with `graphs`, `tabs`, `nodes`, `edges`, `customNodeTemplates`, `techStack`.
    - [ ] `childGraphId` for node deep dives.
    - [ ] Schema validation and migrations.
- **Acceptance**: Graph state is stored in `.rassam/graph.json` and reloads cleanly.

---

## Phase 1: Local Workspace + Versioned Sync
*Foundation for bidirectional flowchart and code changes.*

### Implementation Roadmap
#### 1.1 Workspace Selector + Project Store
- **Goal**: Open local folders and store per-project context.
- **Deliverables**:
    - [ ] Open local folder via LAS.
    - [ ] `.rassam/` metadata: `graph.json`, `history/`, `settings.json`.
    - [ ] Separate context per project (chat + graph + history).
- **Acceptance**: Switching projects swaps graph and chat context.

#### 1.2 File Watcher + Incremental Updates (Code to Graph)
- **Goal**: Graph updates when files change.
- **Deliverables**:
    - [ ] LAS watcher events: add, change, delete.
    - [ ] Incremental analysis on touched nodes only.
- **Acceptance**: File changes update the graph without full re-run.

#### 1.3 Sync + History (Reversible)
- **Goal**: Every sync is a reversible snapshot.
- **Deliverables**:
    - [ ] Always-visible sync button when dirty.
    - [ ] Confirm dialog before sync.
    - [ ] Snapshot: `GraphDoc` + working tree changes.
    - [ ] Diff viewer and one-click revert.
- **Acceptance**: Any snapshot can be restored without loss.

---

## Phase 2: Multi-Tab Canvas + Nodes
*Make the canvas a system design surface, not just a diagram.*

### Implementation Roadmap
#### 2.1 Tabbed Graphs
- **Goal**: Main, Backend, Frontend, Database tabs with fast navigation.
- **Deliverables**:
    - [ ] Double click node to open child graph.
    - [ ] Bottom-center tab bar with keyboard navigation.
    - [ ] Custom templates available in all tabs.
- **Acceptance**: Users can navigate graphs like a system design doc.

#### 2.2 Rich Node Editor
- **Goal**: Every node has instructions and attachments.
- **Deliverables**:
    - [ ] Inline text area inside each node.
    - [ ] Side panel editor for long descriptions.
    - [ ] Tech Stack node (singleton, main tab only).
    - [ ] Frontend page nodes support image or video references.
- **Acceptance**: Node descriptions persist in GraphDoc.

#### 2.3 Essential System Design Nodes (v1)
- **Goal**: Minimal, high-value node set.
- **Deliverables**:
    - [ ] Frontend, Backend, Database Schema.
    - [ ] API Gateway, Load Balancer, Cache, Queue, Storage.
    - [ ] CDN, Firewall, External API.
    - [ ] Docker and Kubernetes.
- **Acceptance**: Palette supports core system layouts.

#### 2.4 Specialized Node UIs (v1)
- **Goal**: Tailored editing for critical nodes.
- **Deliverables**:
    - [ ] API node: endpoints table (method, path, params, response).
    - [ ] Database node: schema designer or SQL input.
    - [ ] Infra node: replicas, ports, env vars, image, scaling.
- **Acceptance**: Specialized UIs store typed data in GraphDoc.

---

## Phase 3: Bidirectional Sync (Graph to Code)
*Editing the map changes the territory.*

### Implementation Roadmap
#### 3.1 Graph to Code Generation
- **Goal**: Node edits scaffold and refactor code.
- **Deliverables**:
    - [ ] Node creation can generate files and imports.
    - [ ] Edge direction drives call and import direction.
    - [ ] Rules engine for safe scaffolding.
- **Acceptance**: A small graph creates a working project skeleton.

#### 3.2 Code to Graph Updates
- **Goal**: Keep the graph consistent with reality.
- **Deliverables**:
    - [ ] Update nodes from code diffs or summaries.
    - [ ] Conflict UI when code and graph disagree.
- **Acceptance**: Graph reflects code changes after sync.

---

## Phase 4: Execution Loop (Terminal)
*Code runs inside Rassam.*

### Implementation Roadmap
#### 4.1 Integrated Terminal
- **Goal**: Multi-tab terminal connected to LAS PTY.
- **Deliverables**:
    - [ ] Terminal tabs in center view.
    - [ ] Command permission gating per project.
- **Acceptance**: Users can run scripts without leaving the app.

#### 4.2 Context-Aware Run
- **Goal**: Run scripts from nodes and show results on the graph.
- **Deliverables**:
    - [ ] Run and test buttons on relevant nodes.
    - [ ] Status overlays (pass, fail, build errors).
- **Acceptance**: Node status reflects the latest run output.

---

## Phase 5: Rassam Agent Modes + Permissions
*Planner, Agent, Ask, Researcher modes with clear boundaries.*

### Implementation Roadmap
#### 5.1 Modes and Permissions
- **Goal**: Clear boundaries and explicit approvals.
- **Deliverables**:
    - [ ] Planner: read graph, code, terminal, suggest only.
    - [ ] Agent: full read and write with approvals.
    - [ ] Ask: read-only, no terminal.
    - [ ] Researcher: RAG with optional skill generation.
    - [ ] Per-tool permission UI and rate limits.
- **Acceptance**: Permissions are enforced on every LAS action.

---

## Phase 6: Advanced Features (Long-Term)
*High-impact features after the core loop is stable.*

- Dream mode: natural language to full system design graph.
- Self-healing graph: broken edges detected and repaired.
- Collaborative editing (CRDT-based).

---

## Phase 7: SaaS and Enterprise
*Monetization and team scale.*

- Auth (GitHub or Google).
- Cloud storage for GraphDoc history.
- Usage quotas and subscription plans.
- GitHub integration (PRs, push, pull).

---

## Scope and Non-Goals (For Now)
- No enterprise compliance or SSO until Phase 7.
- No multi-tenant cloud storage until the on-device workflow is proven.
- No broad marketplace or plugin system in early phases.

---

## Immediate Next Steps (Updated)
1. Define GraphDoc schema and migrations stored in `.rassam/`.
2. Implement LAS skeleton and LocalAgentProvider for FS and terminal.
3. Add GraphDoc persistence and project switching.
4. Build tabbed graph navigation and custom node registry.
5. Prototype graph to code generation for a tiny app skeleton.
