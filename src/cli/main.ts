// Command dispatch and top-level error handling for the `rassam` CLI.

import { ENGINE_VERSION } from "../blueprint/constants";
import { commandHelp, findCommand, generalHelp, parseArgs } from "./args";
import type { ParsedArgs } from "./args";
import { CliError, EXIT_OK, EXIT_USAGE, UsageError } from "./io";
import type { Io } from "./io";
import { errorMessage } from "./util";

type CommandHandler = (args: ParsedArgs, io: Io) => Promise<number>;

/** Commands load lazily so `rassam --help` and `rassam mcp` start fast. */
const LOADERS: Record<string, () => Promise<CommandHandler>> = {
  init: async () => (await import("./commands/init")).initCommand,
  check: async () => (await import("./commands/check")).checkCommand,
  explain: async () => (await import("./commands/query")).explainCommand,
  impact: async () => (await import("./commands/query")).impactCommand,
  graph: async () => (await import("./commands/query")).graphCommand,
  reach: async () => (await import("./commands/query")).reachCommand,
  verify: async () => (await import("./commands/verify")).verifyCommand,
  sync: async () => (await import("./commands/sync")).syncCommand,
  render: async () => (await import("./commands/render")).renderCommand,
  status: async () => (await import("./commands/status")).statusCommand,
  do: async () => (await import("./commands/do")).doCommand,
  proposals: async () => (await import("./commands/proposals")).proposalsCommand,
  instructions: async () => (await import("./commands/instructions")).instructionsCommand,
  schema: async () => (await import("./commands/schema")).schemaCommand,
  mcp: async () => (await import("./commands/mcp")).mcpCommand,
};

function reportError(error: unknown, io: Io): number {
  if (error instanceof UsageError) {
    io.stderr(`rassam: ${error.message}\n`);
    io.stderr(error.command ? `Run "rassam ${error.command} --help" for usage.\n` : 'Run "rassam --help" for usage.\n');
    return EXIT_USAGE;
  }
  if (error instanceof CliError) {
    io.stderr(`rassam: ${error.message}\n`);
    if (error.hint) io.stderr(`  ${error.hint}\n`);
    return error.exitCode;
  }
  io.stderr(`rassam: unexpected error: ${errorMessage(error)}\n`);
  if (io.env.RASSAM_DEBUG && error instanceof Error && error.stack) io.stderr(`${error.stack}\n`);
  else io.stderr("  Set RASSAM_DEBUG=1 for a stack trace.\n");
  return EXIT_USAGE;
}

/** Run the CLI; resolves to the process exit code. Never throws. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.version && !args.command) {
      io.stdout(`${ENGINE_VERSION}\n`);
      return EXIT_OK;
    }
    const spec = args.command ? findCommand(args.command) : undefined;
    if (!spec) {
      const help = generalHelp(ENGINE_VERSION);
      if (args.help) {
        io.stdout(help);
        return EXIT_OK;
      }
      io.stderr(help);
      return EXIT_USAGE;
    }
    if (args.help) {
      io.stdout(commandHelp(spec));
      return EXIT_OK;
    }
    if (args.version) {
      io.stdout(`${ENGINE_VERSION}\n`);
      return EXIT_OK;
    }
    const handler = await LOADERS[spec.name]();
    return await handler(args, io);
  } catch (error) {
    return reportError(error, io);
  }
}
