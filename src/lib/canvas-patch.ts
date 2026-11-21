import { randomUUID } from "node:crypto";

import type { ChatCanvasWriteOperation, EdgeData, NodeCategory, SyncedCanvasEdge, SyncedCanvasNode } from "@/types";

import { ApiError } from "./api-error";
import {
  MAX_CANVAS_EDGES,
  MAX_CANVAS_NODES,
  MAX_CANVAS_PATCH_OPERATIONS,
  canvasPatchSchema,
  type CanvasPatchContract,
} from "./contracts";
import {
  VALID_EDGE_DIRECTIONS,
  VALID_EDGE_STRENGTHS,
  VALID_EDGE_TYPES,
  VALID_NODE_CATEGORIES,
  buildDefaultNodePosition,
  type WorkingCanvasState,
} from "./chat-canvas";

export type CanvasPatch = CanvasPatchContract;

export interface CanvasPatchResult {
  patch: CanvasPatch;
  resultingState: WorkingCanvasState;
}

export interface CanvasPatchOptions {
  allowedFiles?: Iterable<string>;
  summary?: string;
}

function invalid(message: string): never {
  throw new ApiError("CANVAS_PATCH_INVALID", 422, message);
}

function ambiguous(message: string): never {
  throw new ApiError("CANVAS_PATCH_AMBIGUOUS", 409, message);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cloneState(state: WorkingCanvasState): WorkingCanvasState {
  return {
    ...state,
    project: { ...state.project },
    nodes: state.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      files: node.files ? [...node.files] : undefined,
      dependencies: node.dependencies ? [...node.dependencies] : undefined,
      exports: node.exports ? [...node.exports] : undefined,
    })),
    edges: state.edges.map((edge) => ({ ...edge })),
  };
}

function finitePosition(value: unknown, fallback?: { x: number; y: number }): { x: number; y: number } {
  if (value === undefined && fallback) return { ...fallback };
  const candidate = record(value);
  if (!candidate || typeof candidate.x !== "number" || typeof candidate.y !== "number"
    || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
    invalid("Node position must contain finite x and y coordinates.");
  }
  return { x: candidate.x as number, y: candidate.y as number };
}

function boundedText(value: unknown, field: string, maximum: number, options: { required?: boolean } = {}): string | undefined {
  if (value === undefined && !options.required) return undefined;
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const normalized = (value as string).trim();
  if (options.required && !normalized) invalid(`${field} is required.`);
  if (normalized.length > maximum) invalid(`${field} exceeds ${maximum} characters.`);
  return normalized;
}

function stringList(value: unknown, field: string, maximumItems: number, maximumLength: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximumItems) invalid(`${field} must contain at most ${maximumItems} strings.`);
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > maximumLength) invalid(`${field} contains an invalid value.`);
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

function nodeCategory(value: unknown, fallback?: NodeCategory): NodeCategory | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !VALID_NODE_CATEGORIES.includes(value as NodeCategory)) {
    invalid("Node category is invalid.");
  }
  return value as NodeCategory;
}

function edgeType(value: unknown, fallback?: EdgeData["type"]): EdgeData["type"] {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !VALID_EDGE_TYPES.includes(value as NonNullable<EdgeData["type"]>)) {
    invalid("Edge type is invalid.");
  }
  return value as EdgeData["type"];
}

function existingEdgeType(value: unknown): EdgeData["type"] {
  return typeof value === "string" && VALID_EDGE_TYPES.includes(value as NonNullable<EdgeData["type"]>)
    ? value as EdgeData["type"]
    : "dependency";
}

function edgeStrength(value: unknown, fallback?: EdgeData["strength"]): EdgeData["strength"] {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !VALID_EDGE_STRENGTHS.includes(value as NonNullable<EdgeData["strength"]>)) {
    invalid("Edge strength is invalid.");
  }
  return value as EdgeData["strength"];
}

function edgeDirection(value: unknown, fallback?: EdgeData["direction"]): EdgeData["direction"] {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !VALID_EDGE_DIRECTIONS.includes(value as NonNullable<EdgeData["direction"]>)) {
    invalid("Edge direction is invalid.");
  }
  return value as EdgeData["direction"];
}

function exactNodeByReference(
  state: WorkingCanvasState,
  target: Record<string, unknown> | null,
  temporaryIds: Map<string, string>,
): SyncedCanvasNode {
  if (!target) invalid("A node target is required.");
  const rawId = typeof target.id === "string" ? target.id.trim() : "";
  if (rawId) {
    const id = temporaryIds.get(rawId) || rawId;
    const match = state.nodes.find((node) => node.id === id);
    if (!match) invalid(`Node ID ${rawId} does not exist.`);
    return match;
  }

  const label = typeof target.label === "string" ? target.label.trim().toLowerCase() : "";
  if (!label) invalid("A node target must use an exact ID or label.");
  const matches = state.nodes.filter((node) => node.label.trim().toLowerCase() === label);
  if (matches.length > 1) ambiguous(`Node label "${target.label}" is ambiguous; use an exact node ID.`);
  if (matches.length === 0) invalid(`Node label "${target.label}" does not exist.`);
  return matches[0];
}

function exactEdgeByReference(state: WorkingCanvasState, target: Record<string, unknown> | null): SyncedCanvasEdge {
  if (!target) invalid("An edge target is required.");
  const id = typeof target.id === "string" ? target.id.trim() : "";
  if (id) {
    const match = state.edges.find((edge) => edge.id === id);
    if (!match) invalid(`Edge ID ${id} does not exist.`);
    return match;
  }

  const label = typeof target.label === "string" ? target.label.trim().toLowerCase() : "";
  if (!label) invalid("An edge target must use an exact ID or label.");
  const matches = state.edges.filter((edge) => (edge.label || "").trim().toLowerCase() === label);
  if (matches.length > 1) ambiguous(`Edge label "${target.label}" is ambiguous; use an exact edge ID.`);
  if (matches.length === 0) invalid(`Edge label "${target.label}" does not exist.`);
  return matches[0];
}

function nodeReferenceFromEndpoint(
  state: WorkingCanvasState,
  input: Record<string, unknown>,
  prefix: "source" | "target",
  temporaryIds: Map<string, string>,
): SyncedCanvasNode {
  return exactNodeByReference(state, {
    id: input[`${prefix}Id`],
    label: input[`${prefix}Label`],
  }, temporaryIds);
}

function ensureAllowedFiles(files: string[] | undefined, allowedFiles: Set<string> | null): void {
  if (!files || !allowedFiles) return;
  const unknown = files.filter((file) => !allowedFiles.has(file));
  if (unknown.length > 0) invalid(`Canvas patch references files outside the repository snapshot: ${unknown.slice(0, 3).join(", ")}.`);
}

function normalizeNodeChanges(
  raw: Record<string, unknown>,
  current: SyncedCanvasNode,
  allowedFiles: Set<string> | null,
): { node: SyncedCanvasNode; changes: Extract<ChatCanvasWriteOperation, { action: "edit_node" }>["changes"] } {
  const label = boundedText(raw.label, "Node label", 120) ?? current.label;
  const description = boundedText(raw.description, "Node description", 4_000) ?? current.description;
  const files = stringList(raw.files, "Node files", 1_000, 4_096) ?? current.files;
  ensureAllowedFiles(files, allowedFiles);
  const complexity = raw.complexity === undefined
    ? current.complexity
    : raw.complexity === "low" || raw.complexity === "medium" || raw.complexity === "high"
      ? raw.complexity
      : invalid("Node complexity is invalid.");
  const dependencies = stringList(raw.dependencies, "Node dependencies", 500, 500) ?? current.dependencies;
  const exports = stringList(raw.exports, "Node exports", 500, 500) ?? current.exports;
  const position = raw.position === undefined ? current.position : finitePosition(raw.position);
  const category = nodeCategory(raw.category, current.category);
  const node: SyncedCanvasNode = {
    ...current,
    label,
    description,
    files,
    complexity,
    dependencies,
    exports,
    category,
    position,
  };
  return {
    node,
    changes: { label, description, files, complexity, dependencies, exports, category, position },
  };
}

function validateFinalState(state: WorkingCanvasState): void {
  if (state.nodes.length > MAX_CANVAS_NODES || state.edges.length > MAX_CANVAS_EDGES) {
    invalid(`Canvas exceeds ${MAX_CANVAS_NODES} nodes or ${MAX_CANVAS_EDGES} edges.`);
  }
  const nodeIds = new Set<string>();
  for (const node of state.nodes) {
    if (!node.id || nodeIds.has(node.id)) invalid("Canvas contains duplicate or empty node IDs.");
    nodeIds.add(node.id);
    boundedText(node.label, "Node label", 120, { required: true });
    boundedText(node.description, "Node description", 4_000);
    finitePosition(node.position);
    nodeCategory(node.category, "default");
  }
  const edgeIds = new Set<string>();
  for (const edge of state.edges) {
    if (!edge.id || edgeIds.has(edge.id)) invalid("Canvas contains duplicate or empty edge IDs.");
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) invalid(`Edge ${edge.id} has a missing endpoint.`);
    boundedText(edge.label, "Edge label", 240);
    if (edge.type !== "custom") edgeType(edge.type, "dependency");
    edgeStrength(edge.strength, "normal");
    edgeDirection(edge.direction, "one-way");
  }
}

function summarizePatch(operations: ChatCanvasWriteOperation[]): string {
  const counts = new Map<string, number>();
  operations.forEach((operation) => counts.set(operation.action, (counts.get(operation.action) || 0) + 1));
  return [...counts.entries()].map(([action, count]) => `${count} ${action.replace(/_/g, " ")}`).join(", ");
}

export function createCanvasPatch(
  sourceState: WorkingCanvasState,
  rawOperations: unknown[],
  baseGraphRevision: number,
  options: CanvasPatchOptions = {},
): CanvasPatchResult {
  if (!Number.isInteger(baseGraphRevision) || baseGraphRevision < 0) invalid("Base graph revision must be a non-negative integer.");
  if (rawOperations.length === 0) invalid("Canvas patch must contain at least one operation.");
  if (rawOperations.length > MAX_CANVAS_PATCH_OPERATIONS) {
    invalid(`Canvas patch exceeds ${MAX_CANVAS_PATCH_OPERATIONS} operations.`);
  }

  const state = cloneState(sourceState);
  validateFinalState(state);
  const temporaryIds = new Map<string, string>();
  const allowedFiles = options.allowedFiles ? new Set(options.allowedFiles) : null;
  const operations: ChatCanvasWriteOperation[] = [];
  const affectedNodeIds = new Set<string>();
  const affectedEdgeIds = new Set<string>();

  for (const rawOperation of rawOperations) {
    const input = record(rawOperation);
    if (!input || typeof input.action !== "string") invalid("Every canvas operation requires an action.");
    const action = input.action;

    if (action === "add_node") {
      const nodeInput = record(input.node) || input;
      const label = boundedText(nodeInput.label, "Node label", 120, { required: true })!;
      const description = boundedText(nodeInput.description, "Node description", 4_000) || "";
      const files = stringList(nodeInput.files, "Node files", 1_000, 4_096) || [];
      ensureAllowedFiles(files, allowedFiles);
      const category = nodeCategory(nodeInput.category, "default")!;
      const complexity = nodeInput.complexity === undefined
        ? "low"
        : nodeInput.complexity === "low" || nodeInput.complexity === "medium" || nodeInput.complexity === "high"
          ? nodeInput.complexity
          : invalid("Node complexity is invalid.");
      const dependencies = stringList(nodeInput.dependencies, "Node dependencies", 500, 500);
      const exports = stringList(nodeInput.exports, "Node exports", 500, 500);
      const id = randomUUID();
      const temporaryId = [nodeInput.tempId, nodeInput.id, input.tempId]
        .find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
      if (temporaryId) {
        if (temporaryIds.has(temporaryId) || state.nodes.some((node) => node.id === temporaryId)) {
          invalid(`Temporary node ID ${temporaryId} is duplicated.`);
        }
        temporaryIds.set(temporaryId, id);
      }
      const position = nodeInput.position === undefined ? buildDefaultNodePosition(state) : finitePosition(nodeInput.position);
      const node: SyncedCanvasNode = { id, label, description, files, category, complexity, dependencies, exports, position };
      state.nodes.push(node);
      operations.push({
        action: "add_node",
        node: { id, type: "enhanced", position, data: { label, description, files, category, complexity, dependencies, exports } },
        summary: `Add node ${label}`,
      });
      affectedNodeIds.add(id);
      continue;
    }

    if (action === "edit_node") {
      const target = exactNodeByReference(state, record(input.target) || input, temporaryIds);
      const changesInput = record(input.changes) || input;
      const normalized = normalizeNodeChanges(changesInput, target, allowedFiles);
      state.nodes = state.nodes.map((node) => node.id === target.id ? normalized.node : node);
      operations.push({ action: "edit_node", nodeId: target.id, changes: normalized.changes, summary: `Update node ${normalized.node.label}` });
      affectedNodeIds.add(target.id);
      continue;
    }

    if (action === "delete_node") {
      const target = exactNodeByReference(state, record(input.target) || input, temporaryIds);
      state.nodes = state.nodes.filter((node) => node.id !== target.id);
      const removedEdges = state.edges.filter((edge) => edge.source === target.id || edge.target === target.id);
      removedEdges.forEach((edge) => affectedEdgeIds.add(edge.id));
      state.edges = state.edges.filter((edge) => edge.source !== target.id && edge.target !== target.id);
      operations.push({ action: "delete_node", nodeId: target.id, summary: `Delete node ${target.label}` });
      affectedNodeIds.add(target.id);
      continue;
    }

    if (action === "add_edge") {
      const edgeInput = record(input.edge) || input;
      const source = nodeReferenceFromEndpoint(state, edgeInput, "source", temporaryIds);
      const target = nodeReferenceFromEndpoint(state, edgeInput, "target", temporaryIds);
      const id = randomUUID();
      const label = boundedText(edgeInput.label, "Edge label", 240);
      const type = edgeType(edgeInput.type, "dependency");
      const strength = edgeStrength(edgeInput.strength, "normal");
      const direction = edgeDirection(edgeInput.direction, "one-way");
      state.edges.push({ id, source: source.id, target: target.id, label, type, strength, direction });
      operations.push({
        action: "add_edge",
        edge: { id, source: source.id, target: target.id, type: "custom", data: { label, type, strength, direction } },
        summary: `Add edge ${source.label} to ${target.label}`,
      });
      affectedNodeIds.add(source.id);
      affectedNodeIds.add(target.id);
      affectedEdgeIds.add(id);
      continue;
    }

    if (action === "edit_edge") {
      const targetEdge = exactEdgeByReference(state, record(input.target) || input);
      const changes = record(input.changes) || input;
      const source = changes.sourceId !== undefined || changes.sourceLabel !== undefined
        ? nodeReferenceFromEndpoint(state, changes, "source", temporaryIds)
        : exactNodeByReference(state, { id: targetEdge.source }, temporaryIds);
      const target = changes.targetId !== undefined || changes.targetLabel !== undefined
        ? nodeReferenceFromEndpoint(state, changes, "target", temporaryIds)
        : exactNodeByReference(state, { id: targetEdge.target }, temporaryIds);
      const next: SyncedCanvasEdge = {
        ...targetEdge,
        source: source.id,
        target: target.id,
        label: boundedText(changes.label, "Edge label", 240) ?? targetEdge.label,
        type: edgeType(changes.type, existingEdgeType(targetEdge.type)),
        strength: edgeStrength(changes.strength, targetEdge.strength),
        direction: edgeDirection(changes.direction, targetEdge.direction),
      };
      state.edges = state.edges.map((edge) => edge.id === targetEdge.id ? next : edge);
      operations.push({
        action: "edit_edge",
        edgeId: targetEdge.id,
        changes: { source: next.source, target: next.target, data: { label: next.label, type: next.type as EdgeData["type"], strength: next.strength, direction: next.direction } },
        summary: `Update edge ${targetEdge.id}`,
      });
      affectedNodeIds.add(source.id);
      affectedNodeIds.add(target.id);
      affectedEdgeIds.add(targetEdge.id);
      continue;
    }

    if (action === "delete_edge") {
      const target = exactEdgeByReference(state, record(input.target) || input);
      state.edges = state.edges.filter((edge) => edge.id !== target.id);
      operations.push({ action: "delete_edge", edgeId: target.id, summary: `Delete edge ${target.id}` });
      affectedEdgeIds.add(target.id);
      continue;
    }

    invalid(`Unsupported canvas action ${action}.`);
  }

  validateFinalState(state);
  const summary = boundedText(options.summary, "Patch summary", 1_000) || summarizePatch(operations);
  const patch = canvasPatchSchema.parse({
    patchId: randomUUID(),
    baseGraphRevision,
    resultingRevision: baseGraphRevision + 1,
    operations,
    affectedNodeIds: [...affectedNodeIds],
    affectedEdgeIds: [...affectedEdgeIds],
    summary,
  });
  return {
    patch,
    resultingState: state,
  };
}
