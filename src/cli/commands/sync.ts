import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BLUEPRINT_PATH, serializeBlueprint } from "../../blueprint/schema";
import { syncBlueprint } from "../../blueprint/sync";
import { booleanFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { loadContextFor, requireBlueprint } from "../context";
import { headSha, userName } from "../git";
import { EXIT_OK } from "../io";
import type { Io } from "../io";

export async function syncCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const result = syncBlueprint(blueprint, context.files, {
    components: !booleanFlag(args, "noComponents"),
    dependencies: !booleanFlag(args, "noDependencies"),
    commit: context.isGit ? (await headSha(context.root)) ?? undefined : undefined,
    author: context.isGit ? (await userName(context.root)) ?? undefined : undefined,
  });
  const write = booleanFlag(args, "write");

  if (stringFlag(args, "format") === "json") {
    io.stdout(`${JSON.stringify({
      written: write,
      addedComponents: result.addedComponents,
      addedDependencies: result.addedDependencies,
      skippedFiles: result.skippedFiles,
    }, null, 2)}\n`);
  } else {
    const lines: string[] = [];
    if (!result.addedComponents.length && !result.addedDependencies.length) {
      lines.push("The blueprint already covers the code: no unclaimed files, no undeclared dependencies.");
    } else {
      lines.push(write ? `Updated ${BLUEPRINT_PATH}:` : `Proposed additions (dry run; use --write to apply):`);
      for (const component of result.addedComponents) {
        lines.push(`  + component ${component.id} (${component.kind}): ${component.paths.join(", ")}`);
      }
      for (const dependency of result.addedDependencies) lines.push(`  + dependency ${dependency.from} -> ${dependency.to}`);
      lines.push("", "Every addition is marked provenance \"derived\". Review them, write intent for new components,");
      lines.push("and sign what you accept with `rassam verify <id>`. Nothing you wrote was changed.");
    }
    if (result.skippedFiles.length) lines.push(`  (${result.skippedFiles.length} unclaimed files were left for you to place by hand)`);
    io.stdout(`${lines.join("\n")}\n`);
  }

  if (write && (result.addedComponents.length || result.addedDependencies.length)) {
    await writeFile(join(context.root, BLUEPRINT_PATH), serializeBlueprint(result.blueprint), "utf8");
  }
  return EXIT_OK;
}
