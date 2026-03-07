import {
  normalizeCategory,
  normalizeEdgeType,
  normalizeEdgeStrength,
  normalizeEdgeDirection,
} from '@/lib/chat-canvas';

// ── Types ──

export type PlannerDecision =
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

export interface WritePlanResult {
  operations: Array<Record<string, unknown>>;
  summary?: string;
}

// ── Low-level helpers ──

export function stripCodeFences(text: string): string {
  // Remove markdown code fences like ```json, ```python, ``` etc.
  let result = text.trim();
  // Match opening fence (with optional language tag) at start or after whitespace
  result = result.replace(/^\s*```(?:json|python|javascript|typescript|\w+)?\s*\n?/i, '');
  // Match closing fence at end
  result = result.replace(/\n?\s*```\s*$/i, '');
  return result.trim();
}

/**
 * Normalize a string that may contain Python/JS-style code into parseable JSON.
 * Handles True/False/None, trailing commas, and single-quoted strings.
 */
export function codeToJson(text: string): string {
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
export function extractBalancedObject(text: string, startIndex: number): string | null {
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

/** Safely parse JSON that may have minor formatting issues */
export function safeParseLooseJson(text: string): Record<string, unknown> | unknown[] | null {
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
export function resolveNodeLabel(n: Record<string, unknown>): string {
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
export function buildNodeFromExtracted(n: Record<string, unknown>, label: string): Record<string, unknown> {
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
export function buildEdgeFromExtracted(
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

// ── Composite extraction strategies ──

/**
 * Extract nodes/edges from code containing function calls like:
 *   ai.addNode({id: "x", label: "Y", ...})
 *   ai.addEdge({source: "x", target: "y", ...})
 * Also handles Python-style calls.
 */
export function extractFromFunctionCalls(text: string): WritePlanResult | null {
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
export function extractFromDictStructure(text: string): WritePlanResult | null {
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

// ── Top-level parsers ──

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
export function tryExtractWriteBatchFromCodeOutput(raw: string): WritePlanResult | null {
  const cleaned = stripCodeFences(raw);

  // ── Strategy 1: Extract addNode/addEdge function calls (JS/Python) ──
  const funcCallResult = extractFromFunctionCalls(cleaned);
  if (funcCallResult) return funcCallResult;

  // ── Strategy 2: Extract {nodes: [...], edges: [...]} or {operations: [...]} dicts ──
  const dictResult = extractFromDictStructure(cleaned);
  if (dictResult) return dictResult;

  return null;
}

export function safeJsonParse(value: string): PlannerDecision | null {
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

export function safeJsonParseWritePlan(value: string): WritePlanResult | null {
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
