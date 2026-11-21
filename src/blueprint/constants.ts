// Shared defaults for the blueprint engine.

export const ENGINE_NAME = "rassam" as const;
export const ENGINE_VERSION = "0.4.0";

/** Files larger than this are listed but not parsed. */
export const MAX_ANALYZED_FILE_BYTES = 512 * 1024;

/** Globs never analyzed: dependencies, build output, caches, vendored code. */
export const DEFAULT_IGNORE: readonly string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/.svelte-kit/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/.venv/**",
  "**/venv/**",
  "**/__pycache__/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/coverage/**",
  "**/target/**",
  "**/vendor/**",
  "**/*.min.js",
  "**/*.map",
  "**/*.d.ts",
];

/** Test-file conventions across ecosystems. */
export const TEST_PATTERNS: readonly string[] = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/*_test.go",
  "**/test_*.py",
  "**/*_test.py",
  "**/__tests__/**",
  "**/tests/**",
  "**/test/**",
  "**/spec/**",
  "**/e2e/**",
  "**/*Test.java",
  "**/*Tests.java",
  "**/*Test.kt",
  "**/*Tests.cs",
];

export type TripwireCategory = "tests" | "ci" | "dependencies" | "agent-permissions" | "contract" | "secrets" | "build";

export interface TripwireDefinition {
  glob: string;
  category: TripwireCategory;
  reason: string;
}

/**
 * Built-in tripwires. Documented reward hacks by coding agents attack the
 * checks themselves (editing tests, patching graders, weakening CI), and the
 * worst agent incidents were permission failures, so changes to these paths
 * always surface for human review.
 */
export const DEFAULT_TRIPWIRES: readonly TripwireDefinition[] = [
  { glob: ".rassam/blueprint.json", category: "contract", reason: "The architecture contract itself changed." },
  { glob: "**/*.test.*", category: "tests", reason: "Tests are the checks agents are graded by." },
  { glob: "**/*.spec.*", category: "tests", reason: "Tests are the checks agents are graded by." },
  { glob: "**/__tests__/**", category: "tests", reason: "Tests are the checks agents are graded by." },
  { glob: "**/*_test.go", category: "tests", reason: "Tests are the checks agents are graded by." },
  { glob: "**/test_*.py", category: "tests", reason: "Tests are the checks agents are graded by." },
  { glob: "**/conftest.py", category: "tests", reason: "Test fixtures shape what tests can detect." },
  { glob: "{**/tests/**,**/test/**,**/__mocks__/**,**/__fixtures__/**}", category: "tests", reason: "Test helpers, fixtures and mocks shape what tests can detect." },
  { glob: "**/{setupTests,vitest.setup,jest.setup,test-setup}.*", category: "tests", reason: "Test setup runs before every test and can change what passes." },
  { glob: "{jest,vitest,playwright,cypress,karma}.config.*", category: "tests", reason: "Test runner configuration controls what runs and what counts as passing." },
  { glob: "{pytest.ini,tox.ini,.coveragerc,codecov.yml,.nycrc,.nycrc.json}", category: "tests", reason: "Test or coverage configuration changed." },
  { glob: ".github/workflows/**", category: "ci", reason: "CI decides what is verified before merge." },
  { glob: ".gitlab-ci.yml", category: "ci", reason: "CI decides what is verified before merge." },
  { glob: ".circleci/**", category: "ci", reason: "CI decides what is verified before merge." },
  { glob: "{.husky/**,.pre-commit-config.yaml,lefthook.yml,.git-hooks/**}", category: "ci", reason: "Git hooks are local verification gates." },
  { glob: ".github/CODEOWNERS", category: "ci", reason: "Ownership rules decide who must review." },
  { glob: "{package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lock,bun.lockb,Cargo.lock,poetry.lock,uv.lock,go.sum,Gemfile.lock,composer.lock}", category: "dependencies", reason: "Lockfile changes alter the supply chain." },
  { glob: "{.mcp.json,mcp.json,.cursor/mcp.json,.vscode/mcp.json,.windsurf/mcp_config.json}", category: "agent-permissions", reason: "MCP configuration controls which tools and credentials agents can reach." },
  { glob: ".claude/settings.json", category: "agent-permissions", reason: "Agent permission and hook settings changed." },
  { glob: ".codex/**", category: "agent-permissions", reason: "Agent configuration changed." },
  { glob: ".gemini/settings.json", category: "agent-permissions", reason: "Agent configuration changed." },
  { glob: "{AGENTS.md,CLAUDE.md,GEMINI.md,.cursorrules,.cursor/rules/**,.github/copilot-instructions.md}", category: "agent-permissions", reason: "Instructions that steer coding agents changed." },
  { glob: "**/.env*", category: "secrets", reason: "Environment files can carry credentials." },
  { glob: "{Dockerfile,**/Dockerfile,docker-compose*.yml,**/*.tf,**/*.tfvars}", category: "build", reason: "Infrastructure and deployment definitions changed." },
];
