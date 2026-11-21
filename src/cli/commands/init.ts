import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { deriveBlueprint, detectSystemName } from "../../blueprint/derive";
import { BLUEPRINT_PATH, serializeBlueprint } from "../../blueprint/schema";
import type { Blueprint } from "../../blueprint/schema";
import { booleanFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { loadContextFor } from "../context";
import { headSha, originUrl, userName } from "../git";
import { CliError, EXIT_OK } from "../io";
import type { Io } from "../io";

export const MCP_CONFIG_SNIPPET = '{"mcpServers":{"rassam":{"command":"npx","args":["rassam","mcp"]}}}';
export const MCP_CONFIG_SNIPPET_LOCAL = '{"mcpServers":{"rassam":{"command":"node","args":["action/dist/rassam.mjs","mcp"]}}}';

function nextSteps(blueprint: Blueprint): string {
  return [
    `Wrote ${BLUEPRINT_PATH}: ${blueprint.components.length} components, ${blueprint.dependencies.length} observed dependencies.`,
    "",
    "This is a draft derived from the code. It becomes a contract when you make it yours:",
    `  1. Open ${BLUEPRINT_PATH} and merge, split or rename components until they match how you think about the system.`,
    "  2. Write the intent of each component: purpose, responsibilities, boundaries. Agents cannot infer this from code.",
    "  3. Add rules (forbid, allow-only, layers, no-cycles, protect, secret-access) and give each a reason.",
    "  4. Run: rassam check",
    "  5. Sign what you have checked: rassam verify <id>",
    "  6. Gate pull requests: add the Rassam GitHub Action, which runs \"rassam check --github --comment\"",
    "     and judges every PR by the blueprint on its base branch.",
    "  7. Give coding agents the contract over MCP. Add to .mcp.json:",
    `       ${MCP_CONFIG_SNIPPET}`,
    "     or, with the bundled build in this repository (node action/dist/rassam.mjs mcp):",
    `       ${MCP_CONFIG_SNIPPET_LOCAL}`,
    "",
  ].join("\n");
}

export async function initCommand(args: ParsedArgs, io: Io): Promise<number> {
  const dryRun = booleanFlag(args, "dryRun");
  const context = await loadContextFor(io, stringFlag(args, "root"));
  if (context.blueprintState !== "missing" && !booleanFlag(args, "force") && !dryRun) {
    throw new CliError(`${BLUEPRINT_PATH} already exists`, { hint: "Use --force to replace it with a fresh draft, or --dry-run to preview one." });
  }
  const blueprint = deriveBlueprint(context.files, {
    name: stringFlag(args, "name") ?? detectSystemName(context.files) ?? basename(context.root),
    repository: context.isGit ? (await originUrl(context.root)) ?? undefined : undefined,
    commit: context.isGit ? (await headSha(context.root)) ?? undefined : undefined,
    author: context.isGit ? (await userName(context.root)) ?? undefined : undefined,
    now: new Date().toISOString(),
  });
  const text = serializeBlueprint(blueprint);
  if (dryRun) {
    io.stdout(text);
    return EXIT_OK;
  }
  const target = join(context.root, BLUEPRINT_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
  io.stdout(nextSteps(blueprint));
  return EXIT_OK;
}
