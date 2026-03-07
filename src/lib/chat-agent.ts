import dagre from 'dagre';
import { buildSystemMessage } from '@/lib/ai';
import { getProvider } from '@/lib/llm';
import type { ChatHistoryMessage } from '@/lib/llm/types';
import {
  CanvasSyncSnapshot,
  ChatCanvasWriteOperation,
  ChatMode,
  EdgeData,
  NodeCategory,
  NodeData,
  SyncedCanvasEdge,
  SyncedCanvasNode,
} from '@/types';

interface ChatRuntimeSettings {
  providerId?: string | null;
  model?: string | null;
  maxTokens?: number;
  temperature?: number;
}

interface ReadToolResult {
  content: string | null;
  source: 'cache' | 'github' | 'missing';
  path: string;
}

interface ReadToolContext {
  readFile: (path: string) => Promise<ReadToolResult>;
}

interface StreamChatResponseParams extends ReadToolContext {
  message: string;
  mode: ChatMode;
  context: NodeData | null;
  repoDetails?: { owner: string; repo: string } | null;
  allNodesContext?: SyncedCanvasNode[] | null;
  canvasContext?: CanvasSyncSnapshot | null;
  readmeContent?: string | null;
  specificFile?: { path: string; content: string | null } | null;
  runtimeSettings?: ChatRuntimeSettings;
  history?: ChatHistoryMessage[];
  cachedFiles?: Record<string, string> | null;
}

export type ChatStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; text: string }
  | { type: 'write'; operation: ChatCanvasWriteOperation; text?: string }
  | { type: 'error'; text: string }
  | { type: 'done' };

type WorkingCanvasState = {
  project: CanvasSyncSnapshot['project'];
  layoutDirection: 'TB' | 'LR';
  selectedNodeId?: string | null;
  selectedNodeLabel?: string | null;
  nodes: SyncedCanvasNode[];
  edges: SyncedCanvasEdge[];
};

type PlannerDecision =
  | {
      type: 'tool';
      tool: 'read' | 'session' | 'write' | 'write_batch';
      input?: Record<string, unknown>;
      status?: string;
    }
  | {
      type: 'final';
      content?: string;
    };

type PlannerToolName = Extract<PlannerDecision, { type: 'tool' }>['tool'];

interface WritePlanResult {
  operations: Array<Record<string, unknown>>;
  summary?: string;
}

const VALID_NODE_CATEGORIES: NodeCategory[] = [
  'api', 'component', 'config', 'database', 'auth',
  'utility', 'test', 'style', 'asset', 'documentation',
  'core', 'service', 'hook', 'context', 'middleware',
  'model', 'route',
  'cache', 'queue', 'load-balancer', 'gateway', 'storage',
  'cdn', 'proxy', 'firewall', 'external-api', 'message-broker',
  'container', 'serverless', 'client',
  'default',
];

const VALID_EDGE_TYPES: NonNullable<EdgeData['type']>[] = [
  'dependency',
  'import',
  'calls',
  'extends',
  'implements',
  'sends',
  'receives',
  'reads',
  'writes',
];

const VALID_EDGE_STRENGTHS: NonNullable<EdgeData['strength']>[] = ['weak', 'normal', 'strong'];
const VALID_EDGE_DIRECTIONS: NonNullable<EdgeData['direction']>[] = ['one-way', 'two-way'];

function clampMaxTokens(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 2000;
  return Math.min(8192, Math.max(64, Math.floor(value)));
}

function clampTemperature(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.7;
  return Math.min(1, Math.max(0, value));
}

function normalizeCategory(rawCategory: unknown): NodeCategory {
  if (typeof rawCategory === 'string' && VALID_NODE_CATEGORIES.includes(rawCategory as NodeCategory)) {
    return rawCategory as NodeCategory;
  }
  return 'default';
}

function normalizeEdgeType(rawType: unknown): EdgeData['type'] {
  if (typeof rawType === 'string' && VALID_EDGE_TYPES.includes(rawType as NonNullable<EdgeData['type']>)) {
    return rawType as EdgeData['type'];
  }
  return 'dependency';
}

function normalizeEdgeStrength(rawStrength: unknown): EdgeData['strength'] {
  if (typeof rawStrength === 'string' && VALID_EDGE_STRENGTHS.includes(rawStrength as NonNullable<EdgeData['strength']>)) {
    return rawStrength as EdgeData['strength'];
  }
  return 'normal';
}

function normalizeEdgeDirection(rawDirection: unknown): EdgeData['direction'] {
  if (typeof rawDirection === 'string' && VALID_EDGE_DIRECTIONS.includes(rawDirection as NonNullable<EdgeData['direction']>)) {
    return rawDirection as EdgeData['direction'];
  }
  return 'one-way';
}

function createWorkingCanvasState(
  canvasContext: CanvasSyncSnapshot | null | undefined,
  allNodesContext: SyncedCanvasNode[] | null | undefined,
  repoDetails?: { owner: string; repo: string } | null,
): WorkingCanvasState {
  return {
    project: canvasContext?.project || {
      id: 'live-canvas',
      name: repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : 'Untitled Project',
      source: repoDetails ? 'github' : 'empty',
      repo: repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : undefined,
    },
    layoutDirection: canvasContext?.layoutDirection || 'TB',
    selectedNodeId: canvasContext?.selectedNodeId || null,
    selectedNodeLabel: canvasContext?.selectedNodeLabel || null,
    nodes: (canvasContext?.nodes || allNodesContext || []).map((node) => ({ ...node })),
    edges: (canvasContext?.edges || []).map((edge) => ({ ...edge })),
  };
}

function summarizeCanvasState(state: WorkingCanvasState): string {
  const nodeLines = state.nodes.slice(0, 50).map((node) => (
    `- node id="${node.id}" label="${node.label}" category=${node.category || 'default'} pos=(${Math.round(node.position.x)},${Math.round(node.position.y)})${node.files?.length ? ` files=${node.files.length}` : ''}${node.description ? ` desc="${node.description.slice(0, 60)}"` : ''}`
  ));
  const edgeLines = state.edges.slice(0, 50).map((edge) => {
    const srcNode = state.nodes.find((n) => n.id === edge.source);
    const tgtNode = state.nodes.find((n) => n.id === edge.target);
    return `- edge id="${edge.id}": "${srcNode?.label || edge.source}" -> "${tgtNode?.label || edge.target}"${edge.label ? ` label="${edge.label}"` : ''}${edge.type ? ` type=${edge.type}` : ''}`;
  });

  return [
    `Project: ${state.project.name}`,
    `Layout: ${state.layoutDirection}`,
    `Selected Node: ${state.selectedNodeLabel || 'None'}`,
    `Node Count: ${state.nodes.length}`,
    `Edge Count: ${state.edges.length}`,
    'Nodes:',
    ...(nodeLines.length > 0 ? nodeLines : ['- none']),
    'Edges:',
    ...(edgeLines.length > 0 ? edgeLines : ['- none']),
  ].join('\n');
}

function summarizeToolTranscript(transcript: ToolTranscriptEntry[]): string {
  if (transcript.length === 0) return 'No tool calls yet.';

  return transcript.map((entry, index) => {
    let resultText: string;
    if (typeof entry.result === 'string') {
      resultText = entry.result;
    } else {
      // For read results with file content, keep more content
      // so the planner has enough context to build architecture diagrams
      const result = entry.result as Record<string, unknown> | null;
      if (entry.tool === 'read' && result?.content && typeof result.content === 'string') {
        const content = result.content as string;
        // Keep up to 10000 chars of file content for architecture analysis
        const truncatedContent = content.length > 10000
          ? `${content.slice(0, 10000)}\n... (truncated ${content.length - 10000} chars)`
          : content;
        resultText = JSON.stringify({ ...result, content: truncatedContent }, null, 2);
      } else {
        resultText = JSON.stringify(entry.result, null, 2);
      }
    }
    return [
      `Step ${index + 1}`,
      `Tool: ${entry.tool}`,
      `Input: ${JSON.stringify(entry.input, null, 2)}`,
      `Result: ${resultText}`,
    ].join('\n');
  }).join('\n\n');
}

function buildPlannerSystemPrompt(mode: ChatMode): string {
  const commonTools = [
    'read: { "path": "src/app/page.tsx" } → read a repository file, preferring cached content when available.',
    'session: { "action": "search", "query": "auth", "entity": "nodes" | "edges" | "all", "limit": 10 } → search the current canvas session.',
    'session: { "action": "get", "scope": "summary" | "selected" | "node" | "edge", "id"?: "...", "label"?: "...", "sourceId"?: "...", "targetId"?: "..." } → fetch session or graph details.',
  ];

  const writeTool = [
    'write: modify the live canvas (one operation). Input shapes by action:',
    '  add_node: { "action": "add_node", "node": { "label": "Auth", "description": "...", "category": "auth", "files": [...], "complexity": "medium" } }',
    '  edit_node: { "action": "edit_node", "target": { "id": "node-1" } OR { "label": "Auth" }, "changes": { "label": "...", "description": "...", "category": "..." } }',
    '  delete_node: { "action": "delete_node", "target": { "id": "node-1" } OR { "label": "Auth" } }',
    '  add_edge: { "action": "add_edge", "edge": { "sourceLabel": "Auth", "targetLabel": "Database", "label": "reads", "type": "reads", "strength": "normal", "direction": "one-way" } }',
    '  edit_edge: { "action": "edit_edge", "target": { "id": "edge-1" } OR { "sourceId": "...", "targetId": "..." }, "changes": { "label": "...", "type": "...", "strength": "...", "direction": "..." } }',
    '  delete_edge: { "action": "delete_edge", "target": { "id": "edge-1" } OR { "sourceId": "...", "targetId": "...", "label": "..." } }',
  ].join('\n');

  const writeBatchTool = [
    'write_batch: add/edit/delete MULTIPLE nodes and edges in ONE step. Use this when creating or rebuilding architecture diagrams.',
    '  Input: { "operations": [ ...array of write operations... ] }',
    '  RULES FOR write_batch:',
    '  - Put ALL add_node operations FIRST, then ALL add_edge operations AFTER.',
    '  - Edges reference nodes by sourceLabel/targetLabel (the exact label string you gave the node).',
    '  - Positions are AUTO-COMPUTED by dagre layout. NEVER specify position.',
    '  - Every node MUST have a label, description, and category.',
    '  - Every edge MUST have sourceLabel, targetLabel, label, and type.',
  ].join('\n');

  const validEnums = [
    'Valid categories: api, component, config, database, auth, utility, test, style, asset, documentation, core, service, hook, context, middleware, model, route, cache, queue, load-balancer, gateway, storage, cdn, proxy, firewall, external-api, message-broker, container, serverless, client, default.',
    'Valid edge types: dependency, import, calls, extends, implements, sends, receives, reads, writes.',
    'Valid edge strengths: weak, normal, strong.',
    'Valid edge directions: one-way, two-way.',
  ].join('\n');

  const agentRules = [
    'CRITICAL RULES:',
    '1. You output EXACTLY ONE raw JSON object per invocation. NO markdown. NO code fences. NO prose. NO explanation.',
    '2. You will be called repeatedly (up to 25 steps). Each call = one tool.',
    '3. ALWAYS prefer write_batch over individual write calls when creating 2+ nodes.',
    '4. DO NOT specify position coordinates — dagre auto-layouts all nodes.',
    '5. Use session/search BEFORE editing/deleting to discover existing node/edge IDs.',
    '6. When the user asks to edit/update/change/modify/restructure/rebuild/create the canvas/flowchart/diagram:',
    '   a) FIRST read any relevant files to understand the architecture',
    '   b) THEN call write_batch with ALL nodes and edges in a single step',
    '   c) Only return {"type":"final"} AFTER write_batch succeeds',
    '7. NEVER return {"type":"final"} if canvas edits are still needed. The final response is for the text reply AFTER all canvas changes are applied.',
    '8. NEVER generate code blocks, Python, JavaScript, or any programming language. Output ONLY the raw JSON tool call.',
    '9. If you have already read a file and understand the architecture, proceed IMMEDIATELY to write_batch. Do not re-read or hesitate.',
    '10. After a read tool returns file content, your VERY NEXT step should be write_batch (not another read or session call, unless you truly need more info).',
    '',
    'Architecture Analysis Guidelines (when building diagrams from code):',
    '- Identify distinct classes, subsystems, modules, or responsibilities. Create ONE node per logical component.',
    '- Use clear descriptive labels (e.g. "OpenAI Client" not "client", "Confidence Gate" not "gate").',
    '- Write DETAILED descriptions: mention key classes, functions, patterns, and what each component does. 2-3 sentences minimum.',
    '- Pick the most accurate category for each node.',
    '- Create edges showing actual data/control flow with descriptive labels (e.g. "validates tokens", "queries users table").',
    '- Edge types: "calls" for invocations, "reads"/"writes" for data, "sends"/"receives" for messaging, "implements" for interfaces, "extends" for inheritance, "dependency" for structural deps.',
    '- EVERY node must have at least one edge. No isolated nodes.',
    '- Aim for 5-15 well-connected nodes per file/module.',
  ];

  const askRules = [
    'Rules:',
    '- You output EXACTLY ONE raw JSON object per invocation. NO markdown. NO code fences. NO prose.',
    '- You control one tool per step (up to 25 steps total).',
    '- Use tools when you need exact file contents, IDs, or current graph state.',
    '- write and write_batch are FORBIDDEN in ask mode. Never call them.',
    '- Return {"type":"final"} once you have enough information to answer.',
  ];

  return [
    'You are the tool planner for Rassam, an AI canvas agent.',
    `Mode: ${mode}.`,
    '',
    '██ OUTPUT FORMAT ██',
    'Return EXACTLY one raw JSON object. NOTHING ELSE.',
    'DO NOT write code (no JavaScript, no Python, no await, no function calls).',
    'DO NOT use markdown code fences (no ```json, no ```).',
    'DO NOT explain anything. Just the raw JSON.',
    '',
    'RESPONSE SCHEMA (choose one):',
    '  Tool call → {"type":"tool","tool":"TOOLNAME","status":"short status","input":{...}}',
    '  Done     → {"type":"final"}',
    '',
    'Available tools:',
    ...commonTools,
    ...(mode === 'agent' ? [writeTool, '', writeBatchTool, '', validEnums] : []),
    '',
    ...(mode === 'agent' ? agentRules : askRules),
    '',
    '██ REMEMBER ██',
    'Your entire response must be a single JSON object starting with { and ending with }.',
    'WRONG: ```json\n{...}\n```',
    'WRONG: await ai.addNode({...})',
    'WRONG: tool_call = {...}',
    'CORRECT: {"type":"tool","tool":"write_batch","status":"...","input":{"operations":[...]}}',
  ].join('\n');
}

function buildPlannerMessage(
  message: string,
  mode: ChatMode,
  state: WorkingCanvasState,
  transcript: ToolTranscriptEntry[],
): string {
  const hasReadInTranscript = transcript.some((e) => e.tool === 'read');
  const hasWriteInTranscript = hasSuccessfulWrite(transcript);
  const needsWriteReminder = mode === 'agent' && requestLikelyNeedsCanvasWrite(message) && hasReadInTranscript && !hasWriteInTranscript;
  const hasFailedWrites = mode === 'agent' && transcript.some((e) =>
    (e.tool === 'write' || e.tool === 'write_batch') &&
    typeof e.result === 'object' && e.result !== null &&
    'ok' in e.result && (e.result as Record<string, unknown>).ok === false,
  );

  const lines = [
    `User request: ${message}`,
    `Mode: ${mode}`,
    'Current canvas state:',
    summarizeCanvasState(state),
    '',
    'Tool transcript so far:',
    summarizeToolTranscript(transcript),
  ];

  if (needsWriteReminder) {
    lines.push(
      '',
      '⚠️ MANDATORY ACTION REQUIRED:',
      'You have read file content but have NOT yet modified the canvas.',
      'Your VERY NEXT response MUST be a write_batch call with all nodes and edges.',
      'Output format: {"type":"tool","tool":"write_batch","status":"Building architecture","input":{"operations":[...]}}',
      'Put ALL add_node operations FIRST, then ALL add_edge operations.',
      'Use sourceLabel/targetLabel to reference nodes. Positions are auto-computed.',
      'Do NOT return {"type":"final"}. Do NOT generate code. Just output the JSON tool call.',
    );
  }

  if (hasFailedWrites) {
    lines.push(
      '',
      'Some write operations failed. Check the error messages in the transcript.',
      'Common fixes: ensure sourceLabel/targetLabel match EXACTLY the label given to add_node operations.',
      'If adding edges to newly created nodes, use the exact same label string.',
    );
  }

  return lines.join('\n');
}

function requestLikelyNeedsCanvasWrite(message: string): boolean {
  const normalized = message.toLowerCase();

  const directPatterns = [
    /make (?:me )?(?:a )?(?:new )?(?:flowchart|diagram|canvas|graph)/,
    /create (?:me )?(?:a )?(?:new )?(?:flowchart|diagram|canvas|graph)/,
    /build (?:me )?(?:a )?(?:new )?(?:flowchart|diagram|canvas|graph)/,
    /edit (?:the )?(?:flowchart|diagram|canvas|graph|canvas)/,
    /update (?:the )?(?:flowchart|diagram|canvas|graph)/,
    /modify (?:the )?(?:flowchart|diagram|canvas|graph)/,
    /change (?:the )?(?:flowchart|diagram|canvas|graph)/,
    /rebuild (?:the )?(?:flowchart|diagram|canvas|graph)/,
    /match (?:the )?(?:flowchart|diagram|canvas|graph).+(?:file|architecture|code)/,
    /match .+(?:architecture|structure|code)/,
    /make .+ flowchart .+ for .+/,
    /add (?:new )?(?:nodes?|components?|edges?) (?:for|to|describing|about)/,
    /(?:visualize|diagram|map out|chart) (?:the )?(?:architecture|structure|code|file|module)/,
    /(?:architecture|structure) (?:of|from|for|based on)/,
    // Broader patterns for common user phrasing
    /add (?:nodes?|components?) (?:describing|showing|representing|for|about|to)/,
    /(?:show|display|put|place|draw) .+(?:on|in|to) (?:the )?canvas/,
    /canvas .+(?:match|reflect|show|represent)/,
    /(?:design|architect|lay\s?out) .+(?:diagram|flowchart|canvas|architecture)/,
    /(?:convert|turn|transform) .+(?:into|to|as) (?:a )?(?:diagram|flowchart|graph)/,
  ];

  if (directPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const canvasTerms = ['flowchart', 'diagram', 'canvas', 'graph', 'node', 'nodes', 'edge', 'edges', 'architecture'];
  const writeVerbs = ['add', 'build', 'change', 'create', 'delete', 'draw', 'edit', 'make', 'match', 'modify', 'place', 'remove', 'replace', 'restructure', 'sync', 'update', 'visualize', 'map', 'chart', 'describe', 'design', 'architect', 'convert', 'generate', 'show', 'put', 'display'];
  const fileTerms = ['file', 'filename', 'module', 'component', 'class', 'function', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.md', 'architecture', 'code', 'codebase', 'structure', 'system', 'subsystem'];

  const mentionsCanvas = canvasTerms.some((term) => normalized.includes(term));
  const mentionsWrite = writeVerbs.some((term) => normalized.includes(term));
  const mentionsFile = fileTerms.some((term) => normalized.includes(term));

  return (mentionsCanvas && mentionsWrite) || (mentionsWrite && mentionsFile && mentionsCanvas);
}

function hasSuccessfulWrite(transcript: ToolTranscriptEntry[]): boolean {
  return transcript.some((entry) => (
    (entry.tool === 'write' || entry.tool === 'write_batch')
    && typeof entry.result === 'object'
    && entry.result !== null
    && 'ok' in entry.result
    && entry.result.ok === true
  ));
}

/**
 * Normalize a string that may contain Python/JS-style code into parseable JSON.
 * Handles True/False/None, trailing commas, and single-quoted strings.
 */
function codeToJson(text: string): string {
  return text
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Try to parse a single JS-style object literal from text.
 * Handles balanced braces to find the matching closing brace.
 */
function extractBalancedObject(text: string, startIndex: number): string | null {
  if (text[startIndex] !== '{') return null;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(startIndex, i + 1); }
  }
  return null;
}

/**
 * Extract node/edge data from arbitrary LLM code output (Python, JS, etc.).
 * Converts into write_batch operations.
 *
 * Handles MANY LLM failure modes:
 * 1. `await ai.addNode({label: "...", ...})` / `ai.addEdge({...})`
 * 2. Python dicts: `{"nodes": [...], "edges": [...]}`
 * 3. `tool_call = {"tool": "edit_canvas", "input": {"nodes": [...], ...}}`
 * 4. Direct `{"operations": [...]}`
 * 5. Array of operations: `[{"action": "add_node", ...}, ...]`
 */
function tryExtractWriteBatchFromCodeOutput(raw: string): WritePlanResult | null {
  const cleaned = stripCodeFences(raw);

  // ── Strategy 1: Extract addNode/addEdge function calls (JS/Python) ──
  const funcCallResult = extractFromFunctionCalls(cleaned);
  if (funcCallResult) return funcCallResult;

  // ── Strategy 2: Extract {nodes: [...], edges: [...]} or {operations: [...]} dicts ──
  const dictResult = extractFromDictStructure(cleaned);
  if (dictResult) return dictResult;

  return null;
}

/**
 * Extract nodes/edges from code containing function calls like:
 *   ai.addNode({id: "x", label: "Y", ...})
 *   ai.addEdge({source: "x", target: "y", ...})
 * Also handles Python-style calls.
 */
function extractFromFunctionCalls(text: string): WritePlanResult | null {
  const operations: Array<Record<string, unknown>> = [];
  const labelById = new Map<string, string>();

  // Match addNode / add_node function calls and extract the object argument
  const nodeCallRegex = /(?:addNode|add_node|addComponent|createNode)\s*\(/g;
  let match;
  while ((match = nodeCallRegex.exec(text)) !== null) {
    const objStart = text.indexOf('{', match.index + match[0].length);
    if (objStart < 0) continue;
    const objStr = extractBalancedObject(text, objStart);
    if (!objStr) continue;

    const node = safeParseLooseJson(codeToJson(objStr));
    if (!node || Array.isArray(node)) continue;

    const label = resolveNodeLabel(node);
    if (!label) continue;

    if (typeof node.id === 'string') labelById.set(node.id, label);

    operations.push({
      action: 'add_node',
      node: buildNodeFromExtracted(node, label),
    });
  }

  // Match addEdge / add_edge function calls
  const edgeCallRegex = /(?:addEdge|add_edge|createEdge|addConnection)\s*\(/g;
  while ((match = edgeCallRegex.exec(text)) !== null) {
    const objStart = text.indexOf('{', match.index + match[0].length);
    if (objStart < 0) continue;
    const objStr = extractBalancedObject(text, objStart);
    if (!objStr) continue;

    const edge = safeParseLooseJson(codeToJson(objStr));
    if (!edge || Array.isArray(edge)) continue;

    const edgeOp = buildEdgeFromExtracted(edge, labelById);
    if (edgeOp) operations.push(edgeOp);
  }

  return operations.length >= 2 ? { operations } : null;
}

/**
 * Extract from dict/object structures like {nodes: [...], edges: [...]}
 * or {operations: [...]} or {input: {nodes: [...], ...}}.
 */
function extractFromDictStructure(text: string): WritePlanResult | null {
  const operations: Array<Record<string, unknown>> = [];
  const labelById = new Map<string, string>();

  // Try to find the largest JSON-like object in the text
  let parsed: Record<string, unknown> | null = null;

  // Try direct parse first
  const direct = safeParseLooseJson(codeToJson(text));
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    parsed = direct;
  }

  // Try extracting from start of first { to last }
  if (!parsed) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = safeParseLooseJson(codeToJson(text.slice(firstBrace, lastBrace + 1)));
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsed = candidate;
      }
    }
  }

  // Try extracting a top-level array
  if (!parsed) {
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const candidate = safeParseLooseJson(codeToJson(text.slice(firstBracket, lastBracket + 1)));
      if (Array.isArray(candidate)) {
        // Check if it's an operations array
        const validOps = candidate.filter((op): op is Record<string, unknown> =>
          !!op && typeof op === 'object' && typeof (op as Record<string, unknown>).action === 'string'
        );
        if (validOps.length > 0) return { operations: validOps };
      }
    }
  }

  if (!parsed) return null;

  // Unwrap nested structures: {tool: "...", input: {nodes: ...}} or {input: {operations: ...}}
  const unwrapped = (parsed.input && typeof parsed.input === 'object' && !Array.isArray(parsed.input))
    ? parsed.input as Record<string, unknown>
    : parsed;

  // Handle already-formatted operations array
  if (Array.isArray(unwrapped.operations)) {
    const validOps = unwrapped.operations.filter((op): op is Record<string, unknown> =>
      !!op && typeof op === 'object' && typeof (op as Record<string, unknown>).action === 'string'
    );
    if (validOps.length > 0) return { operations: validOps };
  }

  // Convert nodes/edges format to operations
  const nodes = Array.isArray(unwrapped.nodes) ? unwrapped.nodes : [];
  const edges = Array.isArray(unwrapped.edges) ? unwrapped.edges : [];

  if (nodes.length === 0 && edges.length === 0) return null;

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const n = node as Record<string, unknown>;
    const label = resolveNodeLabel(n);
    if (!label) continue;
    if (typeof n.id === 'string') labelById.set(n.id, label);
    operations.push({ action: 'add_node', node: buildNodeFromExtracted(n, label) });
  }

  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    const edgeOp = buildEdgeFromExtracted(edge as Record<string, unknown>, labelById);
    if (edgeOp) operations.push(edgeOp);
  }

  return operations.length > 0 ? { operations } : null;
}

/** Safely parse JSON that may have minor formatting issues */
function safeParseLooseJson(text: string): Record<string, unknown> | unknown[] | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Try removing comments (// style)
    const noComments = text.replace(/\/\/[^\n]*/g, '');
    try {
      return JSON.parse(noComments) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/** Extract a usable label from a node-like object with various key naming conventions */
function resolveNodeLabel(n: Record<string, unknown>): string {
  if (typeof n.label === 'string' && n.label.trim()) return n.label.trim();
  if (typeof n.name === 'string' && n.name.trim()) return n.name.trim();
  if (typeof n.title === 'string' && n.title.trim()) return n.title.trim();
  if (typeof n.id === 'string' && n.id.trim()) {
    // Convert kebab-case / snake_case IDs to readable labels
    return n.id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return '';
}

/** Build a normalized add_node operation from extracted data */
function buildNodeFromExtracted(n: Record<string, unknown>, label: string): Record<string, unknown> {
  // Extract description from various possible keys
  const description = typeof n.description === 'string' ? n.description :
    typeof n.details === 'string' ? n.details :
    (n.properties && typeof n.properties === 'object' && typeof (n.properties as Record<string, unknown>).description === 'string')
      ? (n.properties as Record<string, unknown>).description as string : '';

  // Extract category from various possible keys
  const rawCategory = n.category || n.type ||
    (n.properties && typeof n.properties === 'object' && (n.properties as Record<string, unknown>).type) ||
    'default';

  return {
    label,
    description,
    category: normalizeCategory(rawCategory),
    files: Array.isArray(n.files) ? n.files.filter((f: unknown) => typeof f === 'string') : [],
    complexity: n.complexity === 'low' || n.complexity === 'medium' || n.complexity === 'high'
      ? n.complexity : 'medium',
  };
}

/** Build a normalized add_edge operation from extracted data */
function buildEdgeFromExtracted(
  e: Record<string, unknown>,
  labelById: Map<string, string>,
): Record<string, unknown> | null {
  // Resolve source/target from various naming conventions
  const sourceLabel = typeof e.sourceLabel === 'string' ? e.sourceLabel :
    typeof e.from === 'string' ? (labelById.get(e.from) || e.from) :
    typeof e.source === 'string' ? (labelById.get(e.source) || e.source) : '';
  const targetLabel = typeof e.targetLabel === 'string' ? e.targetLabel :
    typeof e.to === 'string' ? (labelById.get(e.to) || e.to) :
    typeof e.target === 'string' ? (labelById.get(e.target) || e.target) : '';

  if (!sourceLabel || !targetLabel) return null;

  // Extract label from various keys
  const edgeLabel = typeof e.label === 'string' ? e.label :
    (e.properties && typeof e.properties === 'object' && typeof (e.properties as Record<string, unknown>).relationship === 'string')
      ? (e.properties as Record<string, unknown>).relationship as string : '';

  return {
    action: 'add_edge',
    edge: {
      sourceLabel,
      targetLabel,
      label: edgeLabel,
      type: normalizeEdgeType(e.type),
      strength: normalizeEdgeStrength(e.strength),
      direction: normalizeEdgeDirection(e.direction),
    },
  };
}

function buildFallbackWriteSystemPrompt(): string {
  return [
    'You are a canvas write-plan generator for Rassam, an AI architecture diagram tool.',
    'OUTPUT FORMAT: A single raw JSON object. NOTHING ELSE. No markdown fences. No code blocks. No explanation text. No Python. No JavaScript.',
    '',
    'Your job: output concrete canvas write operations to build an architecture diagram.',
    'Actions: add_node, edit_node, delete_node, add_edge, edit_edge, delete_edge.',
    '',
    'Required JSON structure:',
    '{"operations":[<nodes first, then edges>],"summary":"<1-line description>"}',
    '',
    'Node format: {"action":"add_node","node":{"label":"<name>","description":"<detailed 2-3 sentence desc>","category":"<valid category>","files":["path/to/file"],"complexity":"medium"}}',
    'Edge format: {"action":"add_edge","edge":{"sourceLabel":"<exact node label>","targetLabel":"<exact node label>","label":"<relationship>","type":"<valid type>","strength":"normal","direction":"one-way"}}',
    '',
    'Rules:',
    '- DO NOT specify position — auto-computed by dagre.',
    '- Put ALL add_node ops FIRST, then add_edge ops.',
    '- Edges use sourceLabel/targetLabel matching EXACT label text of an add_node.',
    '- Every node MUST have at least one edge.',
    '- Use descriptive edge labels (e.g. "validates tokens", "queries users").',
    '- Write rich node descriptions with 2-3 sentences mentioning key classes/functions.',
    '- Valid categories: api, component, config, database, auth, utility, test, style, asset, documentation, core, service, hook, context, middleware, model, route, cache, queue, load-balancer, gateway, storage, cdn, proxy, firewall, external-api, message-broker, container, serverless, client, default.',
    '- Valid edge types: dependency, import, calls, extends, implements, sends, receives, reads, writes.',
    '- Valid edge strengths: weak, normal, strong.',
    '- 5-15 well-connected nodes per file/module.',
  ].join('\n');
}

function safeJsonParseWritePlan(value: string): WritePlanResult | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parseCandidate = (candidate: string): WritePlanResult | null => {
    try {
      const parsed = JSON.parse(stripCodeFences(candidate)) as unknown;

      if (Array.isArray(parsed)) {
        const operations = parsed.filter((item): item is Record<string, unknown> => (
          !!item && typeof item === 'object' && !Array.isArray(item)
        ));
        return operations.length ? { operations } : null;
      }

      if (!parsed || typeof parsed !== 'object') return null;

      const record = parsed as Record<string, unknown>;
      const operations = Array.isArray(record.operations)
        ? record.operations.filter((item): item is Record<string, unknown> => (
            !!item && typeof item === 'object' && !Array.isArray(item)
          ))
        : Array.isArray(record.writes)
          ? record.writes.filter((item): item is Record<string, unknown> => (
              !!item && typeof item === 'object' && !Array.isArray(item)
            ))
          : [];

      if (!operations.length) return null;

      return {
        operations,
        summary: typeof record.summary === 'string' ? record.summary : undefined,
      };
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(trimmed);
  if (direct) return direct;

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const extracted = parseCandidate(trimmed.slice(objectStart, objectEnd + 1));
    if (extracted) return extracted;
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return parseCandidate(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  return null;
}

async function generateFallbackWritePlan(
  message: string,
  state: WorkingCanvasState,
  transcript: ToolTranscriptEntry[],
  runtimeSettings: ChatRuntimeSettings | undefined,
): Promise<WritePlanResult | null> {
  const provider = getProvider(runtimeSettings?.providerId);

  try {
    const raw = await provider.chat({
      system: buildFallbackWriteSystemPrompt(),
      message: [
        `Original user request: ${message}`,
        '',
        'Current canvas state:',
        summarizeCanvasState(state),
        '',
        'Tool transcript:',
        summarizeToolTranscript(transcript),
        '',
        'OUTPUT ONLY THE JSON OBJECT. No code blocks. No explanation.',
      ].join('\n'),
      temperature: 0.1,
      maxTokens: 4096,
      model: runtimeSettings?.model || undefined,
    });

    // Try standard JSON parse first
    const jsonResult = safeJsonParseWritePlan(raw);
    if (jsonResult) return jsonResult;

    // Fall back to code-output extraction (handles Python dicts, code blocks, etc.)
    return tryExtractWriteBatchFromCodeOutput(raw);
  } catch {
    return null;
  }
}

function buildFinalSystemMessage(
  baseSystemMessage: string,
  mode: ChatMode,
  state: WorkingCanvasState,
  transcript: ToolTranscriptEntry[],
): string {
  const modeInstruction = mode === 'agent'
    ? 'You may explain the canvas changes you made. If you changed the live canvas, mention that the synced AI snapshot may still need a manual sync.'
    : 'You are in ask mode. You can explain findings, but you must not claim to have modified the canvas.';

  return [
    baseSystemMessage,
    '',
    'LIVE CANVAS STATE FOR THIS TURN:',
    summarizeCanvasState(state),
    '',
    'TOOL TRANSCRIPT FOR THIS TURN:',
    summarizeToolTranscript(transcript),
    '',
    'FINAL RESPONSE RULES:',
    '- Answer the user directly and clearly.',
    '- If tools were used, incorporate the findings naturally.',
    `- ${modeInstruction}`,
    '- Keep markdown readable and concise.',
  ].join('\n');
}

function stripCodeFences(text: string): string {
  // Remove markdown code fences like ```json, ```python, ``` etc.
  let result = text.trim();
  // Match opening fence (with optional language tag) at start or after whitespace
  result = result.replace(/^\s*```(?:json|python|javascript|typescript|\w+)?\s*\n?/i, '');
  // Match closing fence at end
  result = result.replace(/\n?\s*```\s*$/i, '');
  return result.trim();
}

function safeJsonParse(value: string): PlannerDecision | null {
  const trimmed = stripCodeFences(value.trim());
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as PlannerDecision;
  } catch {
    // Try to extract JSON object from surrounding text
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as PlannerDecision;
      } catch {
        /* fall through */
      }
    }

    // Try to find JSON embedded in code-like constructs
    // e.g. tool_call = { ... } or const result = { ... }
    const assignmentMatch = trimmed.match(/(?:=|:)\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (assignmentMatch) {
      try {
        return JSON.parse(assignmentMatch[1]) as PlannerDecision;
      } catch {
        /* fall through */
      }
    }

    // Last resort: if the text contains code with addNode/addEdge calls,
    // try to extract them and form a write_batch decision
    if (trimmed.match(/(?:addNode|add_node|addEdge|add_edge)\s*\(/)) {
      const extractedPlan = tryExtractWriteBatchFromCodeOutput(trimmed);
      if (extractedPlan && extractedPlan.operations.length > 0) {
        return {
          type: 'tool',
          tool: 'write_batch',
          status: 'Building architecture diagram',
          input: { operations: extractedPlan.operations },
        };
      }
    }

    return null;
  }
}

function stripLargeContent(content: string, limit = 4000): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n... (truncated)`;
}

function omitKeys(
  input: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> {
  if (!input) return {};

  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !keys.includes(key)),
  );
}

function findNodeByReference(
  state: WorkingCanvasState,
  target: Record<string, unknown> | undefined,
): SyncedCanvasNode | null {
  if (!target) return null;

  const id = typeof target.id === 'string' ? target.id.trim() : '';
  if (id) {
    return state.nodes.find((node) => node.id === id) || null;
  }

  const label = typeof target.label === 'string' ? target.label.trim().toLowerCase() : '';
  if (label) {
    return state.nodes.find((node) => node.label.trim().toLowerCase() === label)
      || state.nodes.find((node) => node.label.toLowerCase().includes(label))
      || null;
  }

  return null;
}

function findEdgeByReference(
  state: WorkingCanvasState,
  target: Record<string, unknown> | undefined,
): SyncedCanvasEdge | null {
  if (!target) return null;

  const id = typeof target.id === 'string' ? target.id.trim() : '';
  if (id) {
    return state.edges.find((edge) => edge.id === id) || null;
  }

  const sourceId = typeof target.sourceId === 'string' ? target.sourceId.trim() : '';
  const targetId = typeof target.targetId === 'string' ? target.targetId.trim() : '';
  const label = typeof target.label === 'string' ? target.label.trim().toLowerCase() : '';

  // At least one criterion is required to avoid matching the first edge arbitrarily
  if (!sourceId && !targetId && !label) return null;

  return state.edges.find((edge) => {
    const sourceMatches = sourceId ? edge.source === sourceId : true;
    const targetMatches = targetId ? edge.target === targetId : true;
    const labelMatches = label ? (edge.label || '').toLowerCase().includes(label) : true;
    return sourceMatches && targetMatches && labelMatches;
  }) || null;
}

function resolveEdgeEndpoint(
  state: WorkingCanvasState,
  value: unknown,
  labelValue: unknown,
  transcript?: ToolTranscriptEntry[],
): SyncedCanvasNode | null {
  // 1) Direct ID match
  if (typeof value === 'string' && value.trim()) {
    const found = state.nodes.find((node) => node.id === value.trim());
    if (found) return found;
  }

  // 2) Label match (exact → includes → transcript fallback)
  if (typeof labelValue === 'string' && labelValue.trim()) {
    const normalized = labelValue.trim().toLowerCase();
    // Exact match
    const exact = state.nodes.find((node) => node.label.trim().toLowerCase() === normalized);
    if (exact) return exact;
    // Partial match
    const partial = state.nodes.find((node) => node.label.toLowerCase().includes(normalized));
    if (partial) return partial;
    // Reverse partial: label is a substring of the search term
    const reversePartial = state.nodes.find((node) => normalized.includes(node.label.toLowerCase()));
    if (reversePartial) return reversePartial;
  }

  // 3) Search transcript for recently added nodes matching the label
  if (transcript && typeof labelValue === 'string' && labelValue.trim()) {
    const normalized = labelValue.trim().toLowerCase();
    for (const entry of transcript) {
      if (entry.tool !== 'write') continue;
      const result = entry.result as Record<string, unknown> | null;
      if (!result || result.ok !== true) continue;
      const resultLabel = typeof result.label === 'string' ? result.label.toLowerCase() : '';
      const resultId = typeof result.nodeId === 'string' ? result.nodeId : '';
      if (resultId && (resultLabel === normalized || resultLabel.includes(normalized) || normalized.includes(resultLabel))) {
        const node = state.nodes.find((n) => n.id === resultId);
        if (node) return node;
      }
    }
  }

  // 4) If value looks like a label instead of an ID, try label matching
  if (typeof value === 'string' && value.trim() && !value.startsWith('agent-')) {
    const normalized = value.trim().toLowerCase();
    return state.nodes.find((node) => node.label.trim().toLowerCase() === normalized)
      || state.nodes.find((node) => node.label.toLowerCase().includes(normalized))
      || null;
  }

  return null;
}

function buildDefaultNodePosition(state: WorkingCanvasState): { x: number; y: number } {
  // Find a position that doesn't overlap with existing nodes
  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 120;
  const PADDING = 40;

  const occupiedRects = state.nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: NODE_WIDTH,
    h: NODE_HEIGHT,
  }));

  const overlaps = (x: number, y: number): boolean => {
    return occupiedRects.some((rect) => (
      x < rect.x + rect.w + PADDING &&
      x + NODE_WIDTH + PADDING > rect.x &&
      y < rect.y + rect.h + PADDING &&
      y + NODE_HEIGHT + PADDING > rect.y
    ));
  };

  // Try grid positions with generous spacing
  const columns = state.layoutDirection === 'LR' ? 4 : 5;
  const spacingX = NODE_WIDTH + 60;
  const spacingY = NODE_HEIGHT + 80;

  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < columns; col++) {
      const x = 80 + col * spacingX;
      const y = 80 + row * spacingY;
      if (!overlaps(x, y)) {
        return { x, y };
      }
    }
  }

  // Fallback: place below all existing nodes
  const maxY = occupiedRects.reduce((max, r) => Math.max(max, r.y + r.h), 0);
  return { x: 80, y: maxY + PADDING + 40 };
}

function normalizeNodeData(raw: Record<string, unknown>, fallbackLabel = 'New Node'): NodeData {
  return {
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : fallbackLabel,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    files: Array.isArray(raw.files) ? raw.files.filter((value): value is string => typeof value === 'string') : [],
    category: normalizeCategory(raw.category),
    complexity: raw.complexity === 'low' || raw.complexity === 'medium' || raw.complexity === 'high'
      ? raw.complexity
      : 'low',
    dependencies: Array.isArray(raw.dependencies)
      ? raw.dependencies.filter((value): value is string => typeof value === 'string')
      : undefined,
    exports: Array.isArray(raw.exports)
      ? raw.exports.filter((value): value is string => typeof value === 'string')
      : undefined,
  };
}

function createPlannerStatus(tool: PlannerToolName, input: Record<string, unknown> | undefined): string {
  if (tool === 'read') {
    const path = typeof input?.path === 'string' ? input.path : 'file';
    return `Calling tool read for ${path}`;
  }

  if (tool === 'write') {
    const action = typeof input?.action === 'string' ? input.action.replace(/_/g, ' ') : 'write';
    return `Calling tool write: ${action}`;
  }

  if (tool === 'write_batch') {
    const ops = Array.isArray(input?.operations) ? input.operations.length : 0;
    return `Applying ${ops} canvas operations`;
  }

  const action = typeof input?.action === 'string' ? input.action : 'get';
  return `Calling tool session/${action}`;
}

type ToolTranscriptEntry = {
  tool: 'read' | 'session' | 'write' | 'write_batch';
  input: Record<string, unknown> | undefined;
  result: unknown;
};

async function planNextStep(
  message: string,
  mode: ChatMode,
  state: WorkingCanvasState,
  transcript: ToolTranscriptEntry[],
  runtimeSettings: ChatRuntimeSettings | undefined,
): Promise<PlannerDecision> {
  const provider = getProvider(runtimeSettings?.providerId);
  const hasReadInTranscript = transcript.some((e) => e.tool === 'read');
  const hasWriteInTranscript = hasSuccessfulWrite(transcript);
  const needsWrite = mode === 'agent' && requestLikelyNeedsCanvasWrite(message) && hasReadInTranscript && !hasWriteInTranscript;

  // Try up to 3 attempts — more attempts for write-needed scenarios
  const maxAttempts = needsWrite ? 3 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const raw = await provider.chat({
        system: buildPlannerSystemPrompt(mode),
        message: buildPlannerMessage(message, mode, state, transcript),
        // Don't send full chat history to the planner — it confuses tool selection
        // The planner already gets the user's request and canvas state
        temperature: attempt === 0 ? 0.15 : 0.05, // Lower temperature on retries
        maxTokens: 4096,
        model: runtimeSettings?.model || undefined,
      });

      const decision = safeJsonParse(raw);
      if (decision) {
        // If the LLM returned "final" but we know canvas edits are needed, force a retry
        if (decision.type === 'final' && needsWrite && attempt < maxAttempts - 1) {
          continue;
        }
        return decision;
      }

      // Check if the LLM generated something that looks like a write_batch embedded
      // in code (e.g. Python dict with nodes/edges) — try to extract and convert
      if (needsWrite) {
        const extractedPlan = tryExtractWriteBatchFromCodeOutput(raw);
        if (extractedPlan) {
          return {
            type: 'tool',
            tool: 'write_batch',
            status: 'Building architecture diagram',
            input: { operations: extractedPlan.operations },
          };
        }
      }

      // Empty/unparseable response — retry
      if (attempt < maxAttempts - 1) continue;
    } catch {
      // Provider error — skip retry
    }

    break;
  }

  // If all attempts failed, gracefully fall through to final response generation
  return { type: 'final' };
}

async function executeReadTool(
  input: Record<string, unknown> | undefined,
  context: ReadToolContext,
): Promise<unknown> {
  const path = typeof input?.path === 'string' ? input.path.trim() : '';
  if (!path) {
    return { ok: false, error: 'Missing path for read tool.' };
  }

  const result = await context.readFile(path);
  if (!result.content) {
    return { ok: false, path: result.path, source: result.source, error: 'File content not available.' };
  }

  return {
    ok: true,
    path: result.path,
    source: result.source,
    content: stripLargeContent(result.content, 12000),
  };
}

function executeSessionTool(
  state: WorkingCanvasState,
  input: Record<string, unknown> | undefined,
): unknown {
  const action = typeof input?.action === 'string' ? input.action : 'get';

  if (action === 'search') {
    const query = typeof input?.query === 'string' ? input.query.trim().toLowerCase() : '';
    const entity = input?.entity === 'edges' || input?.entity === 'all' ? input.entity : 'nodes';
    const limit = typeof input?.limit === 'number' && input.limit > 0 ? Math.min(30, Math.floor(input.limit)) : 10;

    const nodes = entity !== 'edges'
      ? state.nodes
          .filter((node) => {
            if (!query) return true;
            return [node.id, node.label, node.description || '', node.category || '', ...(node.files || [])]
              .some((value) => value.toLowerCase().includes(query));
          })
          .slice(0, limit)
          .map((node) => ({
            id: node.id,
            label: node.label,
            category: node.category,
            description: node.description,
            position: node.position,
            files: node.files?.slice(0, 8) || [],
          }))
      : [];

    const edges = entity !== 'nodes'
      ? state.edges
          .filter((edge) => {
            if (!query) return true;
            // Also match by resolved node labels
            const srcNode = state.nodes.find((n) => n.id === edge.source);
            const tgtNode = state.nodes.find((n) => n.id === edge.target);
            return [edge.id, edge.source, edge.target, edge.label || '', edge.type || '', srcNode?.label || '', tgtNode?.label || '']
              .some((value) => value.toLowerCase().includes(query));
          })
          .slice(0, limit)
          .map((edge) => {
            const srcNode = state.nodes.find((n) => n.id === edge.source);
            const tgtNode = state.nodes.find((n) => n.id === edge.target);
            return {
              id: edge.id,
              source: edge.source,
              sourceLabel: srcNode?.label || edge.source,
              target: edge.target,
              targetLabel: tgtNode?.label || edge.target,
              label: edge.label,
              type: edge.type,
            };
          })
      : [];

    return { ok: true, action: 'search', query, entity, nodes, edges, totalNodes: state.nodes.length, totalEdges: state.edges.length };
  }

  const scope = typeof input?.scope === 'string' ? input.scope : 'summary';

  if (scope === 'selected') {
    const node = state.selectedNodeId
      ? state.nodes.find((item) => item.id === state.selectedNodeId) || null
      : null;

    return {
      ok: true,
      action: 'get',
      scope: 'selected',
      selectedNodeId: state.selectedNodeId || null,
      selectedNodeLabel: state.selectedNodeLabel || null,
      node,
    };
  }

  if (scope === 'node') {
    const node = findNodeByReference(state, input);
    return node
      ? { ok: true, action: 'get', scope: 'node', node }
      : { ok: false, action: 'get', scope: 'node', error: 'Node not found.' };
  }

  if (scope === 'edge') {
    const edge = findEdgeByReference(state, input);
    return edge
      ? { ok: true, action: 'get', scope: 'edge', edge }
      : { ok: false, action: 'get', scope: 'edge', error: 'Edge not found.' };
  }

  return {
    ok: true,
    action: 'get',
    scope: 'summary',
    project: state.project,
    layoutDirection: state.layoutDirection,
    selectedNodeId: state.selectedNodeId || null,
    selectedNodeLabel: state.selectedNodeLabel || null,
    nodeCount: state.nodes.length,
    edgeCount: state.edges.length,
  };
}

function executeWriteTool(
  state: WorkingCanvasState,
  input: Record<string, unknown> | undefined,
  transcript?: ToolTranscriptEntry[],
): { result: unknown; operation?: ChatCanvasWriteOperation } {
  const action = typeof input?.action === 'string' ? input.action : '';

  if (action === 'add_node') {
    const nodeInput = (input?.node && typeof input.node === 'object'
      ? input.node
      : omitKeys(input, ['action'])
    ) as Record<string, unknown> | undefined;
    const nodeId = `agent-node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const position = nodeInput?.position && typeof nodeInput.position === 'object'
      ? {
          x: Number((nodeInput.position as Record<string, unknown>).x) || buildDefaultNodePosition(state).x,
          y: Number((nodeInput.position as Record<string, unknown>).y) || buildDefaultNodePosition(state).y,
        }
      : buildDefaultNodePosition(state);
    const data = normalizeNodeData(nodeInput || {}, 'New Node');

    const node: SyncedCanvasNode = {
      id: nodeId,
      label: data.label,
      description: data.description,
      category: data.category,
      files: data.files,
      complexity: data.complexity,
      dependencies: data.dependencies,
      exports: data.exports,
      position,
    };

    state.nodes.push(node);

    const operation: ChatCanvasWriteOperation = {
      action: 'add_node',
      node: {
        id: nodeId,
        type: 'enhanced',
        position,
        data,
      },
      summary: `Added node ${data.label}`,
    };

    return {
      result: { ok: true, action, nodeId, label: data.label },
      operation,
    };
  }

  if (action === 'edit_node') {
    const nodeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const target = findNodeByReference(state, nodeRef);
    if (!target) {
      return { result: { ok: false, action, error: 'Node not found.' } };
    }

    // Prefer input.changes, but fall back to input itself (excluding meta keys) when LLM puts changes at top level
    const rawChanges = (input?.changes && typeof input.changes === 'object')
      ? input.changes as Record<string, unknown>
      : omitKeys(input, ['action', 'target', 'id', 'label']);
    const changes = rawChanges;
    const nextNode: SyncedCanvasNode = {
      ...target,
      label: typeof changes.label === 'string' && changes.label.trim() ? changes.label.trim() : target.label,
      description: typeof changes.description === 'string' ? changes.description.trim() : target.description,
      category: changes.category !== undefined ? normalizeCategory(changes.category) : target.category,
      files: Array.isArray(changes.files)
        ? changes.files.filter((value): value is string => typeof value === 'string')
        : target.files,
      complexity: changes.complexity === 'low' || changes.complexity === 'medium' || changes.complexity === 'high'
        ? changes.complexity
        : target.complexity,
      dependencies: Array.isArray(changes.dependencies)
        ? changes.dependencies.filter((value): value is string => typeof value === 'string')
        : target.dependencies,
      exports: Array.isArray(changes.exports)
        ? changes.exports.filter((value): value is string => typeof value === 'string')
        : target.exports,
      position: changes.position && typeof changes.position === 'object'
        ? {
            x: Number((changes.position as Record<string, unknown>).x) || target.position.x,
            y: Number((changes.position as Record<string, unknown>).y) || target.position.y,
          }
        : target.position,
    };

    state.nodes = state.nodes.map((node) => node.id === target.id ? nextNode : node);
    if (state.selectedNodeId === target.id) {
      state.selectedNodeLabel = nextNode.label;
    }

    const operation: ChatCanvasWriteOperation = {
      action: 'edit_node',
      nodeId: target.id,
      changes: {
        label: nextNode.label,
        description: nextNode.description,
        category: nextNode.category,
        files: nextNode.files,
        complexity: nextNode.complexity,
        dependencies: nextNode.dependencies,
        exports: nextNode.exports,
        position: nextNode.position,
      },
      summary: `Updated node ${nextNode.label}`,
    };

    return {
      result: { ok: true, action, nodeId: target.id, label: nextNode.label },
      operation,
    };
  }

  if (action === 'delete_node') {
    const nodeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const target = findNodeByReference(state, nodeRef);
    if (!target) {
      return { result: { ok: false, action, error: 'Node not found.' } };
    }

    state.nodes = state.nodes.filter((node) => node.id !== target.id);
    state.edges = state.edges.filter((edge) => edge.source !== target.id && edge.target !== target.id);
    if (state.selectedNodeId === target.id) {
      state.selectedNodeId = null;
      state.selectedNodeLabel = null;
    }

    const operation: ChatCanvasWriteOperation = {
      action: 'delete_node',
      nodeId: target.id,
      summary: `Deleted node ${target.label}`,
    };

    return {
      result: { ok: true, action, nodeId: target.id, label: target.label },
      operation,
    };
  }

  if (action === 'add_edge') {
    const edgeInput = (input?.edge && typeof input.edge === 'object'
      ? input.edge
      : omitKeys(input, ['action'])
    ) as Record<string, unknown> | undefined;
    const source = resolveEdgeEndpoint(state, edgeInput?.sourceId, edgeInput?.sourceLabel, transcript);
    const target = resolveEdgeEndpoint(state, edgeInput?.targetId, edgeInput?.targetLabel, transcript);

    if (!source || !target) {
      const missingParts: string[] = [];
      if (!source) missingParts.push(`source "${edgeInput?.sourceLabel || edgeInput?.sourceId || '?'}"`);
      if (!target) missingParts.push(`target "${edgeInput?.targetLabel || edgeInput?.targetId || '?'}"`);
      return { result: { ok: false, action, error: `Node not found: ${missingParts.join(', ')}. Available nodes: ${state.nodes.map(n => n.label).join(', ')}` } };
    }

    const edgeId = `agent-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const edge: SyncedCanvasEdge = {
      id: edgeId,
      source: source.id,
      target: target.id,
      label: typeof edgeInput?.label === 'string' ? edgeInput.label.trim() : undefined,
      type: normalizeEdgeType(edgeInput?.type),
      strength: normalizeEdgeStrength(edgeInput?.strength),
      direction: normalizeEdgeDirection(edgeInput?.direction),
    };

    state.edges.push(edge);

    const operation: ChatCanvasWriteOperation = {
      action: 'add_edge',
      edge: {
        id: edgeId,
        source: source.id,
        target: target.id,
        type: 'custom',
        data: {
          label: edge.label,
          type: edge.type as EdgeData['type'],
          strength: edge.strength,
          direction: edge.direction,
        },
      },
      summary: `Added edge ${source.label} → ${target.label}`,
    };

    return {
      result: { ok: true, action, edgeId, sourceId: source.id, targetId: target.id },
      operation,
    };
  }

  if (action === 'edit_edge') {
    const edgeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const targetEdge = findEdgeByReference(state, edgeRef);
    if (!targetEdge) {
      return { result: { ok: false, action, error: 'Edge not found.' } };
    }

    // Prefer input.changes, but fall back to input itself (excluding meta keys) when LLM puts changes at top level
    const rawEdgeChanges = (input?.changes && typeof input.changes === 'object')
      ? input.changes as Record<string, unknown>
      : omitKeys(input, ['action', 'target', 'id']);
    const changes = rawEdgeChanges;
    const sourceNode = changes.sourceId || changes.sourceLabel
      ? resolveEdgeEndpoint(state, changes.sourceId, changes.sourceLabel)
      : state.nodes.find((node) => node.id === targetEdge.source) || null;
    const targetNode = changes.targetId || changes.targetLabel
      ? resolveEdgeEndpoint(state, changes.targetId, changes.targetLabel)
      : state.nodes.find((node) => node.id === targetEdge.target) || null;

    if (!sourceNode || !targetNode) {
      return { result: { ok: false, action, error: 'Updated source or target node not found.' } };
    }

    const nextEdge: SyncedCanvasEdge = {
      ...targetEdge,
      source: sourceNode.id,
      target: targetNode.id,
      label: typeof changes.label === 'string' ? changes.label.trim() : targetEdge.label,
      type: changes.type !== undefined ? normalizeEdgeType(changes.type) : targetEdge.type,
      strength: changes.strength !== undefined ? normalizeEdgeStrength(changes.strength) : targetEdge.strength,
      direction: changes.direction !== undefined ? normalizeEdgeDirection(changes.direction) : targetEdge.direction,
    };

    state.edges = state.edges.map((edge) => edge.id === targetEdge.id ? nextEdge : edge);

    const operation: ChatCanvasWriteOperation = {
      action: 'edit_edge',
      edgeId: targetEdge.id,
      changes: {
        source: nextEdge.source,
        target: nextEdge.target,
        data: {
          label: nextEdge.label,
          type: nextEdge.type as EdgeData['type'],
          strength: nextEdge.strength,
          direction: nextEdge.direction,
        },
      },
      summary: `Updated edge ${targetEdge.id}`,
    };

    return {
      result: { ok: true, action, edgeId: targetEdge.id },
      operation,
    };
  }

  if (action === 'delete_edge') {
    const edgeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const targetEdge = findEdgeByReference(state, edgeRef);
    if (!targetEdge) {
      return { result: { ok: false, action, error: 'Edge not found.' } };
    }

    state.edges = state.edges.filter((edge) => edge.id !== targetEdge.id);

    const operation: ChatCanvasWriteOperation = {
      action: 'delete_edge',
      edgeId: targetEdge.id,
      summary: `Deleted edge ${targetEdge.id}`,
    };

    return {
      result: { ok: true, action, edgeId: targetEdge.id }, operation };
  }

  return {
    result: { ok: false, action, error: 'Unsupported write action.' },
  };
}

/**
 * Auto-layout all nodes in the working canvas state using dagre.
 * Returns edit_node operations for every repositioned node.
 */
function autoLayoutWorkingState(state: WorkingCanvasState): ChatCanvasWriteOperation[] {
  if (state.nodes.length === 0) return [];

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 100;

  dagreGraph.setGraph({
    rankdir: state.layoutDirection || 'TB',
    nodesep: 80,
    ranksep: 100,
    edgesep: 30,
    marginx: 50,
    marginy: 50,
  });

  for (const node of state.nodes) {
    const filesCount = node.files?.length || 0;
    const extraHeight = filesCount > 5 ? 30 : 0;
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT + extraHeight });
  }

  for (const edge of state.edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const operations: ChatCanvasWriteOperation[] = [];

  for (const node of state.nodes) {
    const laidOut = dagreGraph.node(node.id);
    if (!laidOut) continue;

    const filesCount = node.files?.length || 0;
    const extraHeight = filesCount > 5 ? 30 : 0;
    const newPosition = {
      x: laidOut.x - NODE_WIDTH / 2,
      y: laidOut.y - (NODE_HEIGHT + extraHeight) / 2,
    };

    // Update working state position
    node.position = newPosition;

    // Create edit_node operation to send to client
    operations.push({
      action: 'edit_node',
      nodeId: node.id,
      changes: { position: newPosition },
      summary: `Repositioned ${node.label}`,
    });
  }

  return operations;
}

/**
 * Execute a batch of write operations in order, then auto-layout the result.
 * Returns all individual results and the layout operations.
 */
function executeWriteBatch(
  state: WorkingCanvasState,
  input: Record<string, unknown> | undefined,
  transcript: ToolTranscriptEntry[],
): { results: Array<{ result: unknown; operation?: ChatCanvasWriteOperation }>; layoutOps: ChatCanvasWriteOperation[] } {
  const operations = Array.isArray(input?.operations) ? input.operations : [];

  if (operations.length === 0) {
    return {
      results: [{ result: { ok: false, error: 'No operations provided for write_batch.' } }],
      layoutOps: [],
    };
  }

  const results: Array<{ result: unknown; operation?: ChatCanvasWriteOperation }> = [];

  // Sort: add_node first, then other operations, then add_edge last
  const sorted = [...operations].sort((a, b) => {
    const order = (op: unknown): number => {
      const action = (op as Record<string, unknown>)?.action;
      if (action === 'add_node') return 0;
      if (action === 'edit_node') return 1;
      if (action === 'delete_node') return 2;
      if (action === 'delete_edge') return 3;
      if (action === 'edit_edge') return 4;
      if (action === 'add_edge') return 5;
      return 3;
    };
    return order(a) - order(b);
  });

  for (const op of sorted) {
    if (!op || typeof op !== 'object') continue;
    const writeResult = executeWriteTool(state, op as Record<string, unknown>, transcript);
    results.push(writeResult);

    // Record in transcript for subsequent edge resolution
    if (writeResult.operation) {
      transcript.push({
        tool: 'write',
        input: op as Record<string, unknown>,
        result: writeResult.result,
      });
    }
  }

  // Auto-layout after all operations
  const layoutOps = autoLayoutWorkingState(state);

  return { results, layoutOps };
}

function sanitizeHistory(history: ChatHistoryMessage[] | undefined): ChatHistoryMessage[] | undefined {
  if (!history || history.length === 0) return history;
  return history.map((entry) => ({
    ...entry,
    content: entry.content.replace(/^> \[tool\].*$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
  }));
}

async function* streamTextContent(text: string): AsyncIterable<ChatStreamEvent> {
  const chunkSize = 120;
  for (let index = 0; index < text.length; index += chunkSize) {
    yield { type: 'text', text: text.slice(index, index + chunkSize) };
  }
}

export async function* streamChatResponse(
  params: StreamChatResponseParams,
): AsyncIterable<ChatStreamEvent> {
  const {
    message,
    mode,
    context,
    repoDetails,
    allNodesContext,
    canvasContext,
    readmeContent,
    specificFile,
    runtimeSettings,
    history,
    cachedFiles,
    readFile,
  } = params;

  const provider = getProvider(runtimeSettings?.providerId);
  const baseSystemMessage = buildSystemMessage(
    context,
    repoDetails,
    allNodesContext,
    canvasContext,
    readmeContent,
    specificFile,
    message,
    cachedFiles,
  );
  const workingState = createWorkingCanvasState(canvasContext, allNodesContext, repoDetails);
  const transcript: ToolTranscriptEntry[] = [];
  const sanitizedHistory = sanitizeHistory(history);
  const requiresCanvasWrite = mode === 'agent' && requestLikelyNeedsCanvasWrite(message);
  let fallbackFinalContent: string | undefined;

  for (let step = 0; step < 25; step += 1) {
    const decision = await planNextStep(
      message,
      mode,
      workingState,
      transcript,
      runtimeSettings,
    );

    if (decision.type === 'final') {
      fallbackFinalContent = decision.content;
      break;
    }

    const input = decision.input as Record<string, unknown> | undefined;
    yield { type: 'status', text: decision.status || createPlannerStatus(decision.tool, input) };

    if (decision.tool === 'read') {
      const result = await executeReadTool(input, { readFile });
      transcript.push({ tool: 'read', input, result });
      continue;
    }

    if (decision.tool === 'session') {
      const result = executeSessionTool(workingState, input);
      transcript.push({ tool: 'session', input, result });
      continue;
    }

    if (mode !== 'agent') {
      transcript.push({
        tool: 'write',
        input,
        result: { ok: false, error: 'Write tool is not available in ask mode.' },
      });
      continue;
    }

    // === write_batch: batch operations with auto-layout ===
    if (decision.tool === 'write_batch') {
      const { results, layoutOps } = executeWriteBatch(workingState, input, transcript);

      // Emit each successful write operation to client
      for (const { result, operation } of results) {
        if (operation) {
          yield {
            type: 'write' as const,
            operation,
            text: operation.summary || 'Applied canvas change.',
          };
        }
        // Failed operations are already logged in transcript by executeWriteBatch
        if (typeof result === 'object' && result && 'ok' in result && !(result as Record<string, unknown>).ok) {
          const errMsg = (result as Record<string, unknown>).error || 'Write operation failed';
          yield { type: 'status' as const, text: `⚠ ${errMsg}` };
        }
      }

      // Emit layout repositioning operations
      if (layoutOps.length > 0) {
        yield { type: 'status' as const, text: `Auto-laying out ${workingState.nodes.length} nodes` };
        for (const layoutOp of layoutOps) {
          yield {
            type: 'write' as const,
            operation: layoutOp,
            text: layoutOp.summary || 'Repositioned node.',
          };
        }
      }

      continue;
    }

    // === Single write operation ===
    const { result, operation } = executeWriteTool(workingState, input, transcript);
    transcript.push({ tool: 'write', input, result });
    if (operation) {
      yield {
        type: 'write',
        operation,
        text: operation.summary || 'Applied canvas change.',
      };
    }
  }

  if (requiresCanvasWrite && !hasSuccessfulWrite(transcript)) {
    yield {
      type: 'status',
      text: 'Generating concrete canvas edits from the file and current graph.',
    };

    const fallbackPlan = await generateFallbackWritePlan(
      message,
      workingState,
      transcript,
      runtimeSettings,
    );

    if (fallbackPlan?.summary && !fallbackFinalContent) {
      fallbackFinalContent = fallbackPlan.summary;
    }

    // Execute fallback operations
    for (const operationInput of fallbackPlan?.operations || []) {
      const { result, operation } = executeWriteTool(workingState, operationInput, transcript);
      transcript.push({ tool: 'write', input: operationInput, result });

      if (operation) {
        yield {
          type: 'write',
          operation,
          text: operation.summary || 'Applied canvas change.',
        };
      }
    }

    // Auto-layout after fallback writes too
    if (hasSuccessfulWrite(transcript)) {
      const layoutOps = autoLayoutWorkingState(workingState);
      if (layoutOps.length > 0) {
        yield { type: 'status', text: `Auto-laying out ${workingState.nodes.length} nodes` };
        for (const layoutOp of layoutOps) {
          yield {
            type: 'write',
            operation: layoutOp,
            text: layoutOp.summary || 'Repositioned node.',
          };
        }
      }
    }
  }

  try {
    const finalSystemMessage = buildFinalSystemMessage(baseSystemMessage, mode, workingState, transcript);
    let emittedText = false;

    for await (const chunk of provider.chatStream({
      system: finalSystemMessage,
      message,
      history: sanitizedHistory,
      temperature: clampTemperature(runtimeSettings?.temperature),
      maxTokens: clampMaxTokens(runtimeSettings?.maxTokens),
      model: runtimeSettings?.model || undefined,
    })) {
      emittedText = true;
      yield { type: 'text', text: chunk };
    }

    if (!emittedText && fallbackFinalContent) {
      yield* streamTextContent(fallbackFinalContent);
    }
  } catch (error) {
    if (fallbackFinalContent) {
      yield* streamTextContent(fallbackFinalContent);
    } else {
      const messageText = error instanceof Error ? error.message : 'Unable to generate a response.';
      yield { type: 'error', text: messageText };
    }
  }

  yield { type: 'done' };
}
