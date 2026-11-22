import { Octokit } from "octokit";

import { ApiError } from "./api-error";
import {
  MAX_REPOSITORY_TREE_ENTRIES,
  MAX_VIEWER_FILE_BYTES,
  githubCoordinatesSchema,
  type RepositorySnapshot,
  type SourceGrantPayload,
} from "./contracts";

const githubToken = process.env.GITHUB_TOKEN?.trim();
const isValidToken = Boolean(
  githubToken && /^(ghp_|gho_|ghs_|ghu_|github_pat_)/i.test(githubToken),
);

export const octokit = new Octokit({
  auth: isValidToken ? githubToken : undefined,
  userAgent: "rassam/0.3",
  // Fail fast when the quota is exhausted. The default behaviour waits for the
  // reset (up to an hour) and retries, which leaves the request hanging.
  throttle: {
    onRateLimit: () => false,
    onSecondaryRateLimit: () => false,
  },
});

export type RepoNodeType = "blob" | "tree" | "commit";

export interface RepoNode {
  path: string;
  type: RepoNodeType;
  sha: string;
  url: string;
  mode?: string;
  size?: number;
}

export interface PublicRepository {
  snapshot: RepositorySnapshot;
  nodes: RepoNode[];
  details: {
    owner: string;
    repo: string;
    defaultBranch: string;
    description: string | null;
    stars: number;
    language: string | null;
    fileCount: number;
  };
}

type RepositoryDetails = PublicRepository["details"];

export interface PinnedFile {
  path: string;
  blobSha: string;
  commitSha: string;
  size: number;
  content: string | null;
  binary: boolean;
  encoding: "utf-8" | "binary";
}

interface GitHubErrorShape {
  status?: number;
  response?: { headers?: Record<string, string | undefined> };
}

function githubErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  return (error as GitHubErrorShape).status;
}

function isRateLimited(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const shaped = error as GitHubErrorShape;
  return shaped.status === 429
    || (shaped.status === 403 && shaped.response?.headers?.["x-ratelimit-remaining"] === "0");
}

function mapGitHubError(error: unknown, notFoundCode: "REPOSITORY_NOT_FOUND" | "REF_NOT_FOUND" | "FILE_NOT_FOUND"): ApiError {
  if (error instanceof ApiError) return error;
  if (isRateLimited(error)) {
    return new ApiError("GITHUB_RATE_LIMITED", 429, "GitHub API rate limit reached", true);
  }
  const status = githubErrorStatus(error);
  if (status === 404) {
    const messages = {
      REPOSITORY_NOT_FOUND: "Public repository was not found",
      REF_NOT_FOUND: "Repository ref was not found",
      FILE_NOT_FOUND: "File was not found at the pinned revision",
    } as const;
    return new ApiError(notFoundCode, 404, messages[notFoundCode]);
  }
  if (status === 401 || status === 403) {
    return new ApiError("GITHUB_UNAVAILABLE", 502, "GitHub refused the repository request", true);
  }
  return new ApiError("GITHUB_UNAVAILABLE", 502, "GitHub is temporarily unavailable", true);
}

export function parseGitHubRepositoryUrl(value: string): { owner: string; repo: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError("INVALID_GITHUB_URL", 400, "Enter an exact https://github.com/owner/repository URL");
  }

  if (
    parsed.protocol !== "https:"
    || parsed.hostname.toLowerCase() !== "github.com"
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new ApiError("INVALID_GITHUB_URL", 400, "Only public github.com repository URLs are supported");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new ApiError("INVALID_GITHUB_URL", 400, "Enter an exact https://github.com/owner/repository URL");
  }
  const candidate = {
    owner: segments[0],
    repo: segments[1].replace(/\.git$/i, ""),
  };
  const result = githubCoordinatesSchema.safeParse(candidate);
  if (!result.success) {
    throw new ApiError("INVALID_GITHUB_URL", 400, "Enter a valid GitHub owner and repository name");
  }
  return result.data;
}

export function normalizeRepositoryPath(value: string): string {
  if (
    !value
    || value.length > 4_096
    || value.includes("\\")
    || value.includes("\0")
    || value.startsWith("/")
  ) {
    throw new ApiError("INVALID_FILE_PATH", 400, "File path is invalid");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new ApiError("INVALID_FILE_PATH", 400, "File path is invalid");
  }
  return segments.join("/");
}

function normalizeTreeItem(
  item: { path?: string | null; type?: string | null; sha?: string | null; url?: string | null; mode?: string | null; size?: number | null },
  prefix = "",
): RepoNode | null {
  if (!item.path || !item.sha || !item.type || !["blob", "tree", "commit"].includes(item.type)) return null;
  return {
    path: prefix ? `${prefix}/${item.path}` : item.path,
    type: item.type as RepoNodeType,
    sha: item.sha,
    url: item.url || "",
    ...(item.mode ? { mode: item.mode } : {}),
    ...(typeof item.size === "number" ? { size: item.size } : {}),
  };
}

export async function fetchCompleteTree(
  owner: string,
  repo: string,
  treeSha: string,
  signal?: AbortSignal,
): Promise<RepoNode[]> {
  let recursiveTree;
  try {
    recursiveTree = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1",
      request: { signal },
    });
  } catch (error) {
    throw mapGitHubError(error, "REF_NOT_FOUND");
  }

  const recursiveNodes = recursiveTree.data.tree
    .map((item) => normalizeTreeItem(item))
    .filter((item): item is RepoNode => item !== null);
  if (!recursiveTree.data.truncated) {
    if (recursiveNodes.length > MAX_REPOSITORY_TREE_ENTRIES) {
      throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository tree exceeds 100,000 entries");
    }
    return recursiveNodes.sort((a, b) => a.path.localeCompare(b.path));
  }

  // GitHub truncates large recursive tree responses. Walk each subtree without
  // recursion so every returned path is accounted for or the request fails.
  const queue: Array<{ sha: string; prefix: string }> = [{ sha: treeSha, prefix: "" }];
  const complete: RepoNode[] = [];
  const concurrency = 8;

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    let responses;
    try {
      responses = await Promise.all(batch.map((entry) => octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: entry.sha,
        request: { signal },
      })));
    } catch (error) {
      const mapped = mapGitHubError(error, "REF_NOT_FOUND");
      throw new ApiError("TREE_INCOMPLETE", mapped.status, "Could not retrieve the complete repository tree", mapped.retryable);
    }

    responses.forEach((response, index) => {
      if (response.data.truncated) {
        throw new ApiError("TREE_INCOMPLETE", 422, "GitHub truncated a repository subtree; complete analysis is not possible");
      }
      const prefix = batch[index].prefix;
      for (const item of response.data.tree) {
        const node = normalizeTreeItem(item, prefix);
        if (!node) continue;
        complete.push(node);
        if (node.type === "tree") queue.push({ sha: node.sha, prefix: node.path });
        if (complete.length > MAX_REPOSITORY_TREE_ENTRIES) {
          throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository tree exceeds 100,000 entries");
        }
      }
    });
  }

  const unique = new Map(complete.map((node) => [node.path, node]));
  return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export async function getPublicRepository(
  owner: string,
  repo: string,
  requestedRef?: string,
  signal?: AbortSignal,
): Promise<PublicRepository> {
  const resolved = await resolvePublicRepositoryRevision(owner, repo, requestedRef, signal);
  const nodes = await fetchCompleteTree(resolved.snapshot.owner, resolved.snapshot.repo, resolved.snapshot.treeSha, signal);
  return {
    snapshot: resolved.snapshot,
    nodes,
    details: {
      ...resolved.details,
      fileCount: nodes.filter((node) => node.type === "blob").length,
    },
  };
}

export async function resolvePublicRepositoryRevision(
  owner: string,
  repo: string,
  requestedRef?: string,
  signal?: AbortSignal,
): Promise<{ snapshot: RepositorySnapshot; details: RepositoryDetails }> {
  const coordinates = githubCoordinatesSchema.safeParse({ owner, repo });
  if (!coordinates.success) {
    throw new ApiError("INVALID_GITHUB_URL", 400, "Invalid GitHub owner or repository name");
  }

  let repository;
  try {
    repository = await octokit.rest.repos.get({ ...coordinates.data, request: { signal } });
  } catch (error) {
    throw mapGitHubError(error, "REPOSITORY_NOT_FOUND");
  }
  if (repository.data.private || repository.data.visibility !== "public") {
    throw new ApiError("REPOSITORY_PRIVATE", 403, "Private repositories are not supported");
  }

  const ref = requestedRef?.trim() || repository.data.default_branch;
  let commit;
  try {
    commit = await octokit.rest.repos.getCommit({ ...coordinates.data, ref, request: { signal } });
  } catch (error) {
    throw mapGitHubError(error, "REF_NOT_FOUND");
  }

  const commitSha = commit.data.sha;
  const treeSha = commit.data.commit.tree.sha;
  if (!/^[a-f0-9]{40}$/i.test(commitSha) || !/^[a-f0-9]{40}$/i.test(treeSha)) {
    throw new ApiError("GITHUB_UNAVAILABLE", 502, "GitHub returned an invalid repository revision", true);
  }

  const snapshot: RepositorySnapshot = {
    host: "github.com",
    owner: coordinates.data.owner,
    repo: coordinates.data.repo,
    requestedRef: ref,
    defaultBranch: repository.data.default_branch,
    commitSha,
    treeSha,
    visibility: "public",
    retrievedAt: new Date().toISOString(),
  };

  return {
    snapshot,
    details: {
      owner: snapshot.owner,
      repo: snapshot.repo,
      defaultBranch: snapshot.defaultBranch,
      description: repository.data.description,
      stars: repository.data.stargazers_count,
      language: repository.data.language,
      fileCount: 0,
    },
  };
}

export async function getRepoStructure(owner: string, repo: string, ref?: string): Promise<RepoNode[]> {
  return (await getPublicRepository(owner, repo, ref)).nodes;
}

async function fetchBlobBytes(
  owner: string,
  repo: string,
  blobSha: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  let blob;
  try {
    blob = await octokit.rest.git.getBlob({ owner, repo, file_sha: blobSha, request: { signal } });
  } catch (error) {
    throw mapGitHubError(error, "FILE_NOT_FOUND");
  }
  if ((blob.data.size ?? 0) > maxBytes) {
    throw new ApiError("FILE_TOO_LARGE", 413, `File exceeds the ${maxBytes} byte limit`);
  }
  if (blob.data.encoding !== "base64") {
    throw new ApiError("GITHUB_UNAVAILABLE", 502, "GitHub returned an unsupported file encoding", true);
  }
  const bytes = Buffer.from(blob.data.content.replace(/\s/g, ""), "base64");
  if (bytes.length > maxBytes) {
    throw new ApiError("FILE_TOO_LARGE", 413, `File exceeds the ${maxBytes} byte limit`);
  }
  return bytes;
}

function decodeText(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export async function getPinnedFile(
  grant: SourceGrantPayload,
  path: string,
  options: { expectedBlobSha?: string; maxBytes?: number; signal?: AbortSignal } = {},
): Promise<PinnedFile> {
  const normalizedPath = normalizeRepositoryPath(path);
  const maxBytes = Math.min(MAX_VIEWER_FILE_BYTES, options.maxBytes ?? MAX_VIEWER_FILE_BYTES);

  // A grant proves the repository was public when issued. Recheck visibility
  // at read time so a repository made private during the grant TTL cannot be
  // accessed with a server credential that still has private scope.
  try {
    const repository = await octokit.rest.repos.get({
      owner: grant.owner,
      repo: grant.repo,
      request: { signal: options.signal },
    });
    if (repository.data.private || repository.data.visibility !== "public") {
      throw new ApiError("REPOSITORY_PRIVATE", 403, "Private repositories are not supported");
    }
  } catch (error) {
    throw mapGitHubError(error, "REPOSITORY_NOT_FOUND");
  }

  let contentEntry;
  try {
    contentEntry = await octokit.rest.repos.getContent({
      owner: grant.owner,
      repo: grant.repo,
      path: normalizedPath,
      ref: grant.commitSha,
      request: { signal: options.signal },
    });
  } catch (error) {
    throw mapGitHubError(error, "FILE_NOT_FOUND");
  }

  if (Array.isArray(contentEntry.data) || !("sha" in contentEntry.data)) {
    throw new ApiError("FILE_NOT_FOUND", 404, "File was not found at the pinned revision");
  }
  const blobSha = contentEntry.data.sha;
  if (!/^[a-f0-9]{40}$/i.test(blobSha)) {
    throw new ApiError("GITHUB_UNAVAILABLE", 502, "GitHub returned an invalid file revision", true);
  }
  if (options.expectedBlobSha && options.expectedBlobSha.toLowerCase() !== blobSha.toLowerCase()) {
    throw new ApiError("FILE_REVISION_MISMATCH", 409, "File revision does not match the analyzed repository");
  }

  const bytes = await fetchBlobBytes(grant.owner, grant.repo, blobSha, maxBytes, options.signal);
  const content = decodeText(bytes);
  return {
    path: normalizedPath,
    blobSha,
    commitSha: grant.commitSha,
    size: bytes.length,
    content,
    binary: content === null,
    encoding: content === null ? "binary" : "utf-8",
  };
}

export async function getBlobText(
  owner: string,
  repo: string,
  blobSha: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const bytes = await fetchBlobBytes(owner, repo, blobSha, maxBytes, signal);
  return decodeText(bytes);
}

// Compatibility helper for chat while it migrates to SourceGrant. It still
// verifies public visibility and pins the selected ref before reading.
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const repository = await resolvePublicRepositoryRevision(owner, repo, ref);
  const grant: SourceGrantPayload = {
    version: 1,
    owner: repository.snapshot.owner,
    repo: repository.snapshot.repo,
    commitSha: repository.snapshot.commitSha,
    treeSha: repository.snapshot.treeSha,
    issuedAt: 0,
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
  try {
    return (await getPinnedFile(grant, path)).content;
  } catch (error) {
    if (error instanceof ApiError && ["FILE_NOT_FOUND", "FILE_BINARY", "FILE_TOO_LARGE"].includes(error.code)) {
      return null;
    }
    throw error;
  }
}
