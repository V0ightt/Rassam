// Process-facing seams of the CLI. Commands never touch `process` directly so
// they can be exercised in tests with captured output.

import type { Readable, Writable } from "node:stream";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  env: Record<string, string | undefined>;
  cwd: string;
  /** True when stdout is an interactive terminal. */
  isTTY: boolean;
  /** Raw streams, used only by `rassam mcp`. */
  stdin?: Readable;
  stdoutStream?: Writable;
  fetch?: typeof fetch;
  /** The clock, replaceable in tests (default: the system clock). */
  now?(): Date;
  /**
   * Ask the person a yes/no question. Present only when both stdin and stdout
   * are an interactive terminal; commands must work without it (CI, agents).
   */
  ask?(question: string, defaultYes: boolean): Promise<boolean>;
}

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/** An expected failure with a message for the user and a process exit code. */
export class CliError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, options: { exitCode?: number; hint?: string } = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? EXIT_USAGE;
    this.hint = options.hint;
  }
}

export class UsageError extends CliError {
  readonly command?: string;

  constructor(message: string, command?: string) {
    super(message, { exitCode: EXIT_USAGE });
    this.name = "UsageError";
    this.command = command;
  }
}

async function askOnTerminal(question: string, defaultYes: boolean): Promise<boolean> {
  const { createInterface } = await import("node:readline/promises");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await terminal.question(`${question} ${defaultYes ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return /^y(es)?$/.test(answer);
  } finally {
    terminal.close();
  }
}

export function processIo(): Io {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    env: process.env,
    cwd: process.cwd(),
    isTTY: Boolean(process.stdout.isTTY),
    stdin: process.stdin,
    stdoutStream: process.stdout,
    fetch: typeof fetch === "function" ? fetch : undefined,
    ...(interactive && !process.env.CI ? { ask: askOnTerminal } : {}),
  };
}

export interface CapturedIo extends Io {
  out: string[];
  err: string[];
  text(): string;
  errText(): string;
}

/** In-memory Io for tests. */
export function captureIo(overrides: Partial<Io> = {}): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: (text) => void out.push(text),
    stderr: (text) => void err.push(text),
    env: {},
    cwd: process.cwd(),
    isTTY: false,
    ...overrides,
    out,
    err,
    text: () => out.join(""),
    errText: () => err.join(""),
  };
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}
