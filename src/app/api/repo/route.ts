import dagre from "dagre";
import { NextRequest, NextResponse } from "next/server";

import { ApiError, createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import {
  MAX_ANALYSIS_FILES,
  MAX_ANALYSIS_FILE_BYTES,
  MAX_ANALYSIS_SOURCE_BYTES,
  repositoryAnalysisRequestSchema,
} from "@/lib/contracts";
import {
  fetchCompleteTree,
  getBlobText,
  parseGitHubRepositoryUrl,
  resolvePublicRepositoryRevision,
  type RepoNode,
} from "@/lib/github";
import {
  analyzeRepositoryDeterministically,
  selectSemanticSourceCandidates,
  type AnalysisSource,
  type DeterministicEdge,
  type DeterministicNode,
} from "@/lib/repository-analysis";
import { enrichDeterministicRepositoryGraph } from "@/lib/repository-enrichment";
import {
  emitOperationalEvent,
  normalizeTelemetryFinishReason,
  outcomeForErrorCode,
  telemetryDuration,
  telemetryNow,
  type TelemetryOutcome,
} from "@/lib/operational-telemetry";
import { issueSourceGrant } from "@/lib/source-grant";
import { configuredLimit, guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";
import type { LLMUsageMetadata } from "@/lib/llm/types";
import { normalizeProviderId } from "@/lib/llm/registry";

interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  data?: { files?: unknown[] };
}

interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

type AnalysisStage = "validate" | "resolve-revision" | "fetch-tree" | "determine-scope" | "analyze" | "enrich" | "layout" | "save";

function nodeDimensions(node: LayoutNode): { width: number; height: number } {
  const filesCount = Array.isArray(node.data?.files) ? node.data.files.length : 0;
  return { width: 280, height: 100 + (filesCount > 5 ? 30 : 0) };
}

function getLayoutedElements<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  direction: "TB" | "LR",
): { nodes: N[]; edges: E[] } {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length || edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
    throw new ApiError("INVALID_REQUEST", 400, "Graph contains duplicate nodes or dangling edges");
  }

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100, edgesep: 30, marginx: 50, marginy: 50 });
  nodes.forEach((node) => graph.setNode(node.id, nodeDimensions(node)));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  return {
    nodes: nodes.map((node) => {
      const laidOut = graph.node(node.id) as { x?: number; y?: number } | undefined;
      if (!laidOut || !Number.isFinite(laidOut.x) || !Number.isFinite(laidOut.y)) {
        throw new ApiError("ANALYSIS_FAILED", 500, "Graph layout did not produce valid positions");
      }
      const dimensions = nodeDimensions(node);
      return {
        ...node,
        position: {
          x: laidOut.x! - dimensions.width / 2,
          y: laidOut.y! - dimensions.height / 2,
        },
      };
    }),
    edges,
  };
}

async function fetchAnalysisSources(
  owner: string,
  repo: string,
  candidates: RepoNode[],
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<AnalysisSource[]> {
  if (candidates.length > MAX_ANALYSIS_FILES) {
    throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository exceeds the automatic analysis file limit", false, {
      eligibleFiles: candidates.length,
      maximumFiles: MAX_ANALYSIS_FILES,
    });
  }

  const estimatedBytes = candidates.reduce((sum, file) => sum + (file.size ?? 0), 0);
  if (estimatedBytes > MAX_ANALYSIS_SOURCE_BYTES) {
    throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository exceeds the automatic analysis source budget", false, {
      estimatedBytes,
      maximumBytes: MAX_ANALYSIS_SOURCE_BYTES,
    });
  }

  const records: AnalysisSource[] = [];
  let fetchedBytes = 0;
  const concurrency = 8;
  for (let start = 0; start < candidates.length; start += concurrency) {
    if (signal.aborted) throw new ApiError("REQUEST_CANCELLED", 499, "Repository analysis was cancelled");
    const batch = candidates.slice(start, start + concurrency);
    const batchRecords = await Promise.all(batch.map(async (file): Promise<AnalysisSource> => {
      try {
        const content = await getBlobText(owner, repo, file.sha, MAX_ANALYSIS_FILE_BYTES, signal);
        return {
          path: file.path,
          blobSha: file.sha,
          content,
          ...(content === null ? { error: "file is not valid UTF-8 text" } : {}),
        };
      } catch (error) {
        return {
          path: file.path,
          blobSha: file.sha,
          content: null,
          error: error instanceof ApiError ? error.message : "source content could not be read",
        };
      }
    }));
    fetchedBytes += batchRecords.reduce((sum, record) => sum + Buffer.byteLength(record.content || "", "utf8"), 0);
    if (fetchedBytes > MAX_ANALYSIS_SOURCE_BYTES) {
      throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository exceeds the automatic analysis source budget", false, {
        fetchedBytes,
        maximumBytes: MAX_ANALYSIS_SOURCE_BYTES,
      });
    }
    records.push(...batchRecords);
    onProgress?.(Math.min(candidates.length, start + batch.length), candidates.length);
  }
  return records;
}

function jsonWithRequestId(
  body: unknown,
  status: number,
  requestId: string,
  guarded?: GuardedRequest,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const requestStartedAt = telemetryNow();
  let guarded: GuardedRequest | undefined;
  try {
    guarded = await guardApiRequest(request, {
      scope: "analysis",
      session: { limit: 5, windowSeconds: 60 * 60 },
      ip: { limit: 20, windowSeconds: 24 * 60 * 60 },
      global: {
        limit: configuredLimit("RASSAM_DAILY_ANALYSIS_LIMIT", 1_000, 100_000),
        windowSeconds: 24 * 60 * 60,
      },
      concurrencyTtlSeconds: 5 * 60,
      globalConcurrency: {
        limit: configuredLimit("RASSAM_ANALYSIS_CONCURRENCY", 4, 100),
        ttlSeconds: 5 * 60,
      },
      telemetry: { requestId, route: "/api/repo", scope: "analysis" },
    });
    const input = await readJsonBody(request, repositoryAnalysisRequestSchema);
    const jobController = new AbortController();
    const signal = AbortSignal.any([request.signal, jobController.signal]);
    const encoder = new TextEncoder();
    let sequence = 0;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: Record<string, unknown>) => {
          sequence += 1;
          controller.enqueue(encoder.encode(`${JSON.stringify({
            protocolVersion: 2,
            requestId,
            sequence,
            timestamp: new Date().toISOString(),
            ...event,
          })}\n`));
        };
        const progress = (
          stage: string,
          message: string,
          value: number,
          counts?: { completed: number; total: number },
        ) => emit({ type: "progress", payload: { stage, message, progress: value, ...counts } });
        let currentStage: AnalysisStage | undefined;
        let currentStageStartedAt = telemetryNow();
        let streamOutcome: TelemetryOutcome = "success";
        let streamErrorCode: string | undefined;
        const beginStage = (stage: AnalysisStage) => {
          currentStage = stage;
          currentStageStartedAt = telemetryNow();
        };
        const finishStage = (
          outcome: TelemetryOutcome = "success",
          counts: {
            discoveredCount?: number;
            analyzedCount?: number;
            excludedCount?: number;
            failedCount?: number;
          } = {},
          errorCode?: string,
        ) => {
          if (!currentStage) return;
          emitOperationalEvent({
            event: "analysis.stage",
            requestId,
            route: "/api/repo",
            stage: currentStage,
            outcome,
            durationMs: telemetryDuration(currentStageStartedAt),
            ...counts,
            ...(errorCode ? { errorCode } : {}),
          });
          currentStage = undefined;
        };

        void (async () => {
          try {
            beginStage("validate");
            progress("validate", "Repository request validated", 0.04);
            const { owner, repo } = parseGitHubRepositoryUrl(input.url);
            finishStage();

            beginStage("resolve-revision");
            progress("resolve-revision", "Resolving the requested revision", 0.1);
            const revisionStartedAt = telemetryNow();
            let resolved: Awaited<ReturnType<typeof resolvePublicRepositoryRevision>>;
            try {
              resolved = await resolvePublicRepositoryRevision(owner, repo, input.ref, signal);
              emitOperationalEvent({
                event: "upstream.completed",
                requestId,
                route: "/api/repo",
                upstream: "github",
                operation: "resolve-revision",
                outcome: "success",
                durationMs: telemetryDuration(revisionStartedAt),
              });
            } catch (error) {
              const safe = toSafeApiError(error, requestId);
              emitOperationalEvent({
                event: "upstream.completed",
                requestId,
                route: "/api/repo",
                upstream: "github",
                operation: "resolve-revision",
                outcome: signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
                durationMs: telemetryDuration(revisionStartedAt),
                errorCode: safe.body.code,
              });
              throw error;
            }
            progress("resolve-revision", `Pinned commit ${resolved.snapshot.commitSha.slice(0, 7)}`, 0.18);
            finishStage();

            beginStage("fetch-tree");
            progress("fetch-tree", "Retrieving the complete repository tree", 0.22);
            const treeStartedAt = telemetryNow();
            let repositoryNodes: Awaited<ReturnType<typeof fetchCompleteTree>>;
            try {
              repositoryNodes = await fetchCompleteTree(
                owner,
                repo,
                resolved.snapshot.treeSha,
                signal,
              );
              emitOperationalEvent({
                event: "upstream.completed",
                requestId,
                route: "/api/repo",
                upstream: "github",
                operation: "fetch-tree",
                outcome: "success",
                durationMs: telemetryDuration(treeStartedAt),
              });
            } catch (error) {
              const safe = toSafeApiError(error, requestId);
              emitOperationalEvent({
                event: "upstream.completed",
                requestId,
                route: "/api/repo",
                upstream: "github",
                operation: "fetch-tree",
                outcome: signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
                durationMs: telemetryDuration(treeStartedAt),
                errorCode: safe.body.code,
              });
              throw error;
            }
            progress("fetch-tree", `Accounted for ${repositoryNodes.length.toLocaleString()} tree entries`, 0.34, {
              completed: repositoryNodes.length,
              total: repositoryNodes.length,
            });
            finishStage("success", { discoveredCount: repositoryNodes.length });

            beginStage("determine-scope");
            progress("determine-scope", "Applying the visible source policy", 0.38);
            const candidates = selectSemanticSourceCandidates(repositoryNodes);
            const discoveredBlobs = repositoryNodes.filter((node) => node.type === "blob").length;
            finishStage("success", {
              discoveredCount: discoveredBlobs,
              analyzedCount: candidates.length,
              excludedCount: Math.max(0, discoveredBlobs - candidates.length),
            });

            beginStage("analyze");
            progress("analyze", `Reading ${candidates.length.toLocaleString()} eligible source files`, 0.42, {
              completed: 0,
              total: candidates.length,
            });
            const sourceReadStartedAt = telemetryNow();
            let sources: AnalysisSource[];
            try {
              sources = await fetchAnalysisSources(owner, repo, candidates, signal, (completed, total) => {
                const value = total === 0 ? 0.68 : 0.42 + (completed / total) * 0.26;
                progress("analyze", `Read ${completed.toLocaleString()} of ${total.toLocaleString()} source files`, value, {
                  completed,
                  total,
                });
              });
              emitOperationalEvent({
                event: "upstream.completed",
                requestId,
                route: "/api/repo",
                upstream: "github",
                operation: "read-analysis-source",
                outcome: "success",
                durationMs: telemetryDuration(sourceReadStartedAt),
              });
            } catch (error) {
              const safe = toSafeApiError(error, requestId);
              emitOperationalEvent({
                event: "upstream.completed",
                requestId,
                route: "/api/repo",
                upstream: "github",
                operation: "read-analysis-source",
                outcome: signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
                durationMs: telemetryDuration(sourceReadStartedAt),
                errorCode: safe.body.code,
              });
              throw error;
            }
            if (signal.aborted) throw new ApiError("REQUEST_CANCELLED", 499, "Repository analysis was cancelled");
            const analysis = analyzeRepositoryDeterministically(repositoryNodes, sources);
            if (analysis.nodes.length === 0) {
              throw new ApiError("ANALYSIS_FAILED", 422, "Repository contains no analyzable source files");
            }
            const coverageCounts = analysis.coverage.counts;
            const excludedCount = coverageCounts.ignored
              + coverageCounts.unsupported
              + coverageCounts.oversized
              + coverageCounts.unclassified;
            finishStage("success", {
              discoveredCount: analysis.coverage.discovered,
              analyzedCount: coverageCounts.analyzed,
              excludedCount,
              failedCount: coverageCounts.failed,
            });
            emitOperationalEvent({
              event: "analysis.coverage",
              requestId,
              route: "/api/repo",
              treeComplete: analysis.coverage.treeComplete,
              discoveredCount: analysis.coverage.discovered,
              analyzedCount: coverageCounts.analyzed,
              ignoredCount: coverageCounts.ignored,
              unsupportedCount: coverageCounts.unsupported,
              oversizedCount: coverageCounts.oversized,
              failedCount: coverageCounts.failed,
              unclassifiedCount: coverageCounts.unclassified,
            });

            const warnings = [...analysis.warnings];
            let graphNodes = analysis.nodes;
            let graphEdges = analysis.edges;
            let enrichment: {
              requested: boolean;
              status: "not-requested" | "completed" | "failed";
              providerId?: string;
              model?: string;
              maxTokens?: number;
              temperature?: number;
              refinedNodeCount?: number;
              reason?: string;
            } = { requested: false, status: "not-requested" };

            beginStage("enrich");
            if (input.enrichWithAi) {
              const telemetryProviderId = normalizeProviderId(input.modelSettings!.providerId);
              progress(
                "enrich",
                `Enriching verified groups with ${input.modelSettings!.providerId}/${input.modelSettings!.model}`,
                0.72,
              );
              const enrichmentStartedAt = telemetryNow();
              const usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; finishReason?: string } = {};
              const collectUsage = (metadata: LLMUsageMetadata) => {
                if (metadata.inputTokens !== undefined) usage.inputTokens = metadata.inputTokens;
                if (metadata.outputTokens !== undefined) usage.outputTokens = metadata.outputTokens;
                if (metadata.totalTokens !== undefined) usage.totalTokens = metadata.totalTokens;
                if (metadata.finishReason) usage.finishReason = metadata.finishReason;
              };
              let enriched: Awaited<ReturnType<typeof enrichDeterministicRepositoryGraph>>;
              try {
                enriched = await enrichDeterministicRepositoryGraph(
                  analysis,
                  input.modelSettings!,
                  signal,
                  { onUsage: collectUsage },
                );
              } catch (error) {
                const safe = toSafeApiError(error, requestId);
                if (telemetryProviderId) emitOperationalEvent({
                  event: "upstream.completed",
                  requestId,
                  route: "/api/repo",
                  upstream: telemetryProviderId,
                  operation: "enrichment",
                  outcome: signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
                  durationMs: telemetryDuration(enrichmentStartedAt),
                  providerId: telemetryProviderId,
                  modelId: input.modelSettings!.model,
                  errorCode: safe.body.code,
                  usageReported: usage.inputTokens !== undefined
                    || usage.outputTokens !== undefined
                    || usage.totalTokens !== undefined,
                  ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
                  ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
                  ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
                  finishReason: signal.aborted ? "cancelled" : "error",
                });
                throw error;
              }
              graphNodes = enriched.nodes;
              graphEdges = enriched.edges;
              enrichment = enriched.metadata;
              if (enriched.warning) warnings.push(enriched.warning);
              const enrichmentSucceeded = enriched.metadata.status === "completed";
              if (telemetryProviderId) emitOperationalEvent({
                event: "upstream.completed",
                requestId,
                route: "/api/repo",
                upstream: telemetryProviderId,
                operation: "enrichment",
                outcome: enrichmentSucceeded ? "success" : "unavailable",
                durationMs: telemetryDuration(enrichmentStartedAt),
                providerId: telemetryProviderId,
                modelId: input.modelSettings!.model,
                usageReported: usage.inputTokens !== undefined
                  || usage.outputTokens !== undefined
                  || usage.totalTokens !== undefined,
                ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
                ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
                ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
                finishReason: enrichmentSucceeded ? normalizeTelemetryFinishReason(usage.finishReason) : "error",
                ...(!enrichmentSucceeded ? { errorCode: "AI_ENRICHMENT_FAILED" } : {}),
              });
              finishStage(
                enrichmentSucceeded ? "success" : "unavailable",
                { analyzedCount: enriched.metadata.refinedNodeCount ?? 0 },
                enrichmentSucceeded ? undefined : "AI_ENRICHMENT_FAILED",
              );
              progress(
                "enrich",
                enriched.metadata.status === "completed"
                  ? `AI refined ${enriched.metadata.refinedNodeCount?.toLocaleString() ?? "0"} verified groups`
                  : "AI enrichment failed; retaining the complete deterministic map",
                0.76,
              );
            } else {
              progress("enrich", "Using deterministic analysis without AI", 0.76);
              finishStage();
            }

            beginStage("layout");
            progress("layout", "Laying out the evidence-linked graph", 0.82);
            const layouted = getLayoutedElements<DeterministicNode, DeterministicEdge>(
              graphNodes,
              graphEdges,
              input.layout,
            );
            finishStage("success", {
              analyzedCount: layouted.nodes.length,
            });
            const sourceGrant = issueSourceGrant(resolved.snapshot);

            beginStage("save");
            progress("save", "Preparing the local project transaction", 0.95);
            finishStage();

            emit({
              type: "result",
              terminal: true,
              payload: {
                protocolVersion: 2,
                requestId,
                nodes: layouted.nodes,
                edges: layouted.edges,
                repoDetails: {
                  owner: resolved.details.owner,
                  repo: resolved.details.repo,
                  defaultBranch: resolved.details.defaultBranch,
                  ...(resolved.details.description ? { description: resolved.details.description } : {}),
                  ...(resolved.details.language ? { language: resolved.details.language } : {}),
                  stars: resolved.details.stars,
                  fileCount: repositoryNodes.filter((node) => node.type === "blob").length,
                  commitSha: resolved.snapshot.commitSha,
                  requestedRef: resolved.snapshot.requestedRef,
                  treeSha: resolved.snapshot.treeSha,
                  sourceGrant,
                },
                fileTree: repositoryNodes
                  .filter((node) => node.type === "blob" || node.type === "tree")
                  .map((node) => ({
                    path: node.path,
                    type: node.type,
                    sha: node.sha,
                    size: node.size,
                    mode: node.mode,
                    commitSha: resolved.snapshot.commitSha,
                  })),
                snapshot: resolved.snapshot,
                sourceGrant,
                coverage: analysis.coverage,
                warnings,
                analyzer: {
                  ...analysis.analyzer,
                  enrichmentContractVersion: 1,
                },
                enrichment,
              },
            });
            streamOutcome = "success";
          } catch (error) {
            const safe = toSafeApiError(error, requestId);
            streamOutcome = signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code);
            streamErrorCode = signal.aborted ? "REQUEST_CANCELLED" : safe.body.code;
            finishStage(streamOutcome, {}, streamErrorCode);
            if (!signal.aborted || !request.signal.aborted) {
              emit({ type: "error", terminal: true, payload: safe.body });
            }
          } finally {
            emitOperationalEvent({
              event: "request.completed",
              requestId,
              route: "/api/repo",
              method: "POST",
              status: 200,
              outcome: streamOutcome,
              durationMs: telemetryDuration(requestStartedAt),
              ...(streamErrorCode ? { errorCode: streamErrorCode } : {}),
              quotaLimit: guarded!.rateLimit.limit,
              quotaRemaining: guarded!.rateLimit.remaining,
              quotaResetAt: guarded!.rateLimit.resetAt,
            });
            await guarded?.release().catch(() => undefined);
            try { controller.close(); } catch { /* Client disconnected. */ }
          }
        })();
      },
      cancel() {
        jobController.abort();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "x-request-id": requestId,
        ...rateLimitHeaders(guarded.rateLimit),
      },
    });
  } catch (error) {
    const safe = toSafeApiError(error, requestId);
    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/repo",
      method: "POST",
      status: safe.status,
      outcome: request.signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
      durationMs: telemetryDuration(requestStartedAt),
      errorCode: safe.body.code,
      retryable: safe.body.retryable,
      ...(guarded ? {
        quotaLimit: guarded.rateLimit.limit,
        quotaRemaining: guarded.rateLimit.remaining,
        quotaResetAt: guarded.rateLimit.resetAt,
      } : {}),
    });
    await guarded?.release().catch(() => undefined);
    return jsonWithRequestId(safe.body, safe.status, requestId, guarded);
  }
}
