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
-   **AI**: DeepSeek API (via OpenAI SDK compatibility) - Model: deepseek-reasoner
-   **GitHub API**: Octokit
-   **Markdown**: React Markdown + React Syntax Highlighter
-   **Export**: html-to-image

## Architecture & Data Flow

1.  **User Input**: User enters a GitHub URL on the client (`src/app/page.tsx`) or via Projects sidebar.
2.  **API Request**: Application sends POST request to `/api/repo`.
3.  **Data Fetching** (`src/lib/github.ts`):
    -   Fetches the recursive file tree using GitHub API.
    -   Filters for relevant file types (blobs).
    -   Supports fetching file content (used by chat for README.md and specific file queries).
4.  **AI Analysis** (`src/lib/ai.ts`):
    -   Sends the file list to DeepSeek.
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
    -   `EnhancedChatbot.tsx` (Rassam) in the sidebar receives the `selectedNode` data as context.
    -   Chat API (`/api/chat`) fetches README.md and file content for context-aware answers.

## Key Directories & Files

### `src/app`
-   `page.tsx`: Main entry point. Contains the `ReactFlow` canvas, Projects sidebar with add button, search bar state, and layout. Wrapped in `ReactFlowProvider`.
-   `globals.css`: Global styles, custom scrollbar, React Flow customizations.
-   `api/repo/route.ts`: Orchestrates fetching, analyzing, and layouting. Supports PUT for re-layout.
-   `api/chat/route.ts`: Endpoint for the chatbot. Detects file queries, fetches README.md or specific files for context.

### `src/lib`
-   `ai.ts`: Configuration for DeepSeek API. Contains `analyzeRepoStructure` for node generation and `chatWithContext` for enhanced chat responses.
-   `github.ts`: Octokit client. Handles `getRepoStructure` and `getFileContent`.
-   `utils.ts`: `cn` helper for Tailwind class merging.

### `src/types`
-   `index.ts`: TypeScript type definitions for `NodeCategory`, `NodeData`, `EdgeData`, `ChatMessage`, etc.

### `src/components/canvas`
-   `NodeTypes.tsx`: Defines `EnhancedNode`, `CompactNode`, `GroupNode` with category-based styling. Supports both code and system design categories.
-   `CustomEdge.tsx`: Custom edge component with draggable labels, direction toggle (one-way/two-way arrows), delete button, and type-based coloring.
-   `ExportPanel.tsx`: Export functionality for PNG, SVG, JSON.
-   `EditToolbar.tsx`: Add, edit, delete nodes with modal forms.
-   `FlowControls.tsx`: Search, zoom, layout options, minimap toggle, keyboard shortcuts panel.

### `src/components/sidebar`
-   `EnhancedChatbot.tsx`: The sidebar component. Handles chat history, loading states, quick actions, and markdown rendering.
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

### Adding New Node Categories
1.  Add the category to `NodeCategory` type in `src/types/index.ts`.
2.  Add icon mapping in `categoryIcons` in `NodeTypes.tsx`.
3.  Add color mapping in `categoryColors` in `NodeTypes.tsx`.
4.  Update the minimap colors in `FlowControls.tsx`.

### Adding New Node Types
1.  Create a new component in `src/components/canvas/NodeTypes.tsx`.
2.  Export it in the `nodeTypes` object.
3.  Update the API generation logic if the new node type requires different data.

### Enhancing the Chatbot
-   Modify the system prompt in `chatWithContext` function in `src/lib/ai.ts`.
-   Add new quick actions in `EnhancedChatbot.tsx`.
-   Extend `MarkdownRenderer.tsx` for new formatting needs.

### Adding Export Formats
-   Extend `ExportPanel.tsx` with new export options.
-   Use appropriate libraries for the format (e.g., `html-to-image` for images).

## Environment Variables
Ensure these are set in `.env.local` for local development:
-   `DEEPSEEK_API_KEY`: Required for analysis and chat.
-   `GITHUB_TOKEN`: Recommended to avoid rate limits on repo fetching.
