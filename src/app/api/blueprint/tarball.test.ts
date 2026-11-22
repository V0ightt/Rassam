import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { readArchiveFiles } from "./tarball";

const BLOCK = 512;

function header(name: string, size: number, type = "0", prefix = ""): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, 100, "utf8");
  block.write(size.toString(8).padStart(11, "0"), 124, 12, "utf8");
  block.write(type, 156, 1, "utf8");
  block.write("ustar", 257, 6, "utf8");
  block.write(prefix, 345, 155, "utf8");
  return block;
}

function entry(name: string, body: Buffer | string, type = "0", prefix = ""): Buffer {
  const data = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  const padded = Buffer.alloc(Math.ceil(data.length / BLOCK) * BLOCK);
  data.copy(padded);
  return Buffer.concat([header(name, data.length, type, prefix), padded]);
}

function pax(path: string): Buffer {
  const body = ` path=${path}\n`;
  let length = body.length + 1;
  while (`${length}${body}`.length !== length) length = `${length}${body}`.length;
  return entry("PaxHeader", `${length}${body}`, "x");
}

function archive(...entries: Buffer[]): Uint8Array {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]));
}

describe("readArchiveFiles", () => {
  const longPath = `root-abc/${"deep/".repeat(30)}file.ts`;
  const tar = archive(
    entry("pax_global_header", "52 comment=0000000000000000000000000000000000000000\n", "g"),
    entry("root-abc/", "", "5"),
    entry("root-abc/package.json", '{"name":"demo"}'),
    entry("index.ts", "export const a = 1;\n", "0", "root-abc/src"),
    entry("root-abc/logo.png", Buffer.from([0x89, 0x50, 0x00, 0x01])),
    entry("root-abc/big.ts", "x".repeat(4000)),
    entry("root-abc/link.ts", "", "2"),
    pax(longPath),
    entry("truncated-name", "export const deep = true;\n"),
    entry("root-abc/skipped.ts", "not wanted"),
  );
  const wanted = new Set(["package.json", "src/index.ts", "logo.png", "big.ts", "link.ts", `${"deep/".repeat(30)}file.ts`]);

  it("returns wanted text files with the top-level directory stripped", () => {
    const files = readArchiveFiles(tar, wanted, 1024);
    expect(files.get("package.json")).toBe('{"name":"demo"}');
    expect(files.get("src/index.ts")).toBe("export const a = 1;\n");
    expect(files.get(`${"deep/".repeat(30)}file.ts`)).toBe("export const deep = true;\n");
  });

  it("skips binary, oversized, non-regular and unwanted entries", () => {
    const files = readArchiveFiles(tar, wanted, 1024);
    expect(files.has("logo.png")).toBe(false);
    expect(files.has("big.ts")).toBe(false);
    expect(files.has("link.ts")).toBe(false);
    expect(files.has("skipped.ts")).toBe(false);
    expect(files.size).toBe(3);
  });

  it("tolerates a truncated archive", () => {
    const raw = Buffer.concat([entry("root/a.ts", "ok"), header("root/b.ts", 9999)]);
    expect([...readArchiveFiles(gzipSync(raw), new Set(["a.ts", "b.ts"]), 1024).keys()]).toEqual(["a.ts"]);
  });
});
