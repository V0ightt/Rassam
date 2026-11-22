import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { BlueprintEdit } from "@/blueprint/edits";
import { parseIntent } from "@/blueprint/intent";
import { parseBlueprint, type Blueprint, type Provenance } from "@/blueprint/schema";
import { ApiError, createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { interpretModelOutput } from "@/lib/blueprint-intent/parse";
import { buildEditSystemPrompt, buildEditUserMessage, buildRepairMessage, type EditPromptContext } from "@/lib/blueprint-intent/prompt";
import { resolveChatRuntime, type ResolvedChatRuntime } from "@/lib/chat-runtime";
import { getProvider } from "@/lib/llm/registry";
import type { LLMProvider } from "@/lib/llm/types";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";

// "Tell Rassam what to change": the deterministic parser answers first and
// for free; a model is asked only when the parser does not understand and the
// client selected a configured model. Either way the answer is a list of typed
// edits the client previews before anything changes.

/** Output cap for one model answer; edits are small JSON. */
const MAX_EDIT_OUTPUT_TOKENS = 3_000;

const idText = z.string().trim().min(1).max(120);

const editRequestSchema = z
  .object({
    instruction: z.string().trim().min(1).max(4_000),
    blueprint: z.unknown(),
    context: z
      .object({
        edges: z.array(z.object({ from: idText, to: idText, status: z.string().trim().min(1).max(20) }).strict()).max(500).optional(),
        findings: z.array(z.object({ kind: z.string().trim().min(1).max(80), title: z.string().max(300) }).strict()).max(30).optional(),
        selection: z.array(idText).max(20).optional(),
      })
      .strict()
      .optional(),
    modelSettings: z
      .object({
        providerId: z.string().trim().min(1).max(50),
        model: z.string().trim().min(1).max(200),
        maxTokens: z.number().int().min(64).max(8_192).optional(),
        temperature: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function cancelled(): ApiError {
  return new ApiError("REQUEST_CANCELLED", 499, "Blueprint edit request was cancelled");
}

function supportsStructuredOutput(provider: LLMProvider): boolean {
  return provider.id === "openai" || provider.id === "deepseek";
}

async function askModel(
  provider: LLMProvider,
  runtime: ResolvedChatRuntime,
  system: string,
  message: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    return await provider.chat({
      system,
      message,
      // Edits are a translation task, not a creative one.
      temperature: Math.min(runtime.temperature ?? 0.1, 0.2),
      maxTokens: Math.min(runtime.maxTokens ?? 2_000, MAX_EDIT_OUTPUT_TOKENS),
      model: runtime.model,
      structuredOutput: supportsStructuredOutput(provider) ? { type: "json_object" } : undefined,
      signal,
    });
  } catch {
    if (signal.aborted) throw cancelled();
    // Provider errors can echo request details; never forward their text.
    throw new ApiError("ANALYSIS_FAILED", 502, "The selected model did not answer. Try again, or rephrase using one of the examples.", true);
  }
}

interface ModelAnswer {
  edits: BlueprintEdit[];
  interpretation: string;
  explanation: string;
  questions: string[];
}

async function proposeWithModel(
  runtime: ResolvedChatRuntime,
  instruction: string,
  blueprint: Blueprint,
  context: EditPromptContext,
  signal: AbortSignal,
): Promise<ModelAnswer> {
  const provider = getProvider(runtime.providerId);
  const provenance: Provenance = { source: "agent", by: `${runtime.providerId}/${runtime.model}` };
  const system = buildEditSystemPrompt();

  const first = await askModel(provider, runtime, system, buildEditUserMessage(instruction, blueprint, context), signal);
  let outcome = interpretModelOutput(first, blueprint, provenance);
  if (!outcome.ok) {
    if (signal.aborted) throw cancelled();
    const second = await askModel(provider, runtime, system, buildRepairMessage(instruction, blueprint, context, first, outcome.problem), signal);
    outcome = interpretModelOutput(second, blueprint, provenance);
  }
  if (!outcome.ok) {
    throw new ApiError(
      "CANVAS_PATCH_INVALID",
      422,
      `The model could not produce a valid blueprint change (${outcome.problem}) Nothing was changed. Try rephrasing, or use a direct command such as "forbid ui from importing db".`,
      true,
    );
  }
  return {
    edits: outcome.edits,
    // What the edits do, in Rassam's own words: the model's prose is not trusted to describe them.
    interpretation: outcome.applied.map((edit) => edit.summary).join(" ") || outcome.explanation || "No changes proposed.",
    explanation: outcome.explanation,
    questions: outcome.questions,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  let guarded: GuardedRequest | undefined;
  try {
    // `RequestQuota.scope` is an open string (only the optional telemetry scope
    // is a closed enum, and it is not used here), so this route gets its own
    // bucket instead of spending the chat quota.
    guarded = await guardApiRequest(request, {
      scope: "blueprint-edit",
      session: { limit: 60, windowSeconds: 60 * 60 },
      ip: { limit: 300, windowSeconds: 24 * 60 * 60 },
      concurrencyTtlSeconds: 90,
    });
    const input = await readJsonBody(request, editRequestSchema);
    const parsedBlueprint = parseBlueprint(input.blueprint);
    if (!parsedBlueprint.ok) {
      throw new ApiError("INVALID_REQUEST", 400, "The blueprint in the request is not valid", false, {
        issues: parsedBlueprint.issues.slice(0, 10),
      });
    }
    const blueprint = parsedBlueprint.blueprint;
    const headers = { "x-request-id": requestId, "Cache-Control": "no-store", ...rateLimitHeaders(guarded.rateLimit) };

    const parsed = parseIntent(input.instruction, blueprint);
    if (parsed.status === "ok") {
      return NextResponse.json({ requestId, source: "parser", edits: parsed.edits, interpretation: parsed.interpretation }, { status: 200, headers });
    }
    if (parsed.status === "ambiguous") {
      return NextResponse.json({ requestId, source: "parser", ambiguous: { message: parsed.message, options: parsed.options } }, { status: 200, headers });
    }

    let runtime: ResolvedChatRuntime | null = null;
    let modelUnavailable: string | undefined;
    if (input.modelSettings) {
      try {
        runtime = resolveChatRuntime(input.modelSettings);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        modelUnavailable = error.message;
      }
    }
    if (!runtime) {
      return NextResponse.json({
        requestId,
        source: "parser",
        unknown: { message: parsed.message, examples: parsed.examples },
        ...(modelUnavailable ? { modelUnavailable } : {}),
      }, { status: 200, headers });
    }

    const answer = await proposeWithModel(runtime, input.instruction, blueprint, input.context ?? {}, request.signal);
    return NextResponse.json({
      requestId,
      source: "model",
      model: `${runtime.providerId}/${runtime.model}`,
      edits: answer.edits,
      interpretation: answer.interpretation,
      ...(answer.explanation ? { explanation: answer.explanation } : {}),
      ...(answer.questions.length ? { questions: answer.questions } : {}),
    }, { status: 200, headers });
  } catch (error) {
    const safe = toSafeApiError(request.signal.aborted && !(error instanceof ApiError) ? cancelled() : error, requestId);
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: {
        "x-request-id": requestId,
        "Cache-Control": "no-store",
        ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
      },
    });
  } finally {
    await guarded?.release().catch(() => undefined);
  }
}
