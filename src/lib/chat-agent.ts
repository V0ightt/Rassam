import { buildSystemMessage } from '@/lib/ai';
import { getProvider } from '@/lib/llm';
import type { ChatHistoryMessage } from '@/lib/llm/types';
import type {
  CanvasSyncSnapshot,
  ChatCanvasWriteOperation,
  ChatMode,
  NodeData,
  SyncedCanvasNode,
} from '@/types';
import type { ToolTranscriptEntry, WorkingCanvasState } from '@/lib/chat-canvas';
import {
  createWorkingCanvasState,
  summarizeCanvasState,
  summarizeToolTranscript,
} from '@/lib/chat-canvas';
import {
  safeJsonParse,
  safeJsonParseWritePlan,
  tryExtractWriteBatchFromCodeOutput,
} from '@/lib/chat-parse';
import type { PlannerDecision, WritePlanResult } from '@/lib/chat-parse';
import {
  autoLayoutWorkingState,
  executeReadTool,
  executeSessionTool,
  executeWriteBatch,
  executeWriteTool,
} from '@/lib/chat-tools';

// ── Types ──

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

type PlannerToolName = Extract<PlannerDecision, { type: 'tool' }>['tool'];

// ── Settings helpers ──

function clampMaxTokens(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 2000;
  return Math.min(8192, Math.max(64, Math.floor(value)));
}

function clampTemperature(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.7;
  return Math.min(1, Math.max(0, value));
}

// ── Prompt builders ──

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

// ── Intent detection ──

/**
 * Detect if a message likely requires the planner loop (tool calls).
 * Returns false for simple conversational questions that can be answered
 * directly from the context already in the system prompt.
 */
function messageLikelyNeedsTools(message: string, mode: ChatMode): boolean {
  // Agent mode with canvas write intent always needs tools
  if (mode === 'agent' && requestLikelyNeedsCanvasWrite(message)) {
    return true;
  }

  const normalized = message.toLowerCase();

  // Explicit file read requests that the route's detectFileQueryIntent might miss
  const fileReadPatterns = [
    /(?:look at|check|read|open|inspect|examine|analyze|review)\s+(?:the\s+)?(?:file|source|contents?\s+of)\s/,
    /(?:show|display|print)\s+(?:me\s+)?(?:the\s+)?(?:code|file|source)\s/,
    /what(?:'s| is| are)\s+(?:in|inside)\s+[`"']?[\w/.-]+\.\w+/,
  ];

  // Session/canvas inspection that benefits from the search tool
  const sessionPatterns = [
    /(?:how many|count|number of)\s+(?:nodes?|edges?|components?|connections?)/,
    /(?:list|enumerate|show)\s+(?:all\s+)?(?:the\s+)?(?:nodes?|edges?|components?)/,
    /(?:find|search|look\s*for|filter)\s+(?:nodes?|edges?)/,
  ];

  if (fileReadPatterns.some(p => p.test(normalized))) return true;
  if (sessionPatterns.some(p => p.test(normalized))) return true;

  return false;
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

// ── Planner helpers ──

function hasSuccessfulWrite(transcript: ToolTranscriptEntry[]): boolean {
  return transcript.some((entry) => (
    (entry.tool === 'write' || entry.tool === 'write_batch')
    && typeof entry.result === 'object'
    && entry.result !== null
    && 'ok' in entry.result
    && entry.result.ok === true
  ));
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

// ── History sanitization ──

function sanitizeHistory(history: ChatHistoryMessage[] | undefined): ChatHistoryMessage[] | undefined {
  if (!history || history.length === 0) return history;
  return history.map((entry) => ({
    ...entry,
    content: entry.content.replace(/^> \[tool\].*$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
  }));
}

// ── Streaming helpers ──

async function* streamTextContent(text: string): AsyncIterable<ChatStreamEvent> {
  const chunkSize = 120;
  for (let index = 0; index < text.length; index += chunkSize) {
    yield { type: 'text', text: text.slice(index, index + chunkSize) };
  }
}

// ── Main entry point ──

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
  const sanitizedHistory = sanitizeHistory(history);
  const needsTools = messageLikelyNeedsTools(message, mode);

  // ── Fast path: skip the planner for simple questions ──
  // The system message already contains canvas context, selected node,
  // cached files, README, and specific file content.
  if (!needsTools) {
    try {
      for await (const chunk of provider.chatStream({
        system: baseSystemMessage,
        message,
        history: sanitizedHistory,
        temperature: clampTemperature(runtimeSettings?.temperature),
        maxTokens: clampMaxTokens(runtimeSettings?.maxTokens),
        model: runtimeSettings?.model || undefined,
      })) {
        yield { type: 'text', text: chunk };
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to generate a response.';
      yield { type: 'error', text: messageText };
    }
    yield { type: 'done' };
    return;
  }

  // ── Tool-assisted path: planner loop ──
  const workingState = createWorkingCanvasState(canvasContext, allNodesContext, repoDetails);
  const transcript: ToolTranscriptEntry[] = [];
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
