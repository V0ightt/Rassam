// Writes the published JSON Schema for `.rassam/blueprint.json` from the Zod
// source of truth in src/blueprint/schema.ts:
//
//   npm run blueprint:schema  →  schema/blueprint-0.1.schema.json
//
// The output is committed. Editors and non-TypeScript tools validate against
// it; regenerate it whenever src/blueprint/schema.ts changes.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BLUEPRINT_VERSION, blueprintJsonSchema } from "../src/blueprint/schema";

// npm scripts run from the package root; resolving from the working directory
// keeps this file free of module-format-specific globals.
const outputPath = path.resolve(process.cwd(), "schema", `blueprint-${BLUEPRINT_VERSION}.schema.json`);

const schema = blueprintJsonSchema();
if (typeof schema.$id !== "string" || typeof schema.properties !== "object" || schema.properties === null) {
  throw new Error("blueprintJsonSchema() returned an unexpected shape: missing $id or properties.");
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

const relative = path.relative(process.cwd(), outputPath).replace(/\\/g, "/");
process.stdout.write(`${relative}  (${Object.keys(schema.properties).length} top-level properties, $id ${schema.$id})\n`);
