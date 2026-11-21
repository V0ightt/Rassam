// Runs invariant check commands for `rassam check --run-invariants`.
// The commands always come from the contract the change is judged by (the
// base blueprint in diff mode), never from the change under review.

import { spawn } from "node:child_process";
import type { Blueprint } from "../blueprint/schema";
import { tailBytes } from "./util";

export interface InvariantResult {
  id: string;
  ok: boolean;
  output: string;
}

export interface InvariantOptions {
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
  onStart?(id: string, command: string): void;
}

const OUTPUT_TAIL_BYTES = 4 * 1024;
/** Keep at most this much in memory while a command runs. */
const CAPTURE_LIMIT = 64 * 1024;

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => undefined);
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // The process already exited.
  }
}

export function runShellCommand(command: string, options: InvariantOptions): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
      env: { ...process.env, ...options.env, CI: process.env.CI ?? "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let captured = "";
    let timedOut = false;
    let settled = false;
    const collect = (chunk: Buffer): void => {
      captured += chunk.toString("utf8");
      if (captured.length > CAPTURE_LIMIT) captured = captured.slice(-CAPTURE_LIMIT / 2);
    };
    const finish = (ok: boolean, suffix = ""): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ ok, output: tailBytes(`${captured}${suffix}`.trim(), OUTPUT_TAIL_BYTES) });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      // Do not wait for grandchildren holding the pipes open.
      finish(false, `\n[rassam] timed out after ${Math.round(options.timeoutMs / 1000)}s`);
    }, options.timeoutMs);
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => finish(false, `\n[rassam] could not start: ${error.message}`));
    child.on("close", (code, signal) => {
      if (timedOut) return;
      finish(code === 0, code === 0 ? "" : `\n[rassam] exited with ${signal ? `signal ${signal}` : `code ${code}`}`);
    });
  });
}

/** Run every invariant that declares `check.run`, one at a time. */
export async function runInvariants(blueprint: Blueprint | null, options: InvariantOptions): Promise<InvariantResult[]> {
  const results: InvariantResult[] = [];
  for (const invariant of blueprint?.invariants ?? []) {
    const command = invariant.check?.run;
    if (!command) continue;
    options.onStart?.(invariant.id, command);
    const outcome = await runShellCommand(command, options);
    results.push({ id: invariant.id, ok: outcome.ok, output: outcome.output });
  }
  return results;
}
