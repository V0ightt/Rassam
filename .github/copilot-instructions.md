# Rassam – Copilot Instructions

Read `agents.md` for full architecture details before substantial implementation work. Update `agents.md` and `README.md` when your changes affect architecture, APIs, or documented behavior.

## Project Overview

Next.js 16 (App Router) + TypeScript app that converts GitHub repos into interactive AI-analyzed flowcharts using React Flow. The integrated chatbot is named **Rassam**. Styling uses Tailwind CSS v4 (dark theme, cyan accents).

## Dev Workflow

- `npm run dev` — start Next.js dev server
- `npm run build` — production build (catches type errors)
- `npm run lint` — ESLint (next/core-web-vitals + typescript)
- `npm test` — runs `tsx --test` (Node.js built-in test runner, not Jest). Test files use `node:test` + `node:assert/strict` (see `src/lib/llm/registry.test.ts`)
- Environment: copy `.env.local` with API keys (`DEEPSEEK_API_KEY`, `GITHUB_TOKEN`, etc.)

## Architecture (key data flow)

1. **Project creation** → `useProjects` hook manages CRUD + localStorage persistence
2. **GitHub analysis** → `POST /api/repo` → `github.ts` fetches file tree → `ai.ts` sends to LLM → dagre layouts nodes → returns `{nodes, edges, fileTree}`
3. **Canvas rendering** → `page.tsx` (thin shell) wires React Flow with extracted hooks; owns only `useNodesState`/`useEdgesState` + UI state
4. **Chat streaming** → `POST /api/chat` → validates provider → `ai.ts#chatStreamWithContext` → `ReadableStream` of tokens
5. **File caching** → `file-store.ts` (IndexedDB) per-project; client sends `cachedFiles` to chat API to avoid re-fetching

## Hook-based decomposition (`src/hooks/`)

`page.tsx` delegates all complex logic to hooks: `useProjects` (project/chat lifecycle), `useCanvasHistory` (undo/redo), `useClipboard` (copy/paste), `useCanvasShortcuts` (keyboard bindings via ref pattern), `useResizablePane`, `useFileExplorer`, `useEditorTabs`. Follow this pattern — keep `page.tsx` as a thin wiring layer.

## LLM Provider Adapter Pattern (`src/lib/llm/`)

- Interface: `LLMProvider` in `types.ts` — requires `generateStructure`, `chat`, `chatStream` (returns `AsyncIterable<string>`)
- OpenAI-compatible providers extend `OpenAICompatibleAdapter` (override `id`, `apiKey`, `baseURL`, `model` only — see `DeepSeekAdapter.ts` as a 10-line example)
- Non-OpenAI providers implement `LLMProvider` directly (see `AnthropicAdapter.ts`)
- Register in `registry.ts`, add metadata in `catalog.ts`

## Adding a Node Category (6-file checklist)

1. `src/types/index.ts` — add to `NodeCategory` union
2. `src/components/canvas/NodeTypes.tsx` — add to `categoryIcons` + `categoryColors`
3. `src/components/canvas/FlowControls.tsx` — add to `minimapCategoryStroke`
4. `src/components/canvas/EditToolbar.tsx` — add to `categories` array (set `group: 'Code'` or `'System'`)
5. `src/lib/ai.ts` — add to `VALID_NODE_CATEGORIES` array + update AI prompt

## Project-Specific Conventions

- **Path alias**: `@/*` maps to `./src/*` — always use `@/` imports
- **No Jest**: tests use `node:test` + `node:assert/strict`, run via `tsx --test`
- **Streaming pattern**: chat API returns `ReadableStream` (not SSE). Client reads with `ReadableStream`/`TextDecoder`. Pre-stream errors return JSON
- **Canvas sync**: manual Sync button creates `CanvasSyncSnapshot` stored in project. Chat uses snapshot as primary context (live canvas as fallback)
- **State persistence**: projects + chat sessions in localStorage (`repoAgent_projects` key); file contents in IndexedDB per project
- **Component locations**: canvas components in `src/components/canvas/`, navigation in `src/components/navigation/`, editor tabs in `src/components/editor/`
- **AI prompt changes**: edit `buildSystemMessage()` in `ai.ts` (shared by streaming and non-streaming paths)
- **Edge/node data contracts**: defined in `src/types/index.ts` (`NodeData`, `EdgeData`). Keep chat API payload aligned with `EnhancedChatbot.tsx`
