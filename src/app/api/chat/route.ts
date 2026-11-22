import { NextRequest, NextResponse } from "next/server";

import { ApiError, createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { streamChatResponse } from "@/lib/chat-agent";
import type { FileResolutionStrategy } from "@/lib/chat-file-resolution";
import {
  normalizeRepoPath,
  resolveAvailableFilePath,
  sanitizeAvailableFiles,
} from "@/lib/chat-file-resolution";
import { resolveChatRuntime } from "@/lib/chat-runtime";
import { validateChatSource } from "@/lib/chat-source";
import { sequenceChatEvents } from "@/lib/chat-stream";
import { chatRequestSchema, MAX_CHAT_CACHED_FILE_BYTES, type ChatRequest, type SourceGrantPayload } from "@/lib/contracts";
import { getPinnedFile, normalizeRepositoryPath } from "@/lib/github";
import {
  emitOperationalEvent,
  normalizeTelemetryFinishReason,
  outcomeForErrorCode,
  telemetryDuration,
  telemetryNow,
  type TelemetryOutcome,
} from "@/lib/operational-telemetry";
import { configuredLimit, guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";
import { filterAiSourceContext, isSensitiveSourcePath } from "@/lib/source-policy";
import type { CanvasSyncSnapshot, NodeData, RepoDetails } from "@/types";
import type { LLMUsageMetadata } from "@/lib/llm/types";

interface FileReadResult {
  path: string;
  content: string | null;
  source: "cache" | "github" | "missing";
  resolvedPath?: string | null;
  resolutionStrategy?: FileResolutionStrategy;
  candidates?: string[];
}

function detectFileQueryIntent(message: string): { needsReadme: boolean; specificFile: string | null } {
  const lowerMessage = message.toLowerCase();
  const readmeKeywords = [
    "how to run", "how do i run", "how can i run", "how to install", "how do i install",
    "how to start", "how do i start", "how to setup", "how to set up", "setup instructions",
    "getting started", "quick start", "run locally", "run this project", "run the project",
    "install dependencies", "install the project", "what is this project", "what does this project",
    "project description", "project overview", "documentation", "readme", "instructions",
    "prerequisites", "requirements", "environment variables", "env vars", ".env", "contribute",
    "contributing", "license", "usage",
  ];
  const needsReadme = readmeKeywords.some((keyword) => lowerMessage.includes(keyword));
  const filePatterns = [
    /what(?:'s| is) (?:in|inside) (?:the )?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /what(?:'s| is) (?:on|at|in) line \d+(?:\s*(?:-|to|through)\s*\d+)? (?:in|of) [`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /show (?:me )?(?:the )?(?:content(?:s)? of )?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /show (?:me )?(?:line|lines) \d+(?:\s*(?:-|to|through)\s*\d+)? (?:in|of) [`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /read [`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /explain [`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /how .*?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?\s+works/i,
    /(?:line|lines)\s+\d+(?:\s*(?:-|to|through)\s*\d+)?\s+(?:in|of)\s+[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
    /[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]? (?:file )?content/i,
  ];
  for (const pattern of filePatterns) {
    const match = message.match(pattern);
    if (match?.[1]) return { needsReadme, specificFile: match[1] };
  }
  return { needsReadme, specificFile: null };
}

function selectedNodeContext(canvasContext: ChatRequest["canvasContext"]): NodeData | null {
  if (!canvasContext?.selectedNodeId) return null;
  const selected = canvasContext.nodes.find((node) => node.id === canvasContext.selectedNodeId);
  if (!selected) return null;
  return {
    label: selected.label,
    description: selected.description ?? "",
    files: selected.files ?? [],
    category: selected.category ?? "default",
    ...(selected.complexity ? { complexity: selected.complexity } : {}),
    ...(selected.dependencies ? { dependencies: selected.dependencies } : {}),
    ...(selected.exports ? { exports: selected.exports } : {}),
    ...(selected.evidence ? { evidence: selected.evidence } : {}),
    ...(selected.confidence ? { confidence: selected.confidence } : {}),
    ...(selected.analysisLevel ? { analysisLevel: selected.analysisLevel } : {}),
  };
}

function safeCachedFiles(body: ChatRequest, pinnedSource: SourceGrantPayload | null): Record<string, string> {
  // Legacy cached-file payloads have no commit/blob provenance. They remain
  // useful for blank/imported diagrams but are never trusted as repository
  // evidence. Pinned repository reads always go through GitHub at the grant SHA.
  return pinnedSource ? {} : (filterAiSourceContext(body.cachedFiles) ?? {});
}

function safeFileList(paths: string[] | undefined): string[] {
  const result: string[] = [];
  for (const path of sanitizeAvailableFiles(paths, 2_000)) {
    try {
      result.push(normalizeRepositoryPath(path));
    } catch {
      // Runtime validation normally rejects these; keep this boundary defensive.
    }
  }
  return result.filter((path) => !isSensitiveSourcePath(path));
}

function asCanvasSnapshot(value: ChatRequest["canvasContext"]): CanvasSyncSnapshot | null {
  return value as CanvasSyncSnapshot | null | undefined ?? null;
}

function asRepoDetails(value: ChatRequest["repoDetails"]): RepoDetails | null {
  return value as RepoDetails | null | undefined ?? null;
}

export async function POST(req: NextRequest) {
  const requestId = createRequestId(req.headers.get("x-request-id"));
  const requestStartedAt = telemetryNow();
  let guarded: GuardedRequest | undefined;
  let streamOwnsLease = false;
  try {
    guarded = await guardApiRequest(req, {
      scope: "chat",
      session: { limit: 30, windowSeconds: 60 * 60 },
      ip: { limit: 100, windowSeconds: 24 * 60 * 60 },
      global: {
        limit: configuredLimit("RASSAM_DAILY_CHAT_LIMIT", 5_000, 1_000_000),
        windowSeconds: 24 * 60 * 60,
      },
      concurrencyTtlSeconds: 45,
      globalConcurrency: {
        limit: configuredLimit("RASSAM_CHAT_CONCURRENCY", 20, 1_000),
        ttlSeconds: 45,
      },
      telemetry: { requestId, route: "/api/chat", scope: "chat" },
    });
    const body = await readJsonBody(req, chatRequestSchema);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(30_000)]);
    const pinnedSource = validateChatSource(body.repoDetails, body.canvasContext);
    const runtimeSettings = resolveChatRuntime(body.modelSettings);
    const canvasContext = asCanvasSnapshot(body.canvasContext);
    const repoDetails = asRepoDetails(body.repoDetails);
    const context = selectedNodeContext(body.canvasContext);
    const cached = safeCachedFiles(body, pinnedSource);
    const availableFileList = safeFileList(body.availableFiles);
    const knownFiles = sanitizeAvailableFiles(
      [...availableFileList, ...Object.keys(cached)],
      Math.max(availableFileList.length + Object.keys(cached).length, 2_000),
    );

    const getCachedContent = (path: string): { resolvedPath: string; content: string } | null => {
      const normalizedPath = normalizeRepoPath(path);
      if (!normalizedPath) return null;
      if (Object.prototype.hasOwnProperty.call(cached, normalizedPath)) {
        return { resolvedPath: normalizedPath, content: cached[normalizedPath] };
      }
      const hit = Object.entries(cached).find(([cachedPath]) => (
        normalizeRepoPath(cachedPath).toLowerCase() === normalizedPath.toLowerCase()
      ));
      return hit ? { resolvedPath: normalizeRepoPath(hit[0]), content: hit[1] } : null;
    };

    const resolveAndReadFile = async (requestedPath: string): Promise<FileReadResult> => {
      let normalizedRequestedPath: string;
      try {
        normalizedRequestedPath = normalizeRepositoryPath(normalizeRepoPath(requestedPath));
      } catch {
        return {
          path: requestedPath,
          content: null,
          source: "missing",
          resolvedPath: null,
          resolutionStrategy: "missing",
        };
      }

      const resolution = resolveAvailableFilePath(normalizedRequestedPath, knownFiles);
      if (resolution.status === "ambiguous") {
        return {
          path: normalizedRequestedPath,
          content: null,
          source: "missing",
          resolvedPath: null,
          resolutionStrategy: "ambiguous",
          candidates: resolution.candidates,
        };
      }

      const resolvedPath = resolution.status === "resolved"
        ? resolution.resolvedPath
        : normalizedRequestedPath;
      if (isSensitiveSourcePath(resolvedPath)) {
        return {
          path: normalizedRequestedPath,
          content: null,
          source: "missing",
          resolvedPath: null,
          resolutionStrategy: "missing",
        };
      }
      const cachedHit = getCachedContent(resolvedPath);
      if (cachedHit) {
        return {
          path: normalizedRequestedPath,
          content: cachedHit.content,
          source: "cache",
          resolvedPath: cachedHit.resolvedPath,
          resolutionStrategy: resolution.status === "resolved" ? resolution.resolutionStrategy : "exact",
        };
      }

      if (pinnedSource) {
        const upstreamStartedAt = telemetryNow();
        try {
          const file = await getPinnedFile(pinnedSource, resolvedPath, {
            maxBytes: MAX_CHAT_CACHED_FILE_BYTES,
            signal,
          });
          emitOperationalEvent({
            event: "upstream.completed",
            requestId,
            route: "/api/chat",
            upstream: "github",
            operation: "read-blob",
            outcome: "success",
            durationMs: telemetryDuration(upstreamStartedAt),
          });
          return {
            path: normalizedRequestedPath,
            content: file.content,
            source: file.content === null ? "missing" : "github",
            resolvedPath,
            resolutionStrategy: resolution.status === "resolved" ? resolution.resolutionStrategy : "exact",
          };
        } catch (error) {
          const safe = toSafeApiError(error, requestId);
          emitOperationalEvent({
            event: "upstream.completed",
            requestId,
            route: "/api/chat",
            upstream: "github",
            operation: "read-blob",
            outcome: signal.aborted ? (req.signal.aborted ? "cancelled" : "timeout") : outcomeForErrorCode(safe.body.code),
            durationMs: telemetryDuration(upstreamStartedAt),
            errorCode: safe.body.code,
          });
          if (error instanceof ApiError && ["FILE_NOT_FOUND", "FILE_TOO_LARGE", "FILE_BINARY"].includes(error.code)) {
            return {
              path: normalizedRequestedPath,
              content: null,
              source: "missing",
              resolvedPath: resolution.status === "resolved" ? resolvedPath : null,
              resolutionStrategy: resolution.resolutionStrategy,
            };
          }
          throw error;
        }
      }

      return {
        path: normalizedRequestedPath,
        content: null,
        source: "missing",
        resolvedPath: resolution.status === "resolved" ? resolvedPath : null,
        resolutionStrategy: resolution.resolutionStrategy,
      };
    };

    const { needsReadme, specificFile } = detectFileQueryIntent(body.message);
    let readmeContent: string | null = null;
    if (needsReadme) {
      for (const readmePath of ["README.md", "readme.md", "README.MD", "Readme.md", "README", "readme"]) {
        const result = await resolveAndReadFile(readmePath);
        if (result.content !== null) {
          readmeContent = result.content;
          break;
        }
      }
    }

    const specificFilePayload = specificFile ? await resolveAndReadFile(specificFile) : null;
    const supplementaryFiles: Record<string, string> = {};
    const excludedSpecificPath = specificFilePayload?.resolvedPath || specificFilePayload?.path || specificFile;
    for (const [path, content] of Object.entries(cached)) {
      if (excludedSpecificPath && normalizeRepoPath(path) === normalizeRepoPath(excludedSpecificPath)) continue;
      if (/readme/i.test(path) && readmeContent !== null) continue;
      supplementaryFiles[path] = content;
    }

    const usage: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      finishReason?: string;
    } = {};
    const collectUsage = (metadata: LLMUsageMetadata) => {
      if (metadata.inputTokens !== undefined) usage.inputTokens = (usage.inputTokens ?? 0) + metadata.inputTokens;
      if (metadata.outputTokens !== undefined) usage.outputTokens = (usage.outputTokens ?? 0) + metadata.outputTokens;
      if (metadata.totalTokens !== undefined) usage.totalTokens = (usage.totalTokens ?? 0) + metadata.totalTokens;
      if (metadata.finishReason) usage.finishReason = metadata.finishReason;
    };

    const eventStream = streamChatResponse({
      message: body.message,
      mode: body.chatMode,
      context,
      repoDetails,
      canvasContext,
      availableFiles: availableFileList,
      readmeContent,
      specificFile: specificFilePayload,
      runtimeSettings,
      history: body.history,
      cachedFiles: supplementaryFiles,
      readFile: resolveAndReadFile,
      signal,
      baseGraphRevision: body.baseGraphRevision ?? canvasContext?.graphRevision ?? 0,
      onUsage: collectUsage,
    });

    const encoder = new TextEncoder();
    const releaseLease = guarded.release;
    const readable = new ReadableStream({
      async start(controller) {
        const upstreamStartedAt = telemetryNow();
        let streamOutcome: TelemetryOutcome = "success";
        let finishReason: "stop" | "patch-proposed" | "cancelled" | "timeout" | "error" = "stop";
        let streamErrorCode: string | undefined;
        let eventCount = 0;
        let outputCharacters = 0;
        try {
          for await (const event of sequenceChatEvents(eventStream, requestId)) {
            if (signal.aborted) {
              streamOutcome = req.signal.aborted ? "cancelled" : "timeout";
              finishReason = req.signal.aborted ? "cancelled" : "timeout";
              streamErrorCode = req.signal.aborted ? "REQUEST_CANCELLED" : "REQUEST_TIMEOUT";
              controller.close();
              return;
            }
            eventCount += 1;
            if (event.type === "text") outputCharacters += event.text.length;
            if (event.type === "canvas_patch") finishReason = "patch-proposed";
            if (event.type === "error") {
              streamOutcome = "error";
              finishReason = "error";
              streamErrorCode = "PROVIDER_STREAM_ERROR";
            }
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
          controller.close();
        } catch {
          if (!signal.aborted) {
            streamOutcome = "error";
            finishReason = "error";
            streamErrorCode = "CHAT_STREAM_FAILED";
            controller.error(new Error("Chat stream failed"));
          } else {
            streamOutcome = req.signal.aborted ? "cancelled" : "timeout";
            finishReason = req.signal.aborted ? "cancelled" : "timeout";
            streamErrorCode = req.signal.aborted ? "REQUEST_CANCELLED" : "REQUEST_TIMEOUT";
            controller.close();
          }
        } finally {
          const reportedUsage = usage.inputTokens !== undefined
            || usage.outputTokens !== undefined
            || usage.totalTokens !== undefined;
          emitOperationalEvent({
            event: "upstream.completed",
            requestId,
            route: "/api/chat",
            upstream: runtimeSettings.providerId,
            operation: "chat",
            outcome: streamOutcome,
            durationMs: telemetryDuration(upstreamStartedAt),
            providerId: runtimeSettings.providerId,
            modelId: runtimeSettings.model,
            usageReported: reportedUsage,
            ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
            ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
            ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
            finishReason: finishReason === "stop" ? normalizeTelemetryFinishReason(usage.finishReason) : finishReason,
            eventCount,
            outputCharacters,
            ...(streamErrorCode ? { errorCode: streamErrorCode } : {}),
          });
          emitOperationalEvent({
            event: "request.completed",
            requestId,
            route: "/api/chat",
            method: "POST",
            status: 200,
            outcome: streamOutcome,
            durationMs: telemetryDuration(requestStartedAt),
            ...(streamErrorCode ? { errorCode: streamErrorCode } : {}),
            quotaLimit: guarded!.rateLimit.limit,
            quotaRemaining: guarded!.rateLimit.remaining,
            quotaResetAt: guarded!.rateLimit.resetAt,
          });
          await releaseLease().catch(() => undefined);
        }
      },
    });
    streamOwnsLease = true;

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
        ...rateLimitHeaders(guarded.rateLimit),
      },
    });
  } catch (error: unknown) {
    const safe = toSafeApiError(error, requestId);
    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/chat",
      method: "POST",
      status: safe.status,
      outcome: req.signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
      durationMs: telemetryDuration(requestStartedAt),
      errorCode: safe.body.code,
      retryable: safe.body.retryable,
      ...(guarded ? {
        quotaLimit: guarded.rateLimit.limit,
        quotaRemaining: guarded.rateLimit.remaining,
        quotaResetAt: guarded.rateLimit.resetAt,
      } : {}),
    });
    return NextResponse.json(
      { ...safe.body, reply: safe.body.message },
      {
        status: safe.status,
        headers: {
          "X-Request-Id": requestId,
          ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
        },
      },
    );
  } finally {
    if (!streamOwnsLease) await guarded?.release().catch(() => undefined);
  }
}
