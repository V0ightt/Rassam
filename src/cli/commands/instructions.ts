// `rassam instructions`: keep the contract, stated as prose, in AGENTS.md.

import { booleanFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { agentsState, cliName, defaultBranch, hasRassamMcp, writeAgentsFile } from "../agent-files";
import { loadContextFor, requireBlueprint } from "../context";
import { CliError, EXIT_FAILED, EXIT_OK, ensureTrailingNewline } from "../io";
import type { Io } from "../io";

function instructionFile(args: ParsedArgs): string | undefined {
  const given = stringFlag(args, "file");
  if (given === undefined) return undefined;
  const file = given.replace(/\\/g, "/");
  if (!file || file.startsWith("/") || /^[A-Za-z]:/.test(file) || file.split("/").includes("..")) {
    throw new CliError(`--file must be a path inside the repository, got "${file}"`);
  }
  return file;
}

export async function instructionsCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const explicitFile = instructionFile(args);
  const state = await agentsState(context.root, blueprint, {
    file: explicitFile,
    command: stringFlag(args, "command"),
    baseBranch: context.isGit ? await defaultBranch(context.root) : undefined,
    mcp: !booleanFlag(args, "noMcp") && (await hasRassamMcp(context.root)),
  });

  if (booleanFlag(args, "check")) {
    if (state.status === "current") {
      io.stdout(`${state.file} states the current contract.\n`);
      return EXIT_OK;
    }
    const fix = `${cliName(io.env)} instructions --write${explicitFile ? ` --file ${explicitFile}` : ""}`;
    io.stderr(
      state.status === "missing"
        ? `rassam: ${state.file} has no contract block. Write it with: ${fix}\n`
        : `rassam: the contract changed since ${state.file} was written. Refresh it with: ${fix}\n`,
    );
    return EXIT_FAILED;
  }

  if (booleanFlag(args, "write")) {
    const result = await writeAgentsFile(context.root, state.block, state.file);
    io.stdout(`${result.path}: ${result.note}.\n`);
    return EXIT_OK;
  }

  io.stdout(ensureTrailingNewline(state.block));
  return EXIT_OK;
}
