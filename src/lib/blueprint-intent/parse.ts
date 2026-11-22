// Reading a model's answer to an edit request. Model output is untrusted: it is
// parsed tolerantly, every edit is validated against the edit schema and the
// whole batch is dry-run against the blueprint before anything is returned.

import {
  applyBlueprintEdits,
  blueprintEditSchema,
  BlueprintEditError,
  type AppliedEdit,
  type BlueprintEdit,
} from "@/blueprint/edits";
import type { Blueprint, Provenance } from "@/blueprint/schema";

export const MAX_MODEL_EDITS = 40;
const MAX_EXPLANATION_CHARS = 1_000;
const MAX_QUESTIONS = 3;
const MAX_QUESTION_CHARS = 300;

/** The first balanced `{ ... }` in the text that parses as JSON, ignoring code fences and surrounding prose. */
export function extractJsonObject(raw: string): unknown | null {
  const text = raw.replace(/^﻿/, "").trim();
  if (!text) return null;
  try {
    const direct: unknown = JSON.parse(text);
    if (typeof direct === "object" && direct !== null && !Array.isArray(direct)) return direct;
  } catch {
    // fall through to scanning
  }
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const value: unknown = JSON.parse(text.slice(start, index + 1));
            if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
          } catch {
            // not JSON from this brace; try the next one
          }
          break;
        }
      }
    }
  }
  return null;
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : char;
  }
  out = out.replace(/\s+/g, " ").trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

export type ModelEditOutcome =
  | { ok: true; edits: BlueprintEdit[]; applied: AppliedEdit[]; explanation: string; questions: string[] }
  | { ok: false; problem: string };

/** Validate and dry-run a model answer. Never throws. */
export function interpretModelOutput(raw: string, blueprint: Blueprint, provenance: Provenance): ModelEditOutcome {
  const value = extractJsonObject(raw);
  if (!value) return { ok: false, problem: "The answer was not a JSON object." };
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.edits)) return { ok: false, problem: 'The JSON object needs an "edits" array.' };
  if (record.edits.length > MAX_MODEL_EDITS) {
    return { ok: false, problem: `At most ${MAX_MODEL_EDITS} edits are accepted in one answer; you returned ${record.edits.length}.` };
  }

  const edits: BlueprintEdit[] = [];
  for (let index = 0; index < record.edits.length; index += 1) {
    const parsed = blueprintEditSchema.safeParse(record.edits[index]);
    if (!parsed.success) {
      const op = (record.edits[index] as { op?: unknown } | null)?.op;
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.length ? `${issue.path.map(String).join(".")}: ` : ""}${issue.message}`)
        .join("; ");
      return { ok: false, problem: `Edit ${index + 1}${typeof op === "string" ? ` (${cleanText(op, 40)})` : ""} is not a valid operation: ${detail}` };
    }
    edits.push(parsed.data);
  }

  let applied: AppliedEdit[];
  try {
    applied = applyBlueprintEdits(blueprint, edits, { provenance }).applied;
  } catch (error) {
    if (error instanceof BlueprintEditError) {
      const hint = error.suggestions?.length ? ` Closest existing ids: ${error.suggestions.join(", ")}.` : "";
      return { ok: false, problem: `${error.message}${hint}` };
    }
    return { ok: false, problem: "The edits could not be applied to the blueprint." };
  }

  const questions = Array.isArray(record.questions)
    ? record.questions.map((question) => cleanText(question, MAX_QUESTION_CHARS)).filter(Boolean).slice(0, MAX_QUESTIONS)
    : [];
  return { ok: true, edits, applied, explanation: cleanText(record.explanation, MAX_EXPLANATION_CHARS), questions };
}
