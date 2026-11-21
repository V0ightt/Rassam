import { ENGINE_VERSION } from "../../blueprint/constants";
import { stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { resolveRoot } from "../context";
import { CliError, EXIT_OK } from "../io";
import type { Io } from "../io";
import { serveMcp } from "../mcp/protocol";
import { createTools, SERVER_INSTRUCTIONS } from "../mcp/tools";

export async function mcpCommand(args: ParsedArgs, io: Io): Promise<number> {
  if (!io.stdin || !io.stdoutStream) throw new CliError("rassam mcp needs stdin and stdout streams");
  const { root } = await resolveRoot(io, stringFlag(args, "root"));
  const log = (message: string): void => io.stderr(`[rassam mcp] ${message}\n`);
  // stdout carries MCP messages only: anything a dependency logs goes to stderr.
  const redirect = (...parts: unknown[]): void => log(parts.map(String).join(" "));
  console.log = redirect;
  console.info = redirect;
  console.debug = redirect;
  log(`serving ${root} (rassam ${ENGINE_VERSION})`);
  await serveMcp(
    { name: "rassam", title: "Rassam Blueprint", version: ENGINE_VERSION, instructions: SERVER_INSTRUCTIONS, tools: createTools({ root, log }), log },
    io.stdin,
    io.stdoutStream,
  );
  return EXIT_OK;
}
