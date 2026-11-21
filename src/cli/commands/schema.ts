import { blueprintJsonSchema } from "../../blueprint/schema";
import type { ParsedArgs } from "../args";
import { EXIT_OK } from "../io";
import type { Io } from "../io";

export async function schemaCommand(_args: ParsedArgs, io: Io): Promise<number> {
  io.stdout(`${JSON.stringify(blueprintJsonSchema(), null, 2)}\n`);
  return EXIT_OK;
}
