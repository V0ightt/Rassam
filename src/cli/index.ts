#!/usr/bin/env node
// Entry point of the `rassam` CLI (bundled to action/dist/rassam.mjs).

import { processIo } from "./io";
import { main } from "./main";

function exit(code: number): void {
  process.exitCode = code;
  // Flush stdout before exiting: reports can be large and stdout may be a pipe.
  process.stdout.write("", () => process.exit(code));
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(process.exitCode ?? 0);
});

main(process.argv.slice(2), processIo()).then(exit, (error: unknown) => {
  process.stderr.write(`rassam: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(2);
});
