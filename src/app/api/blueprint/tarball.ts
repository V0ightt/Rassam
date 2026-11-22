// Reads the files the engine needs from a GitHub repository archive
// (.tar.gz). One request replaces one request per file, which keeps a
// repository of a few hundred files inside GitHub's API quota. The archive is
// parsed, never extracted to disk, and nothing in it is executed.

import { gunzipSync } from "node:zlib";

const BLOCK = 512;
/** Hard ceiling on the decompressed archive held in memory. */
export const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;

function readString(block: Uint8Array, start: number, length: number): string {
  let end = start;
  while (end < start + length && block[end] !== 0) end += 1;
  return Buffer.from(block.buffer, block.byteOffset + start, end - start).toString("utf8");
}

function readOctal(block: Uint8Array, start: number, length: number): number {
  const text = readString(block, start, length).trim();
  return text ? Number.parseInt(text, 8) : 0;
}

/** `25 path=some/long/name\n` records of a pax extended header. */
function paxPath(data: Uint8Array): string | null {
  const text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  let offset = 0;
  let path: string | null = null;
  while (offset < text.length) {
    const space = text.indexOf(" ", offset);
    if (space < 0) break;
    const length = Number.parseInt(text.slice(offset, space), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = text.slice(space + 1, offset + length - 1);
    const equals = record.indexOf("=");
    if (equals > 0 && record.slice(0, equals) === "path") path = record.slice(equals + 1);
    offset += length;
  }
  return path;
}

function decodeText(data: Uint8Array): string | null {
  const probe = data.subarray(0, 8192);
  if (probe.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

/**
 * Text contents of the wanted repository paths. GitHub archives nest every
 * entry under one top-level directory, which is stripped. Files larger than
 * `maxFileBytes`, binary files and non-regular entries are skipped.
 */
export function readArchiveFiles(
  archive: Uint8Array,
  wanted: ReadonlySet<string>,
  maxFileBytes: number,
): Map<string, string> {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_ARCHIVE_BYTES });
  const contents = new Map<string, string>();
  let offset = 0;
  let overridePath: string | null = null;

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) break;
    const data = tar.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      overridePath = paxPath(data);
      continue;
    }
    if (type === "L") {
      overridePath = readString(data, 0, data.length);
      continue;
    }
    if (type === "g") continue;

    const prefix = readString(header, 345, 155);
    const name = readString(header, 0, 100);
    const fullPath: string = overridePath ?? (prefix ? `${prefix}/${name}` : name);
    overridePath = null;
    if (type !== "0") continue;

    const slash = fullPath.indexOf("/");
    if (slash < 0) continue;
    const repoPath = fullPath.slice(slash + 1);
    if (!wanted.has(repoPath) || size > maxFileBytes) continue;
    const text = decodeText(data);
    if (text !== null) contents.set(repoPath, text);
  }
  return contents;
}
