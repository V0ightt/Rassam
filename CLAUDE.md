# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Next.js dev server
npm run build      # Production build (also catches type errors)
npm run lint       # ESLint (next/core-web-vitals + typescript)
npm test           # Run all tests via tsx --test (Node.js built-in runner)

# Run a single test file:
npx tsx --test src/lib/llm/registry.test.ts
```

Tests use `node:test` + `node:assert/strict` — **not Jest**. See `src/lib/llm/registry.test.ts` as a reference.

Environment: copy `.env.local` with keys: `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GITHUB_TOKEN`, `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`.

## Architecture

**Rassam** is a Next.js 16 (App Router) + TypeScript app that converts GitHub repos into interactive AI-analyzed flowcharts using React Flow. Dagre handles auto-layout. The integrated chatbot is also named Rassam.

### Key Data Flow

1. **Project creation** → `useProjects` hook (CRUD + localStorage persistence under `repoAgent_projects`)
2. **GitHub analysis** → `POST /api/repo` → `github.ts` fetches file tree → `ai.ts` sends to LLM → dagre layouts nodes → returns `{nodes, edges, fileTree}`
3. **Canvas rendering** → `src/app/page.tsx` (thin shell) wires React Flow with hooks; owns only `useNodesState`/`useEdgesState` + local UI state
4. **Chat streaming** → `POST /api/chat` → validates provider → `chat-agent.ts` orchestrates tool calls → `ai.ts#chatStreamWithContext` → NDJSON stream of `{status, text, write, error, done}` events
5. **File caching** → `file-store.ts` (IndexedDB) per-project; client sends `cachedFiles` to chat API to avoid re-fetching

### Hook-based Decomposition (`src/hooks/`)

`page.tsx` is a thin wiring layer — all complex logic lives in hooks:
- `useProjects` — project/chat lifecycle, localStorage persistence, canvas-sync snapshots
- `useCanvasHistory` — undo/redo stack (10 snapshots)
- `useClipboard` — copy/paste nodes with fresh-ID generation
- `useCanvasShortcuts` — global keyboard bindings via ref pattern (single `useEffect`)
- `useResizablePane` — mouse-drag sidebar width with localStorage persistence
- `useFileExplorer` — file fetching/caching state, IndexedDB interaction
- `useEditorTabs` — VS Code-style file tabs; Canvas tab is permanent

### LLM Provider Adapter Pattern (`src/lib/llm/`)

- Interface: `LLMProvider` in `types.ts` — requires `generateStructure`, `chat`, `chatStream` (returns `AsyncIterable<string>`)
- OpenAI-compatible providers: extend `OpenAICompatibleAdapter`, override only `providerId`, `defaultModel`, `apiKey`, `baseURL` (see `DeepSeekAdapter.ts` — ~10 lines)
- Non-OpenAI providers: implement `LLMProvider` directly (see `AnthropicAdapter.ts`)
- Register in `registry.ts`, add metadata in `catalog.ts`

### Chat Agent (`src/lib/chat-agent.ts`)

Two modes: `ask` (read + session inspection tools) and `agent` (adds `write`/`write_batch` canvas mutation tools). Supports up to 25 planning steps per turn, 3 retries per step. `write_batch` executes an array of node/edge operations then auto-re-layouts via dagre. Tool calls stream as NDJSON events consumed by `EnhancedChatbot.tsx`.

### Canvas Sync

The manual **Sync** button in `FlowControls.tsx` creates a `CanvasSyncSnapshot` stored in the project. Chat uses the snapshot as primary context (live canvas as fallback). Sync after major canvas edits before relying on chat answers.

### State Persistence

- Projects + chat sessions: localStorage (`repoAgent_projects` key)
- File contents: IndexedDB per-project (`file-store.ts`)
- Settings (enabled models, temperature, maxTokens): localStorage via `model-settings.ts`

## Conventions

- **Path alias**: `@/*` maps to `./src/*` — always use `@/` imports
- **Streaming**: chat API returns NDJSON (not SSE). Pre-stream errors return JSON. Client reads with `ReadableStream` / `TextDecoder`
- **System prompt**: edit `buildSystemMessage()` in `src/lib/ai.ts` — shared by streaming and non-streaming paths
- **Edge/node data contracts**: defined in `src/types/index.ts` (`NodeData`, `EdgeData`). Keep `EnhancedChatbot.tsx` payload aligned with `/api/chat` route
- **Component locations**: canvas → `src/components/canvas/`, navigation → `src/components/navigation/`, editor → `src/components/editor/`, chat → `src/components/sidebar/`

## Adding a Node Category (6-file checklist)

1. `src/types/index.ts` — add to `NodeCategory` union
2. `src/components/canvas/NodeTypes.tsx` — add to `categoryIcons` + `categoryColors`
3. `src/components/canvas/FlowControls.tsx` — add to `minimapCategoryStroke`
4. `src/components/canvas/EditToolbar.tsx` — add to `categories` array (`group: 'Code'` or `'System'`)
5. `src/lib/ai.ts` — add to `VALID_NODE_CATEGORIES` + update AI prompt

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main canvas shell — thin wiring only |
| `src/lib/ai.ts` | `analyzeRepoStructure`, `chatStreamWithContext`, `buildSystemMessage` |
| `src/lib/chat-agent.ts` | Ask/agent mode orchestration, tool execution, stream events |
| `src/lib/github.ts` | Octokit: `getRepoStructure`, `getFileContent` |
| `src/lib/file-store.ts` | IndexedDB wrapper for file content caching |
| `src/lib/llm/registry.ts` | LLM adapter registry |
| `src/lib/llm/catalog.ts` | Provider metadata, API key checks, live validation |
| `src/types/index.ts` | `NodeCategory`, `NodeData`, `EdgeData`, `CanvasSyncSnapshot` |
| `src/components/sidebar/EnhancedChatbot.tsx` | Chat UI, stream reading, canvas write application |
| `src/app/api/repo/route.ts` | Fetch → analyse → layout pipeline |
| `src/app/api/chat/route.ts` | Streaming chat endpoint, tool dispatch |

## Important Notes for Future Agents

- Read `agents.md` before substantial architecture changes. Update `agents.md` and `README.md` when changes affect architecture, APIs, or documented behavior.
- `page.tsx` must remain a thin wiring layer — add logic to hooks, not to `page.tsx`.
- The `LLMProvider` interface's `chatStream` must return `AsyncIterable<string>`. All adapters thread `history` between the system prompt and the latest user message.
- Chat history is sanitized (shape-validated, capped at 20 messages) in the API route before forwarding to adapters.
- `write` tool events mutate the live React Flow canvas client-side but do **not** automatically update the synced AI snapshot.
