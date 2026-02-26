import { Octokit } from "octokit";

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || undefined,
});

export interface RepoNode {
  path: string;
  type: "blob" | "tree";
  sha: string;
  url: string;
}

export async function getRepoStructure(owner: string, repo: string): Promise<RepoNode[]> {
  try {
    // Get the default branch first
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo,
    });
    const defaultBranch = repoData.default_branch;

    // Get the tree recursively
    const { data: treeData } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: "1",
    });

    // Filter out simplified nodes
    return treeData.tree
      .filter((item) => item.path && item.type)
      .map((item) => ({
        path: item.path!,
        type: item.type as "blob" | "tree",
        sha: item.sha!,
        url: item.url!,
      }));
  } catch (error) {
    console.error("Error fetching repo structure:", error);
    throw new Error("Failed to fetch repository structure");
  }
}

export async function getFileContent(owner: string, repo: string, path: string): Promise<string> {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
        });

        if ('content' in data && data.encoding === 'base64') {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return "";
    } catch (error) {
        console.error("Error fetching file content:", error);
        return "";
    }
}
