// Browser client for POST /api/blueprint/edit ("tell Rassam what to change").

import { blueprintEditSchema, type BlueprintEdit } from "@/blueprint/edits";
import type { Blueprint } from "@/blueprint/schema";

import { invalidResponse, isRecord, requestJson } from "./http";

export interface BlueprintEditRequest {
  instruction: string;
  blueprint: Blueprint;
  context?: {
    edges?: Array<{ from: string; to: string; status: string }>;
    findings?: Array<{ kind: string; title: string }>;
    selection?: string[];
  };
  modelSettings?: { providerId: string; model: string; maxTokens?: number; temperature?: number };
}

export type BlueprintEditResult =
  | { kind: "edits"; source: "parser" | "model"; model?: string; edits: BlueprintEdit[]; interpretation: string; explanation?: string; questions?: string[] }
  | { kind: "ambiguous"; source: "parser"; message: string; options: Array<{ label: string; edits: BlueprintEdit[] }> }
  | { kind: "unknown"; source: "parser"; message: string; examples: string[]; modelUnavailable?: string };

const FRIENDLY_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "Too many change requests. Wait a little and try again.",
  REQUEST_IN_PROGRESS: "Another change request is still running. Wait for it to finish.",
  CAPACITY_EXCEEDED: "The server is busy. Try again in a moment.",
  SESSION_REQUIRED: "Your browser session has expired. Reload the page and try again.",
  REQUEST_TOO_LARGE: "This blueprint is too large to send to a model. Use a direct command instead.",
  PROVIDER_NOT_CONFIGURED: "The selected model provider is not configured on this server.",
  MODEL_NOT_AVAILABLE: "The selected model is not available. Pick another model in Settings.",
};

const MAX_EDGES = 500;
const MAX_FINDINGS = 30;
const MAX_SELECTION = 20;

/** The response crossed a trust boundary: every edit is validated again. */
function parseEdits(value: unknown): BlueprintEdit[] | null {
  if (!Array.isArray(value)) return null;
  const edits: BlueprintEdit[] = [];
  for (const item of value) {
    const parsed = blueprintEditSchema.safeParse(item);
    if (!parsed.success) return null;
    edits.push(parsed.data);
  }
  return edits;
}

function strings(value: unknown, limit: number): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit) : [];
}

export async function requestBlueprintEdit(input: BlueprintEditRequest, signal?: AbortSignal): Promise<BlueprintEditResult> {
  const context = input.context
    ? {
      ...(input.context.edges?.length ? { edges: input.context.edges.slice(0, MAX_EDGES).map((edge) => ({ from: edge.from, to: edge.to, status: edge.status })) } : {}),
      ...(input.context.findings?.length ? { findings: input.context.findings.slice(0, MAX_FINDINGS).map((finding) => ({ kind: finding.kind, title: finding.title.slice(0, 300) })) } : {}),
      ...(input.context.selection?.length ? { selection: input.context.selection.slice(0, MAX_SELECTION) } : {}),
    }
    : undefined;
  const { body, requestId } = await requestJson("/api/blueprint/edit", {
    method: "POST",
    body: {
      instruction: input.instruction,
      blueprint: input.blueprint,
      ...(context && Object.keys(context).length ? { context } : {}),
      ...(input.modelSettings ? { modelSettings: input.modelSettings } : {}),
    },
    signal,
    messages: FRIENDLY_MESSAGES,
    fallback: "The change request failed",
  });

  const source = body.source === "model" ? "model" : body.source === "parser" ? "parser" : null;
  if (!source) throw invalidResponse(requestId);

  if (isRecord(body.ambiguous)) {
    const rawOptions = Array.isArray(body.ambiguous.options) ? body.ambiguous.options : [];
    const options: Array<{ label: string; edits: BlueprintEdit[] }> = [];
    for (const option of rawOptions) {
      const edits = isRecord(option) ? parseEdits(option.edits) : null;
      if (!isRecord(option) || typeof option.label !== "string" || !edits) throw invalidResponse(requestId);
      options.push({ label: option.label, edits });
    }
    if (typeof body.ambiguous.message !== "string" || !options.length) throw invalidResponse(requestId);
    return { kind: "ambiguous", source: "parser", message: body.ambiguous.message, options };
  }
  if (isRecord(body.unknown)) {
    if (typeof body.unknown.message !== "string") throw invalidResponse(requestId);
    return {
      kind: "unknown",
      source: "parser",
      message: body.unknown.message,
      examples: strings(body.unknown.examples, 20),
      ...(typeof body.modelUnavailable === "string" ? { modelUnavailable: body.modelUnavailable } : {}),
    };
  }
  const edits = parseEdits(body.edits);
  if (!edits || typeof body.interpretation !== "string") throw invalidResponse(requestId);
  const questions = strings(body.questions, 5);
  return {
    kind: "edits",
    source,
    ...(source === "model" && typeof body.model === "string" ? { model: body.model } : {}),
    edits,
    interpretation: body.interpretation,
    ...(typeof body.explanation === "string" && body.explanation ? { explanation: body.explanation } : {}),
    ...(questions.length ? { questions } : {}),
  };
}
