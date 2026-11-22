import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BLUEPRINT_PATH, serializeBlueprint } from "../../blueprint/schema";
import type { Verification } from "../../blueprint/schema";
import { stampVerification } from "../../blueprint/verify";
import { stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { loadContextFor, requireBlueprint } from "../context";
import { headSha, userName } from "../git";
import { CliError, EXIT_OK } from "../io";
import type { Io } from "../io";
import { errorMessage } from "../util";

export async function verifyCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const by = stringFlag(args, "by")?.trim() || (context.isGit ? await userName(context.root) : null);
  if (!by) throw new CliError("Who is signing? git config user.name is not set", { hint: "Pass --by <name>." });
  const commit = context.isGit ? await headSha(context.root) : null;
  const note = stringFlag(args, "note")?.trim();
  const verification: Verification = { by, at: new Date().toISOString(), ...(commit ? { commit } : {}), ...(note ? { note } : {}) };

  let stamped;
  try {
    stamped = stampVerification(blueprint, args.positionals[0], verification);
  } catch (error) {
    throw new CliError(errorMessage(error), { hint: "Component, rule and invariant ids are listed in .rassam/blueprint.json; dependencies are addressed as from->to." });
  }
  await writeFile(join(context.root, BLUEPRINT_PATH), serializeBlueprint(stamped.blueprint), "utf8");
  io.stdout(
    [
      `Signed ${stamped.kind} ${args.positionals[0]}${stamped.target !== args.positionals[0] ? ` (${stamped.target})` : ""}`,
      `  by ${verification.by} at ${verification.at}${commit ? ` · commit ${commit.slice(0, 12)}` : ""}`,
      ...(note ? [`  note: ${note}`] : []),
      "",
      `A sign-off says: "I checked this against the code at this commit." It is a change to ${BLUEPRINT_PATH},`,
      "so it is reviewed in the pull request like any other change. Commit it with your name on it.",
      "",
    ].join("\n"),
  );
  return EXIT_OK;
}
