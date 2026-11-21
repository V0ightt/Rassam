// Small Node helpers shared by the CLI host layer.

import { open, stat } from "node:fs/promises";
import { MAX_ANALYZED_FILE_BYTES } from "../blueprint/constants";

/** Run `worker` over `items` with at most `limit` in flight; preserves order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane);
  await Promise.all(lanes);
  return results;
}

const BINARY_SNIFF_BYTES = 8 * 1024;

export function looksBinary(buffer: Buffer): boolean {
  const end = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < end; index++) if (buffer[index] === 0) return true;
  return false;
}

/** `.env`, `.env.local`, `config/.env.production` ... contents are never read. */
export function isEnvFile(path: string): boolean {
  const base = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  return base === ".env" || base.startsWith(".env.") || base.startsWith(".env-") || base.startsWith(".env_");
}

export function decodeText(buffer: Buffer): string | null {
  if (buffer.length > MAX_ANALYZED_FILE_BYTES || looksBinary(buffer)) return null;
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export interface TextRead {
  /** Byte size, or undefined when the file does not exist or cannot be stat'ed. */
  size?: number;
  content: string | null;
  missing: boolean;
}

/** Stat a file and, when `wantContent`, read it as UTF-8 unless binary, oversized or an env file. */
export async function readTextFile(absolutePath: string, wantContent: boolean): Promise<TextRead> {
  let size: number;
  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) return { content: null, missing: true };
    size = info.size;
  } catch {
    return { content: null, missing: true };
  }
  if (!wantContent || size > MAX_ANALYZED_FILE_BYTES || isEnvFile(absolutePath)) return { size, content: null, missing: false };
  try {
    const handle = await open(absolutePath, "r");
    try {
      const buffer = await handle.readFile();
      return { size, content: decodeText(buffer), missing: false };
    } finally {
      await handle.close();
    }
  } catch {
    return { size, content: null, missing: false };
  }
}

/** Keep the last `maxBytes` of a growing output capture. */
export function tailBytes(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= maxBytes) return text;
  return `…${buffer.subarray(buffer.length - maxBytes).toString("utf8").replace(/^�+/, "")}`;
}

export function slugify(value: string, fallback: string, maxLength = 48): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
  return slug || fallback;
}

/** Compact UTC timestamp safe for file names: 20261121T101500Z. */
export function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
