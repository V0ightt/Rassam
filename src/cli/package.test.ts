// Keeps the publishable package (packages/rassam/) in step with the engine
// constants, the root manifest and the bundle build. The release workflow runs
// this before it publishes anything.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, PACKAGE_NAME } from "../blueprint/constants";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(path.join(root, relative), "utf8");
const readJson = <T = Record<string, unknown>>(relative: string): T => JSON.parse(read(relative)) as T;

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  license?: string;
  type?: string;
  bin?: Record<string, string>;
  files?: string[];
  engines?: Record<string, string>;
  mcpName?: string;
  homepage?: string;
  bugs?: { url?: string };
  repository?: { type?: string; url?: string; directory?: string };
  publishConfig?: Record<string, unknown>;
  scripts?: Record<string, string>;
  [field: string]: unknown;
}

interface ServerJson {
  $schema: string;
  name: string;
  description: string;
  version: string;
  repository?: { url: string; source: string; subfolder?: string };
  packages: Array<{
    registryType: string;
    identifier: string;
    version: string;
    transport: { type: string };
    packageArguments?: Array<{ type: string; value?: string }>;
  }>;
}

const manifest = readJson<Manifest>("packages/rassam/package.json");
const rootManifest = readJson<Manifest>("package.json");
const server = readJson<ServerJson>("packages/rassam/server.json");
const readme = read("packages/rassam/README.md");
const REPO_URL = "https://github.com/V0ightt/Rassam";

describe("packages/rassam/package.json", () => {
  it("is named and versioned by the engine constants", () => {
    expect(manifest.name).toBe(PACKAGE_NAME);
    expect(manifest.version).toBe(ENGINE_VERSION);
  });

  it("ships the bundle as the rassam bin, as an ES module", () => {
    expect(manifest.bin).toEqual({ rassam: "rassam.mjs" });
    expect(manifest.type).toBe("module");
  });

  it("carries the root manifest's licence", () => {
    expect(rootManifest.license).toBeTruthy();
    expect(manifest.license).toBe(rootManifest.license);
  });

  it("has no dependencies and runs nothing on install", () => {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies"]) {
      expect(manifest[field], field).toBeUndefined();
    }
    expect(manifest.scripts).toBeUndefined();
  });

  it("publishes only the bundle, the schema and the legal and readme files", () => {
    expect(manifest.files).toEqual(["rassam.mjs", "schema/*.schema.json", "LICENSE", "NOTICE", "README.md"]);
    expect(readdirSync(path.join(root, "schema")).filter((name) => name.endsWith(".schema.json")).length).toBeGreaterThan(0);
    expect(existsSync(path.join(root, "LICENSE"))).toBe(true);
  });

  it("requires the Node version the bundle is built for", () => {
    const target = /target:\s*['"]node(\d+)['"]/.exec(read("scripts/build-cli.mjs"));
    expect(target, "build-cli.mjs sets an esbuild node target").not.toBeNull();
    expect(manifest.engines).toEqual({ node: `>=${target?.[1]}` });
  });

  it("publishes publicly with provenance", () => {
    expect(manifest.private).toBeUndefined();
    expect(manifest.publishConfig).toEqual({ access: "public", provenance: true });
  });

  it("points at the GitHub repository, never the retired domain", () => {
    expect(manifest.repository).toEqual({ type: "git", url: `git+${REPO_URL}.git`, directory: "packages/rassam" });
    expect(manifest.homepage).toBe(`${REPO_URL}#readme`);
    expect(manifest.bugs).toEqual({ url: `${REPO_URL}/issues` });
    for (const text of [JSON.stringify(manifest), JSON.stringify(server), readme]) expect(text).not.toMatch(/rassam\.dev/i);
  });

  it("leaves the root app manifest private", () => {
    expect(rootManifest.private).toBe(true);
    expect(rootManifest.name).not.toBe(PACKAGE_NAME);
  });
});

describe("packages/rassam/server.json", () => {
  it("names the same server as mcpName, in the repository owner's GitHub namespace", () => {
    const owner = /github\.com\/([^/]+)\//.exec(manifest.repository?.url ?? "")?.[1];
    expect(owner).toBeTruthy();
    expect(server.name).toBe(manifest.mcpName);
    // The registry matches the namespace case-sensitively against the GitHub login.
    expect(server.name).toBe(`io.github.${owner}/rassam`);
  });

  it("describes this version of this package", () => {
    expect(server.version).toBe(manifest.version);
    expect(server.$schema).toMatch(/^https:\/\/static\.modelcontextprotocol\.io\/schemas\/[\d-]+\/server\.schema\.json$/);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.repository).toEqual({ url: REPO_URL, source: "github", subfolder: "packages/rassam" });
    expect(server.packages).toHaveLength(1);
    const [entry] = server.packages;
    expect(entry.registryType).toBe("npm");
    expect(entry.identifier).toBe(manifest.name);
    expect(entry.version).toBe(manifest.version);
    expect(entry.transport).toEqual({ type: "stdio" });
    expect(entry.packageArguments).toEqual([expect.objectContaining({ type: "positional", value: "mcp" })]);
  });
});

describe("packages/rassam/README.md", () => {
  it("shows the three commands under the published name", () => {
    for (const command of ["init", "check", "mcp"]) expect(readme).toContain(`npx ${PACKAGE_NAME} ${command}`);
  });

  it("pins the MCP server and the GitHub Action to this release", () => {
    expect(readme).toContain(`"args": ["-y", "${PACKAGE_NAME}@${ENGINE_VERSION}", "mcp"]`);
    expect(readme).toContain(`uses: V0ightt/Rassam@v${ENGINE_VERSION}`);
    expect(readme).not.toContain("V0ightt/Rassam@main");
  });
});
