import { z } from "zod";

export const MAX_API_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_REPOSITORY_TREE_ENTRIES = 100_000;
export const MAX_ANALYSIS_FILES = 10_000;
export const MAX_ANALYSIS_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_ANALYSIS_FILE_BYTES = 256 * 1024;
export const MAX_VIEWER_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CHAT_MESSAGE_CHARS = 8_000;
export const MAX_CHAT_HISTORY_MESSAGES = 20;
export const MAX_CHAT_HISTORY_CHARS = 100_000;
export const MAX_CHAT_CACHED_FILES = 15;
export const MAX_CHAT_CACHED_FILE_BYTES = 256 * 1024;
export const MAX_CHAT_CACHED_TOTAL_BYTES = 1024 * 1024;
export const MAX_CANVAS_NODES = 2_000;
export const MAX_CANVAS_EDGES = 5_000;
export const MAX_CANVAS_PATCH_OPERATIONS = 100;

export const edgeTypeSchema = z.enum([
  "dependency", "import", "calls", "extends", "implements", "sends", "receives", "reads", "writes",
]);

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const repositoryPathStringSchema = z.string().min(1).max(4_096).refine((value) => {
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  return value.split("/").every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}, "Invalid repository path");

const githubOwnerSchema = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/, "Invalid GitHub owner");

const githubRepositorySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, "Invalid GitHub repository")
  .refine((value) => value !== "." && value !== "..", "Invalid GitHub repository");

export const githubCoordinatesSchema = z.object({
  owner: githubOwnerSchema,
  repo: githubRepositorySchema,
});

export const analysisModelSettingsSchema = z.object({
  providerId: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(200),
  maxTokens: z.number().int().min(64).max(8_192),
  temperature: z.number().min(0).max(1),
}).strict();

export const repositoryAnalysisRequestSchema = z
  .object({
    url: z.string().min(1).max(2_048),
    ref: z.string().trim().min(1).max(255).optional(),
    layout: z.enum(["TB", "LR"]).default("TB"),
    enrichWithAi: z.boolean().default(false),
    modelSettings: analysisModelSettingsSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.enrichWithAi && !request.modelSettings) {
      context.addIssue({
        code: "custom",
        path: ["modelSettings"],
        message: "AI enrichment requires an exact provider and model selection",
      });
    }
    if (!request.enrichWithAi && request.modelSettings) {
      context.addIssue({
        code: "custom",
        path: ["modelSettings"],
        message: "Model settings are accepted only when AI enrichment is requested",
      });
    }
  });

export const sourceGrantPayloadSchema = z.object({
  version: z.literal(1),
  owner: githubOwnerSchema,
  repo: githubRepositorySchema,
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i, "Invalid commit SHA"),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/i, "Invalid tree SHA"),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export const repositorySnapshotSchema = z.object({
  host: z.literal("github.com"),
  owner: githubOwnerSchema,
  repo: githubRepositorySchema,
  requestedRef: z.string().min(1).max(255),
  defaultBranch: z.string().min(1).max(255),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/i),
  visibility: z.literal("public"),
  retrievedAt: z.string().datetime(),
});

export const pinnedFileRequestSchema = z
  .object({
    sourceGrant: z.string().min(32).max(4_096),
    path: z.string().min(1).max(4_096),
    blobSha: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
    maxBytes: z.number().int().positive().max(MAX_VIEWER_FILE_BYTES).optional(),
  })
  .strict();

export const sourceGrantRefreshRequestSchema = z
  .object({
    url: z.string().min(1).max(2_048),
    ref: z.string().trim().min(1).max(255).optional(),
    expectedCommitSha: z.string().regex(/^[a-f0-9]{40}$/i, "Invalid commit SHA"),
  })
  .strict();

export const evidenceRefSchema = z.object({
  path: repositoryPathStringSchema,
  blobSha: z.string().regex(/^[a-f0-9]{40}$/i),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  kind: z.enum(["file-membership", "import", "route", "manifest", "structural"]),
  confidence: z.enum(["low", "medium", "high"]),
}).strict().superRefine((evidence, context) => {
  if (evidence.endLine !== undefined && evidence.startLine === undefined) {
    context.addIssue({ code: "custom", path: ["endLine"], message: "An evidence range requires a start line" });
  }
  if (
    evidence.startLine !== undefined
    && evidence.endLine !== undefined
    && evidence.endLine < evidence.startLine
  ) {
    context.addIssue({ code: "custom", path: ["endLine"], message: "Evidence range ends before it starts" });
  }
});

export const nodeCategorySchema = z.enum([
  "api", "component", "config", "database", "auth", "utility", "test", "style",
  "asset", "documentation", "core", "service", "hook", "context", "middleware",
  "model", "route", "cache", "queue", "load-balancer", "gateway", "storage", "cdn",
  "proxy", "firewall", "external-api", "message-broker", "container", "serverless",
  "client", "default",
]);

const graphPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const graphNodeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(80).optional(),
  position: graphPositionSchema,
  data: z.object({
    label: z.string().min(1).max(120),
    description: z.string().max(4_000),
    files: z.array(z.string().min(1).max(4_096)).max(10_000),
    category: nodeCategorySchema,
    complexity: z.enum(["low", "medium", "high"]).optional(),
    evidence: z.array(evidenceRefSchema).max(10_000).optional(),
    analysisLevel: z.enum(["semantic", "structural", "manifest"]).optional(),
    confidence: z.enum(["low", "medium", "high"]).optional(),
  }).passthrough(),
}).passthrough();

export const graphEdgeSchema = z.object({
  id: z.string().uuid(),
  source: z.string().uuid(),
  target: z.string().uuid(),
  type: z.string().min(1).max(80).optional(),
  data: z.object({
    label: z.string().max(240).optional(),
    type: z.enum(["dependency", "import", "calls", "extends", "implements", "sends", "receives", "reads", "writes"]).optional(),
    strength: z.enum(["weak", "normal", "strong"]).optional(),
    direction: z.enum(["one-way", "two-way"]).optional(),
    evidence: z.array(evidenceRefSchema).max(10_000).optional(),
    confidence: z.enum(["low", "medium", "high"]).optional(),
  }).passthrough().optional(),
}).passthrough();

const coverageFileSchema = z.object({
  path: z.string().min(1).max(4_096),
  reason: z.string().min(1).max(1_000),
  analysisLevel: z.enum(["semantic", "structural", "manifest"]).optional(),
});

export const analysisCoverageSchema = z.object({
  treeComplete: z.literal(true),
  discovered: z.number().int().nonnegative().max(MAX_REPOSITORY_TREE_ENTRIES),
  counts: z.object({
    analyzed: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
    unsupported: z.number().int().nonnegative(),
    oversized: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    unclassified: z.number().int().nonnegative(),
  }),
  analyzed: z.array(coverageFileSchema),
  ignored: z.array(coverageFileSchema),
  unsupported: z.array(coverageFileSchema),
  oversized: z.array(coverageFileSchema),
  failed: z.array(coverageFileSchema),
  unclassified: z.array(coverageFileSchema),
});

export const repositoryAnalysisResultSchema = z.object({
  protocolVersion: z.literal(2),
  requestId: z.string().min(8).max(128),
  nodes: z.array(graphNodeSchema).min(1).max(2_000),
  edges: z.array(graphEdgeSchema).max(5_000),
  repoDetails: z.object({
    owner: githubOwnerSchema,
    repo: githubRepositorySchema,
    defaultBranch: z.string().min(1).max(255),
    requestedRef: z.string().min(1).max(255),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
    treeSha: z.string().regex(/^[a-f0-9]{40}$/i),
    sourceGrant: z.string().min(32).max(4_096),
    description: z.string().optional(),
    stars: z.number().int().nonnegative().optional(),
    language: z.string().optional(),
    fileCount: z.number().int().nonnegative(),
  }),
  fileTree: z.array(z.object({
    path: z.string().min(1).max(4_096),
    type: z.enum(["blob", "tree"]),
    sha: z.string().regex(/^[a-f0-9]{40}$/i),
    size: z.number().int().nonnegative().optional(),
    mode: z.string().optional(),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
  })).max(MAX_REPOSITORY_TREE_ENTRIES),
  snapshot: repositorySnapshotSchema,
  sourceGrant: z.string().min(32).max(4_096),
  coverage: analysisCoverageSchema,
  warnings: z.array(z.string().max(2_000)).max(1_000),
  analyzer: z.record(z.string(), z.unknown()),
  enrichment: z.object({
    requested: z.boolean(),
    status: z.enum(["not-requested", "not-enabled", "completed", "failed"]),
    providerId: z.string().min(1).max(50).optional(),
    model: z.string().min(1).max(200).optional(),
    maxTokens: z.number().int().min(64).max(4_096).optional(),
    temperature: z.number().min(0).max(1).optional(),
    refinedNodeCount: z.number().int().nonnegative().optional(),
    reason: z.string().min(1).max(500).optional(),
  }).strict(),
}).superRefine((value, context) => {
  if (value.enrichment.requested && (!value.enrichment.providerId || !value.enrichment.model)) {
    context.addIssue({
      code: "custom",
      path: ["enrichment"],
      message: "Requested enrichment must identify the exact provider and model",
    });
  }
  if (!value.enrichment.requested && value.enrichment.status !== "not-requested") {
    context.addIssue({
      code: "custom",
      path: ["enrichment", "status"],
      message: "Unrequested enrichment must use not-requested status",
    });
  }
  if (
    !value.enrichment.requested
    && (
      value.enrichment.providerId !== undefined
      || value.enrichment.model !== undefined
      || value.enrichment.maxTokens !== undefined
      || value.enrichment.temperature !== undefined
      || value.enrichment.refinedNodeCount !== undefined
      || value.enrichment.reason !== undefined
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["enrichment"],
      message: "Unrequested enrichment cannot contain model or outcome metadata",
    });
  }
  if (value.enrichment.requested && value.enrichment.status === "not-requested") {
    context.addIssue({
      code: "custom",
      path: ["enrichment", "status"],
      message: "Requested enrichment must report a completed or failed outcome",
    });
  }
  if (
    value.enrichment.status === "completed"
    && (
      value.enrichment.refinedNodeCount === undefined
      || value.enrichment.maxTokens === undefined
      || value.enrichment.temperature === undefined
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["enrichment"],
      message: "Completed enrichment must report its effective settings and refined node count",
    });
  }
  if (
    (value.enrichment.status === "failed" || value.enrichment.status === "not-enabled")
    && !value.enrichment.reason
  ) {
    context.addIssue({
      code: "custom",
      path: ["enrichment", "reason"],
      message: "Unsuccessful enrichment must report a safe reason",
    });
  }
  const nodeIds = new Set(value.nodes.map((node) => node.id));
  if (nodeIds.size !== value.nodes.length) {
    context.addIssue({ code: "custom", message: "Graph contains duplicate node IDs", path: ["nodes"] });
  }
  const edgeIds = new Set<string>();
  for (let index = 0; index < value.edges.length; index += 1) {
    const edge = value.edges[index];
    if (edgeIds.has(edge.id)) {
      context.addIssue({ code: "custom", message: "Graph contains duplicate edge IDs", path: ["edges", index, "id"] });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      context.addIssue({ code: "custom", message: "Graph contains a dangling edge", path: ["edges", index] });
    }
  }
});

export const analysisStageSchema = z.enum([
  "validate",
  "resolve-revision",
  "fetch-tree",
  "determine-scope",
  "analyze",
  "enrich",
  "layout",
  "save",
]);

export const analysisStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    protocolVersion: z.literal(2),
    requestId: z.string().min(8).max(128),
    sequence: z.number().int().positive(),
    type: z.literal("progress"),
    payload: z.object({
      stage: analysisStageSchema,
      message: z.string().min(1).max(240),
      progress: z.number().min(0).max(1),
      completed: z.number().int().nonnegative().optional(),
      total: z.number().int().nonnegative().optional(),
    }),
    timestamp: z.string().datetime(),
  }),
  z.object({
    protocolVersion: z.literal(2),
    requestId: z.string().min(8).max(128),
    sequence: z.number().int().positive(),
    type: z.literal("result"),
    payload: z.record(z.string(), z.unknown()),
    timestamp: z.string().datetime(),
    terminal: z.literal(true),
  }),
  z.object({
    protocolVersion: z.literal(2),
    requestId: z.string().min(8).max(128),
    sequence: z.number().int().positive(),
    type: z.literal("error"),
    payload: z.record(z.string(), z.unknown()),
    timestamp: z.string().datetime(),
    terminal: z.literal(true),
  }),
]);

const chatCanvasNodeSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  description: z.string().max(4_000).optional(),
  category: nodeCategorySchema.optional(),
  files: z.array(repositoryPathStringSchema).max(1_000).optional(),
  complexity: z.enum(["low", "medium", "high"]).optional(),
  dependencies: z.array(z.string().max(500)).max(500).optional(),
  exports: z.array(z.string().max(500)).max(500).optional(),
  evidence: z.array(evidenceRefSchema).max(10_000).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  analysisLevel: z.enum(["semantic", "structural", "manifest"]).optional(),
  position: positionSchema,
}).strict();

const chatCanvasEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(200),
  target: z.string().min(1).max(200),
  label: z.string().max(240).optional(),
  type: z.string().max(100).optional(),
  strength: z.enum(["weak", "normal", "strong"]).optional(),
  direction: z.enum(["one-way", "two-way"]).optional(),
  evidence: z.array(evidenceRefSchema).max(10_000).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
}).strict();

const patchNodeDataSchema = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(4_000),
  files: z.array(z.string().min(1).max(4_096)).max(1_000),
  category: nodeCategorySchema,
  complexity: z.enum(["low", "medium", "high"]).optional(),
  dependencies: z.array(z.string().max(500)).max(500).optional(),
  exports: z.array(z.string().max(500)).max(500).optional(),
}).strict();

const patchEdgeDataSchema = z.object({
  label: z.string().max(240).optional(),
  type: z.enum(["dependency", "import", "calls", "extends", "implements", "sends", "receives", "reads", "writes"]).optional(),
  strength: z.enum(["weak", "normal", "strong"]).optional(),
  direction: z.enum(["one-way", "two-way"]).optional(),
  labelOffset: positionSchema.optional(),
}).strict();

export const canvasWriteOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_node"),
    node: z.object({
      id: z.string().uuid(),
      type: z.string().max(80).optional(),
      position: positionSchema,
      data: patchNodeDataSchema,
    }).strict(),
    summary: z.string().max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("edit_node"),
    nodeId: z.string().min(1).max(200),
    changes: patchNodeDataSchema.partial().extend({ position: positionSchema.optional() }).strict(),
    summary: z.string().max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("delete_node"),
    nodeId: z.string().min(1).max(200),
    summary: z.string().max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("add_edge"),
    edge: z.object({
      id: z.string().uuid(),
      source: z.string().min(1).max(200),
      target: z.string().min(1).max(200),
      type: z.string().max(80).optional(),
      data: patchEdgeDataSchema.optional(),
    }).strict(),
    summary: z.string().max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("edit_edge"),
    edgeId: z.string().min(1).max(200),
    changes: z.object({
      source: z.string().min(1).max(200).optional(),
      target: z.string().min(1).max(200).optional(),
      type: z.string().max(80).optional(),
      data: patchEdgeDataSchema.optional(),
    }).strict(),
    summary: z.string().max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("delete_edge"),
    edgeId: z.string().min(1).max(200),
    summary: z.string().max(1_000).optional(),
  }).strict(),
]);

export const canvasPatchSchema = z.object({
  patchId: z.string().uuid(),
  baseGraphRevision: z.number().int().nonnegative(),
  resultingRevision: z.number().int().positive(),
  operations: z.array(canvasWriteOperationSchema).min(1).max(MAX_CANVAS_PATCH_OPERATIONS),
  affectedNodeIds: z.array(z.string().min(1).max(200)).max(MAX_CANVAS_NODES),
  affectedEdgeIds: z.array(z.string().min(1).max(200)).max(MAX_CANVAS_EDGES),
  summary: z.string().min(1).max(1_000),
}).strict().superRefine((patch, context) => {
  if (patch.resultingRevision !== patch.baseGraphRevision + 1) {
    context.addIssue({ code: "custom", path: ["resultingRevision"], message: "Patch revision is invalid" });
  }
  if (new Set(patch.affectedNodeIds).size !== patch.affectedNodeIds.length) {
    context.addIssue({ code: "custom", path: ["affectedNodeIds"], message: "Affected node IDs must be unique" });
  }
  if (new Set(patch.affectedEdgeIds).size !== patch.affectedEdgeIds.length) {
    context.addIssue({ code: "custom", path: ["affectedEdgeIds"], message: "Affected edge IDs must be unique" });
  }
});

const streamMetadataSchema = z.object({
  protocolVersion: z.literal(2),
  requestId: z.string().min(8).max(128),
  sequence: z.number().int().positive(),
  timestamp: z.string().datetime(),
  terminal: z.boolean(),
});

export const chatStreamEventV2Schema = z.discriminatedUnion("type", [
  streamMetadataSchema.extend({ type: z.literal("status"), text: z.string().max(20_000) }).strict(),
  streamMetadataSchema.extend({ type: z.literal("text"), text: z.string().max(100_000) }).strict(),
  streamMetadataSchema.extend({ type: z.literal("error"), text: z.string().max(20_000) }).strict(),
  streamMetadataSchema.extend({ type: z.literal("canvas_patch"), patch: canvasPatchSchema, text: z.string().max(20_000).optional() }).strict(),
  streamMetadataSchema.extend({ type: z.literal("done") }).strict(),
]).superRefine((event, context) => {
  if (event.terminal !== (event.type === "done")) {
    context.addIssue({
      code: "custom",
      path: ["terminal"],
      message: "Only the done event may be terminal",
    });
  }
});

export const chatCanvasContextSchema = z.object({
  syncedAt: z.string().max(100),
  graphRevision: z.number().int().nonnegative().optional(),
  project: z.object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(300),
    source: z.enum(["github", "empty", "imported"]),
    repo: z.string().max(300).optional(),
  }).strict(),
  layoutDirection: z.enum(["TB", "LR"]),
  selectedNodeId: z.string().max(200).nullable().optional(),
  selectedNodeLabel: z.string().max(120).nullable().optional(),
  nodes: z.array(chatCanvasNodeSchema).max(MAX_CANVAS_NODES),
  edges: z.array(chatCanvasEdgeSchema).max(MAX_CANVAS_EDGES),
}).strict().superRefine((canvas, context) => {
  const ids = new Set<string>();
  canvas.nodes.forEach((node, index) => {
    if (ids.has(node.id)) context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "Duplicate node ID" });
    ids.add(node.id);
  });
  const edgeIds = new Set<string>();
  canvas.edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id)) context.addIssue({ code: "custom", path: ["edges", index, "id"], message: "Duplicate edge ID" });
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      context.addIssue({ code: "custom", path: ["edges", index], message: "Edge endpoint does not exist" });
    }
  });
});

const chatRepoDetailsSchema = z.object({
  owner: githubOwnerSchema,
  repo: githubRepositorySchema,
  defaultBranch: z.string().max(255).optional(),
  requestedRef: z.string().max(255).optional(),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  sourceGrant: z.string().min(32).max(4_096).optional(),
  description: z.string().max(2_000).nullable().optional(),
  stars: z.number().int().nonnegative().optional(),
  language: z.string().max(100).nullable().optional(),
  fileCount: z.number().int().nonnegative().optional(),
}).strict();

const chatHistorySchema = z.array(z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_CHAT_HISTORY_CHARS),
}).strict()).max(MAX_CHAT_HISTORY_MESSAGES).superRefine((messages, context) => {
  const total = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (total > MAX_CHAT_HISTORY_CHARS) {
    context.addIssue({ code: "custom", message: "Chat history exceeds 100,000 characters" });
  }
});

const cachedFilesSchema = z.record(
  repositoryPathStringSchema,
  z.string().max(MAX_CHAT_CACHED_FILE_BYTES),
).superRefine((files, context) => {
  const entries = Object.entries(files);
  if (entries.length > MAX_CHAT_CACHED_FILES) {
    context.addIssue({ code: "custom", message: "Too many cached files" });
  }
  entries.forEach(([path, content]) => {
    if (Buffer.byteLength(content, "utf8") > MAX_CHAT_CACHED_FILE_BYTES) {
      context.addIssue({ code: "custom", path: [path], message: "Cached file exceeds 256 KiB" });
    }
  });
  const totalBytes = entries.reduce((sum, [, content]) => sum + Buffer.byteLength(content, "utf8"), 0);
  if (totalBytes > MAX_CHAT_CACHED_TOTAL_BYTES) {
    context.addIssue({ code: "custom", message: "Cached file context exceeds 1 MiB" });
  }
});

export const chatRequestSchema = z.object({
  protocolVersion: z.literal(2).optional(),
  message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  chatMode: z.enum(["ask", "agent"]).default("ask"),
  baseGraphRevision: z.number().int().nonnegative().optional(),
  repoDetails: chatRepoDetailsSchema.nullable().optional(),
  canvasContext: chatCanvasContextSchema.nullable().optional(),
  modelSettings: z.object({
    providerId: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
    maxTokens: z.number().int().min(64).max(8_192).optional(),
    temperature: z.number().min(0).max(1).optional(),
  }).strict(),
  history: chatHistorySchema.optional(),
  cachedFiles: cachedFilesSchema.optional(),
  availableFiles: z.array(repositoryPathStringSchema).max(2_000).optional(),
}).strict().superRefine((request, context) => {
  if (request.repoDetails && (!request.repoDetails.sourceGrant || !request.repoDetails.commitSha)) {
    context.addIssue({
      code: "custom",
      path: ["repoDetails"],
      message: "Pinned repository chat requires a source grant and commit SHA",
    });
  }
  if (request.canvasContext?.project.source === "github" && !request.repoDetails) {
    context.addIssue({
      code: "custom",
      path: ["repoDetails"],
      message: "GitHub canvas context requires pinned repository details",
    });
  }
  if (
    request.baseGraphRevision !== undefined
    && request.canvasContext?.graphRevision !== undefined
    && request.baseGraphRevision !== request.canvasContext.graphRevision
  ) {
    context.addIssue({
      code: "custom",
      path: ["baseGraphRevision"],
      message: "Base graph revision does not match canvas context",
    });
  }
});

export const modelValidationRequestSchema = z.object({
  providerId: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(200),
}).strict();

export type RepositoryAnalysisRequest = z.infer<typeof repositoryAnalysisRequestSchema>;
export type SourceGrantPayload = z.infer<typeof sourceGrantPayloadSchema>;
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export type PinnedFileRequest = z.infer<typeof pinnedFileRequestSchema>;
export type SourceGrantRefreshRequest = z.infer<typeof sourceGrantRefreshRequestSchema>;
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export type AnalysisCoverage = z.infer<typeof analysisCoverageSchema>;
export type RepositoryAnalysisResult = z.infer<typeof repositoryAnalysisResultSchema>;
export type AnalysisStage = z.infer<typeof analysisStageSchema>;
export type AnalysisStreamEvent = z.infer<typeof analysisStreamEventSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type CanvasPatchContract = z.infer<typeof canvasPatchSchema>;
export type ChatStreamEventV2Contract = z.infer<typeof chatStreamEventV2Schema>;
export type ModelValidationRequest = z.infer<typeof modelValidationRequestSchema>;
