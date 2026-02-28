# Repo Visualizer - Agent Guide

This document is designed to help future coding agents understand the architecture, logic, and structure of the **Repo Visualizer** project. Read this before making changes to ensure consistency and modularity.

## Project Overview

**Repo Visualizer** is a Next.js application that converts GitHub repository structures into interactive, logical flowcharts. It uses AI (DeepSeek) to categorize files into high-level "nodes" (e.g., Auth, Database, UI) based on their names and paths, rather than just visualizing the file tree directory.

**AI Assistant**: The integrated chatbot is named **Rassam** (رسّام - "artist/illustrator" in Arabic), reflecting its ability to visualize and explain codebases.

## Tech Stack

-   **Framework**: Next.js 16 (App Router)
-   **Language**: TypeScript
-   **Styling**: Tailwind CSS v4 (Dark Theme with Cyan accents)
-   **Visualization**: React Flow (Graph/Node rendering)
-   **Layout Engine**: Dagre (Auto-layout with improved spacing for system design)
-   **AI**: LLM provider abstraction (DeepSeek, OpenAI, Anthropic, Google, Ollama) via adapters
-   **GitHub API**: Octokit
-   **Markdown**: React Markdown + React Syntax Highlighter
-   **Export**: html-to-image

## Architecture & Data Flow

1.  **User Input**: User enters a GitHub URL on the client (`src/app/page.tsx`) or via Projects sidebar.
  -   New project creation supports **three modes** from Projects sidebar `+`: 
    - **From GitHub URL** (repo analysis + auto-generated nodes/edges)
    - **Empty Project** (blank editable canvas for custom architecture design)
    - **From JSON File** (import a previously exported JSON to create a new project)
2.  **API Request**: Application sends POST request to `/api/repo`.
  -   Settings UI sends GET request to `/api/settings/models` for provider/model availability and validation status.
3.  **Data Fetching** (`src/lib/github.ts`):
    -   Fetches the recursive file tree using GitHub API.
    -   Filters for relevant file types (blobs).
    -   Supports fetching file content (used by chat for README.md and specific file queries).
4.  **AI Analysis** (`src/lib/ai.ts`):
  -   Sends the file list to the selected LLM provider adapter.
    -   Prompt asks strictly for a JSON output containing `nodes` (with category, complexity, dependencies) and `edges` (with type, direction, and strength).
    -   Supports system design categories for architectural diagrams.
5.  **Graph Layout** (`src/app/api/repo/route.ts`):
    -   Receives AI JSON.
    -   Uses `dagre` to calculate X/Y coordinates for all nodes to ensure a clean flowchart.
6.  **Rendering**:
    -   `ReactFlow` renders the graph using node types from `NodeTypes.tsx`.
    -   Custom edges from `CustomEdge.tsx` provide styled connections.
    -   Custom FlowControls (no legacy +/- buttons).
7.  **Interaction**:
    -   Clicking a node sets it as `selectedNode`.
    -   **Multi-select**: Hold **Shift** and click nodes to add/remove from selection, or **Shift+drag** on the canvas to rubber-band select multiple nodes. The batch toolbar appears when 2+ nodes are selected, enabling bulk delete and category changes.
    -   **Clipboard**: **Ctrl+C** copies selected node(s) (and edges fully within the selection) to an in-memory clipboard. **Ctrl+V** pastes them at a +60px offset with new IDs.
    -   **Inline editing**: **Double-click** a node's label or description to edit it in-place. Press **Enter** to commit, **Escape** to cancel.
    -   Canvas has a **manual Sync button** in controls. Sync captures a canonical snapshot of current flowchart state (nodes, edges, relationships, positions, selected node, layout direction).
    -   Chat uses the latest synced snapshot as primary context (with live-canvas fallback when no snapshot exists).
    -   For architecture-sensitive prompts, agents should sync after major canvas edits before relying on chat answers.
    -   `EnhancedChatbot.tsx` (Rassam) in the sidebar receives the `selectedNode` data as context.
    -   Chat includes selected provider/model plus generation settings (max tokens, temperature).
    -   Chat sends **full conversation history** (up to last 20 messages) with each request, giving the LLM multi-turn memory for follow-up questions.
    -   Chat API (`/api/chat`) fetches README.md and file content, validates model/provider availability, sanitizes conversation history, then **streams** the response token-by-token using `ReadableStream`.
    -   The frontend reads the stream incrementally and updates the chat UI in real time, providing a typewriter-style experience.

## Key Directories & Files

### `src/app`
-   `page.tsx`: Main entry point. Contains the `ReactFlow` canvas, Projects sidebar with add button, search bar state, and layout. Wrapped in `ReactFlowProvider` and `ErrorBoundary`.
  -   Owns project lifecycle state (`github`/`empty`/`imported` source), per-project synced AI context snapshots, and canvas sync handler.
  -   Persists projects (including empty projects and sync snapshots) in localStorage.
-   `settings/page.tsx`: Global AI settings page. Manages enabled models, selected chat model, max output tokens, and temperature.
-   `globals.css`: Global styles, custom scrollbar, React Flow customizations.
-   `api/repo/route.ts`: Orchestrates fetching, analyzing, and layouting. Supports PUT for re-layout.
-   `api/chat/route.ts`: Streaming endpoint for the chatbot. Detects file queries, fetches README.md or specific files for context. Returns a `ReadableStream` of text tokens (pre-stream validation errors still return JSON).
-   `api/settings/models/route.ts`: Returns provider metadata and live availability checks used by Settings and chat selector.

### `src/lib`
-   `ai.ts`: Core AI logic. Contains `analyzeRepoStructure` for node generation, `chatStreamWithContext` for streaming chat responses, and `buildSystemMessage` helper to construct the system prompt (shared between streaming and non-streaming paths).
-   `github.ts`: Octokit client. Handles `getRepoStructure` and `getFileContent`. Uses `GITHUB_TOKEN` env var for authenticated requests (validates token format before use).
-   `import.ts`: JSON import utility. `parseAndValidateImportJson()` validates exported JSON, regenerates node/edge IDs to avoid collisions, applies defaults for missing fields, and derives project metadata.
-   `model-settings.ts`: Client-side settings schema + localStorage persistence helpers for model enablement and generation controls.
-   `llm/catalog.ts`: Provider catalog metadata, model lists, API key checks, and live provider validation helpers.
-   `llm/providers/OpenAICompatibleAdapter.ts`: Abstract base class for OpenAI-compatible LLM adapters. DeepSeek, Google, and Ollama adapters extend this to eliminate duplication.
-   `utils.ts`: `cn` helper for Tailwind class merging.

### `src/types`
-   `index.ts`: TypeScript type definitions for `NodeCategory`, `NodeData`, `EdgeData`, `ChatMessage`, etc.

### `src/components`
-   `ErrorBoundary.tsx`: React class-based error boundary wrapping the main app. Prevents component crashes from blanking the entire page.

### `src/components/canvas`
-   `NodeTypes.tsx`: Defines `EnhancedNode`, `CompactNode`, `GroupNode` with category-based styling. Supports both code and system design categories. `EnhancedNode` supports **double-click inline editing** of label and description via the `InlineEdit` component.
-   `NodeEditContext.tsx`: React context that provides `onUpdateNode` callback to node components, enabling inline editing without prop drilling.
-   `CustomEdge.tsx`: Custom edge component with draggable labels (uses ref to avoid stale closures), direction toggle (one-way/two-way arrows), delete button, and type-based coloring.
-   `ExportPanel.tsx`: Export functionality for PNG, SVG, JSON. Import JSON from dropdown (creates new project via `onImportProject` callback). Uses shared `exportAsImage` helper internally.
-   `EditToolbar.tsx`: Add, edit, delete nodes with modal forms. Categories are grouped into "Code" and "System" sections.
  -   Supports **multi-select batch operations**: when 2+ nodes are selected, shows a batch toolbar with "Delete N Nodes" and "Change Category" (applies chosen category to all selected nodes).
-   `FlowControls.tsx`: Search, zoom, layout options, minimap toggle, keyboard shortcuts panel.
  -   Includes manual canvas **Sync** trigger to refresh AI context snapshot.

### `src/components/sidebar`
-   `EnhancedChatbot.tsx`: The sidebar component. Handles chat history, loading states, quick actions, and markdown rendering.
  -   Sends `canvasContext` payload (synced snapshot preferred, live graph fallback) to `/api/chat`.
  -   Reads the streaming response via `ReadableStream` / `TextDecoder`, updating the assistant message in real time.
  -   Includes both node-level context and graph-level relationships to improve architectural responses.
-   `MarkdownRenderer.tsx`: Custom markdown renderer with syntax highlighting and file path detection.

## Data Models

### Node Data (React Flow `data` prop)
```typescript
interface NodeData {
  label: string;           // e.g., "Authentication"
  description: string;     // e.g., "Login and Register logic"
  files: string[];         // Array of file paths belonging to this node
  category: NodeCategory;  // e.g., "api", "component", "database"
  complexity?: 'low' | 'medium' | 'high';
  linesOfCode?: number;
  dependencies?: string[];
  exports?: string[];
  isExpanded?: boolean;
}
```

### Synced Canvas Snapshot (AI Context)
```typescript
interface CanvasSyncSnapshot {
  syncedAt: string;
  project: {
    id: string;
    name: string;
    source: 'github' | 'empty' | 'imported';
    repo?: string;
  };
  layoutDirection: 'TB' | 'LR';
  selectedNodeId?: string | null;
  selectedNodeLabel?: string | null;
  nodes: Array<{
    id: string;
    label: string;
    description?: string;
    category?: NodeCategory;
    files?: string[];
    complexity?: 'low' | 'medium' | 'high';
    dependencies?: string[];
    exports?: string[];
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: string;
    strength?: 'weak' | 'normal' | 'strong';
    direction?: 'one-way' | 'two-way';
  }>;
}
```

### Node Categories
```typescript
type NodeCategory = 
  // Code-based categories
  | 'api' | 'component' | 'config' | 'database' | 'auth'
  | 'utility' | 'test' | 'style' | 'asset' | 'documentation'
  | 'core' | 'service' | 'hook' | 'context' | 'middleware'
  | 'model' | 'route'
  // System design categories
  | 'cache' | 'queue' | 'load-balancer' | 'gateway' | 'storage'
  | 'cdn' | 'proxy' | 'firewall' | 'external-api' | 'message-broker'
  | 'container' | 'serverless' | 'client'
  | 'default';
```

### Edge Data
```typescript
interface EdgeData {
  label?: string;
  type?: 'dependency' | 'import' | 'calls' | 'extends' | 'implements' | 'sends' | 'receives' | 'reads' | 'writes';
  strength?: 'weak' | 'normal' | 'strong';
  direction?: 'one-way' | 'two-way'; // Arrow direction - bidirectional for read/write operations
  labelOffset?: { x: number; y: number }; // Stored label position for draggable labels
}
```

## Common Tasks & Instructions

### Modifying the AI Logic
-   Edit the prompt in `src/lib/ai.ts` in the `analyzeRepoStructure` function.
-   Ensure the prompt explicitly enforces JSON format with the expected schema.
-   Use `detectCategory` and `estimateComplexity` helpers for post-processing.
-   Provider selection is env-driven via `LLM_PROVIDER` (deepseek, openai, anthropic, google, ollama).

### Adding New Node Categories
1.  Add the category to `NodeCategory` type in `src/types/index.ts`.
2.  Add icon mapping in `categoryIcons` in `NodeTypes.tsx`.
3.  Add color mapping in `categoryColors` in `NodeTypes.tsx`.
4.  Update the minimap colors in `FlowControls.tsx` (`minimapCategoryStroke` record).
5.  Add the category to the `categories` array in `EditToolbar.tsx` (with `group: 'Code'` or `'System'`).
6.  Update the `VALID_NODE_CATEGORIES` array and AI prompt in `ai.ts`.

### Adding New Node Types
1.  Create a new component in `src/components/canvas/NodeTypes.tsx`.
2.  Export it in the `nodeTypes` object.
3.  Update the API generation logic if the new node type requires different data.

### Adding New LLM Providers
1.  If OpenAI-compatible: extend `OpenAICompatibleAdapter` from `src/lib/llm/providers/OpenAICompatibleAdapter.ts`. Override only `providerId`, `defaultModel`, `apiKey`, and `baseURL`. The `chatStream()` method is inherited automatically.
2.  If non-OpenAI-compatible: implement `LLMAdapter` interface directly (see `AnthropicAdapter.ts`). Must implement `chatStream()` returning `AsyncIterable<string>`.
3.  Register the adapter in `src/lib/llm/registry.ts`.
4.  Add provider metadata to `src/lib/llm/catalog.ts`.

### Enhancing the Chatbot
-   Modify the system prompt in `buildSystemMessage()` in `src/lib/ai.ts` (shared by both streaming and non-streaming paths).
-   Add new quick actions in `EnhancedChatbot.tsx`.
-   Extend `MarkdownRenderer.tsx` for new formatting needs.
-   Keep `canvasContext` + `allNodesContext` payload contract aligned between `EnhancedChatbot.tsx` and `/api/chat` route.
-   Keep model settings payload (`providerId`, `model`, `maxTokens`, `temperature`) aligned between `EnhancedChatbot.tsx` and `/api/chat` route.
-   The `LLMProvider` interface requires three methods: `generateStructure`, `chat`, and `chatStream` (returns `AsyncIterable<string>`).
-   `ChatInput` accepts an optional `history?: ChatHistoryMessage[]` array. All adapters thread history between the system prompt and the latest user message.
-   The API route sanitizes history (validates shape, caps at 20 messages) before forwarding.

### Adding Export Formats
-   Extend `ExportPanel.tsx` with new export options.
-   Use appropriate libraries for the format (e.g., `html-to-image` for images).

## Environment Variables
Ensure these are set in `.env.local` for local development:
-   `DEEPSEEK_API_KEY`: Required when using the DeepSeek provider.
-   `OPENAI_API_KEY`: Required when using the OpenAI provider.
-   `ANTHROPIC_API_KEY`: Required when using the Anthropic provider.
-   `GOOGLE_API_KEY`: Required when using the Google provider.
-   `OLLAMA_BASE_URL`: Optional, defaults to `http://localhost:11434/v1`.
-   `OLLAMA_API_KEY`: Required for enabling Ollama through Settings validation.
-   `GITHUB_TOKEN`: Recommended to avoid rate limits on repo fetching.
