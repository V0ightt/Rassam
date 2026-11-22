import { z } from "zod";

export const MAX_API_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_REPOSITORY_TREE_ENTRIES = 100_000;
export const MAX_ANALYSIS_FILES = 10_000;
export const MAX_ANALYSIS_SOURCE_BYTES = 25 * 1024 * 1024;

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

export const modelValidationRequestSchema = z.object({
  providerId: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(200),
}).strict();

export type SourceGrantPayload = z.infer<typeof sourceGrantPayloadSchema>;
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export type ModelValidationRequest = z.infer<typeof modelValidationRequestSchema>;
