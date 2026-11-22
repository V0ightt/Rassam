// `rassam do "<instruction>"`: change the blueprint in plain language. The
// instruction is parsed by fixed rules (no model), shown back as typed edits,
// and only saved with --write.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BlueprintEditError, applyBlueprintEdits, describeEdits } from "../../blueprint/edits";
import type { AppliedEdit, BlueprintEdit } from "../../blueprint/edits";
import { parseIntent } from "../../blueprint/intent";
import { BLUEPRINT_PATH, serializeBlueprint } from "../../blueprint/schema";
import type { Blueprint, Provenance } from "../../blueprint/schema";
import { booleanFlag, numberFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { loadContextFor, requireBlueprint } from "../context";
import { userName } from "../git";
import { CliError, EXIT_OK, EXIT_USAGE } from "../io";
import type { Io } from "../io";
import { renderJsonText } from "../format";

const MAX_EXAMPLES = 6;

function apply(blueprint: Blueprint, edits: readonly BlueprintEdit[], provenance: Provenance, now: string): { blueprint: Blueprint; applied: AppliedEdit[] } {
  try {
    return applyBlueprintEdits(blueprint, edits, { provenance, now });
  } catch (error) {
    if (error instanceof BlueprintEditError) {
      throw new CliError(`The change cannot be applied: ${error.message}`, { hint: error.suggestions?.length ? `Did you mean: ${error.suggestions.join(", ")}?` : undefined });
    }
    throw error;
  }
}

export async function doCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const instruction = args.positionals.join(" ").trim();
  const json = stringFlag(args, "format") === "json";
  const write = booleanFlag(args, "write");
  const result = parseIntent(instruction, blueprint);

  if (result.status === "unknown") {
    if (json) io.stdout(renderJsonText({ status: "unknown", message: result.message, examples: result.examples }));
    else io.stderr([`rassam: ${result.message}`, "", "Instructions that work:", ...result.examples.slice(0, MAX_EXAMPLES).map((example) => `  rassam do "${example.replace(/"/g, '\\"')}"`), ""].join("\n"));
    return EXIT_USAGE;
  }

  let edits: BlueprintEdit[];
  let interpretation: string;
  if (result.status === "ambiguous") {
    const choice = numberFlag(args, "choose");
    if (choice === undefined) {
      if (json) io.stdout(renderJsonText({ status: "ambiguous", message: result.message, options: result.options.map((option, index) => ({ choose: index + 1, label: option.label })) }));
      else io.stderr([`rassam: ${result.message}`, "", ...result.options.map((option, index) => `  ${index + 1}. ${option.label}`), "", "Nothing was changed. Say it more precisely, or pick one with --choose <n>.", ""].join("\n"));
      return EXIT_USAGE;
    }
    const option = Number.isInteger(choice) ? result.options[choice - 1] : undefined;
    if (!option) throw new CliError(`--choose expects a number from 1 to ${result.options.length}`);
    edits = option.edits;
    interpretation = option.label;
  } else {
    edits = result.edits;
    interpretation = result.interpretation;
  }

  const by = stringFlag(args, "by")?.trim() || (context.isGit ? await userName(context.root) : null) || undefined;
  const provenance: Provenance = { source: "human", ...(by ? { by } : {}) };
  const now = (io.now?.() ?? new Date()).toISOString();
  const outcome = apply(blueprint, edits, provenance, now);
  const weakening = outcome.applied.filter((edit) => edit.weakens);
  const refused = weakening.length > 0 && !booleanFlag(args, "allowWeakening");
  const saved = write && !refused && outcome.applied.length > 0;

  if (json) {
    io.stdout(renderJsonText({ status: refused ? "refused" : "ok", interpretation, edits, applied: outcome.applied, weakens: weakening.length > 0, written: saved }));
  } else {
    const lines = [`Understood as: ${interpretation}`, "", describeEdits(outcome.applied), ""];
    if (refused) {
      lines.push(
        `Refused: ${weakening.length === 1 ? "this change loosens" : "these changes loosen"} the contract agents are judged by. Nothing was written.`,
        "If that is what you want, run it again with --allow-weakening. The flag only lets the edit into the file:",
        "a pull request that weakens the blueprint still needs a person to add the approval label before CI passes.",
        "",
      );
    } else if (saved) {
      lines.push(`Saved to ${BLUEPRINT_PATH}${by ? `, recorded as written by ${by}` : ""}. Review the diff and commit it like any other change.`);
      if (weakening.length) lines.push("This loosens the contract: the pull request needs the approval label before CI passes.");
      lines.push("");
    } else if (!outcome.applied.length) lines.push("Nothing to change.", "");
    else lines.push(`Dry run: ${BLUEPRINT_PATH} was not changed. Add --write to save.`, "");
    (refused ? io.stderr : io.stdout)(lines.join("\n"));
  }
  if (refused) return EXIT_USAGE;
  if (saved) await writeFile(join(context.root, BLUEPRINT_PATH), serializeBlueprint(outcome.blueprint), "utf8");
  return EXIT_OK;
}
