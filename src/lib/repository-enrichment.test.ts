import { describe, expect, test, vi } from "vitest";

import { ApiError } from "./api-error";
import type { DeterministicAnalysis, DeterministicNode } from "./repository-analysis";
import {
  enrichDeterministicRepositoryGraph,
  MAX_ENRICHMENT_NODES,
} from "./repository-enrichment";

const NODE_A = "11111111-1111-4111-8111-111111111111";
const NODE_B = "22222222-2222-4222-8222-222222222222";
const EDGE = "33333333-3333-4333-8333-333333333333";

function node(id: string, path: string): DeterministicNode {
  return {
    id,
    type: "enhanced",
    position: { x: 0, y: 0 },
    data: {
      label: "Original",
      description: "Deterministic description",
      files: [path],
      category: "core",
      complexity: "low",
      dependencies: [],
      exports: [],
      evidence: [{
        path,
        blobSha: "a".repeat(40),
        startLine: 1,
        endLine: 1,
        kind: "file-membership",
        confidence: "high",
      }],
      analysisLevel: "semantic",
      confidence: "high",
    },
  };
}

function fixture(): DeterministicAnalysis {
  return {
    nodes: [node(NODE_A, "src/a.ts"), node(NODE_B, "src/b.ts")],
    edges: [{
      id: EDGE,
      source: NODE_A,
      target: NODE_B,
      label: "imports",
      type: "custom",
      animated: false,
      data: {
        label: "imports",
        type: "import",
        strength: "normal",
        direction: "one-way",
        evidence: [{
          path: "src/a.ts",
          blobSha: "a".repeat(40),
          startLine: 1,
          endLine: 1,
          kind: "import",
          confidence: "high",
        }],
        confidence: "high",
      },
      style: { strokeWidth: 2 },
      markerEnd: { type: "arrowclosed", color: "#64748b" },
    }],
    coverage: {
      treeComplete: true,
      discovered: 2,
      counts: { analyzed: 2, ignored: 0, unsupported: 0, oversized: 0, failed: 0, unclassified: 0 },
      analyzed: [], ignored: [], unsupported: [], oversized: [], failed: [], unclassified: [],
    },
    warnings: [],
    analyzer: { id: "rassam-deterministic", version: 1, semanticLanguages: ["javascript", "typescript"] },
  };
}

const request = {
  providerId: "openai",
  model: "approved-model",
  maxTokens: 8_192,
  temperature: 0.1,
};

const runtime = () => ({
  providerId: "openai" as const,
  model: "approved-model",
  maxTokens: 8_192,
  temperature: 0.1,
});

describe("deterministic graph enrichment", () => {
  test("applies only validated metadata and preserves membership, evidence, IDs, positions, and edges", async () => {
    const analysis = fixture();
    const chat = vi.fn(async (input: { message: string; maxTokens?: number }) => {
      expect(input.message).toContain(NODE_A);
      expect(input.message).toContain("src/a.ts");
      expect(input.message).toContain("a".repeat(40));
      expect(input.maxTokens).toBe(4_096);
      return JSON.stringify({
        refinements: [{ id: NODE_A, label: "Application API", description: "Public application boundary", category: "api" }],
      });
    });

    const result = await enrichDeterministicRepositoryGraph(
      analysis,
      request,
      new AbortController().signal,
      { resolveRuntime: runtime, getProvider: () => ({ chat }) },
    );

    expect(result.metadata).toMatchObject({ status: "completed", refinedNodeCount: 1, model: "approved-model" });
    expect(result.nodes[0].data).toMatchObject({ label: "Application API", category: "api" });
    expect(result.nodes[0].data.files).toEqual(analysis.nodes[0].data.files);
    expect(result.nodes[0].data.evidence).toEqual(analysis.nodes[0].data.evidence);
    expect(result.nodes[0].position).toEqual(analysis.nodes[0].position);
    expect(result.nodes[1]).toBe(analysis.nodes[1]);
    expect(result.edges).toBe(analysis.edges);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["unknown node", { refinements: [{ id: "99999999-9999-4999-8999-999999999999", label: "Wrong" }] }],
    ["duplicate node", { refinements: [{ id: NODE_A, label: "One" }, { id: NODE_A, label: "Two" }] }],
    ["forbidden files", { refinements: [{ id: NODE_A, label: "Changed", files: ["invented.ts"] }] }],
    ["forbidden edge", { refinements: [{ id: NODE_A, label: "Changed", edge: { source: NODE_A, target: NODE_B } }] }],
  ])("rejects %s output without changing the deterministic graph", async (_name, response) => {
    const analysis = fixture();
    const result = await enrichDeterministicRepositoryGraph(
      analysis,
      request,
      new AbortController().signal,
      {
        resolveRuntime: runtime,
        getProvider: () => ({ chat: async () => JSON.stringify(response) }),
      },
    );
    expect(result.metadata.status).toBe("failed");
    expect(result.nodes).toBe(analysis.nodes);
    expect(result.edges).toBe(analysis.edges);
  });

  test("retains the deterministic graph when provider resolution or the provider call fails", async () => {
    const analysis = fixture();
    const unavailable = await enrichDeterministicRepositoryGraph(
      analysis,
      request,
      new AbortController().signal,
      { resolveRuntime: () => { throw new ApiError("MODEL_NOT_AVAILABLE", 400, "missing"); } },
    );
    expect(unavailable.metadata.status).toBe("failed");
    expect(unavailable.warning).not.toContain("missing");

    const upstream = await enrichDeterministicRepositoryGraph(
      analysis,
      request,
      new AbortController().signal,
      {
        resolveRuntime: runtime,
        getProvider: () => ({ chat: async () => { throw new Error("provider credential detail"); } }),
      },
    );
    expect(upstream.metadata.status).toBe("failed");
    expect(upstream.warning).not.toContain("credential");
    expect(upstream.nodes).toBe(analysis.nodes);
  });

  test("accepts an honest no-op refinement without rebuilding the graph", async () => {
    const analysis = fixture();
    const result = await enrichDeterministicRepositoryGraph(
      analysis,
      request,
      new AbortController().signal,
      {
        resolveRuntime: runtime,
        getProvider: () => ({ chat: async () => JSON.stringify({ refinements: [] }) }),
      },
    );
    expect(result.metadata).toMatchObject({ status: "completed", refinedNodeCount: 0 });
    expect(result.nodes).toEqual(analysis.nodes);
    expect(result.edges).toBe(analysis.edges);
  });

  test("does not silently sample a graph beyond the enrichment boundary", async () => {
    const analysis = fixture();
    analysis.nodes = Array.from({ length: MAX_ENRICHMENT_NODES + 1 }, (_, index) => (
      node(`${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`, `src/${index}.ts`)
    ));
    const chat = vi.fn(async () => "{}");
    const result = await enrichDeterministicRepositoryGraph(
      analysis,
      request,
      new AbortController().signal,
      { resolveRuntime: runtime, getProvider: () => ({ chat }) },
    );
    expect(result.metadata.status).toBe("failed");
    expect(result.warning).toContain("safe limit");
    expect(chat).not.toHaveBeenCalled();
  });

  test("propagates caller cancellation and aborts the provider request", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const started = Promise.withResolvers<void>();
    const pending = enrichDeterministicRepositoryGraph(
      fixture(),
      request,
      controller.signal,
      {
        resolveRuntime: runtime,
        getProvider: () => ({
          chat: async (input) => {
            providerSignal = input.signal;
            started.resolve();
            return new Promise<string>((_resolve, reject) => {
              input.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
            });
          },
        }),
      },
    );
    await started.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    expect(providerSignal?.aborted).toBe(true);
  });
});
