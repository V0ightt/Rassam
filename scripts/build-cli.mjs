// Bundles the Rassam CLI (check gate, MCP server, authoring commands) into a
// single dependency-free ESM file that the GitHub Action and `npx rassam` run:
//
//   src/cli/index.ts  →  action/dist/rassam.mjs
//
// The bundle is committed so the action works without `npm install`. It is
// deliberately not minified: people audit what a gate with repository access
// executes. CI rebuilds it and fails when the committed copy is stale.

import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = 'src/cli/index.ts';
const outfile = 'action/dist/rassam.mjs';
const entryPath = path.join(root, entry);
const outPath = path.join(root, outfile);

if (!existsSync(entryPath)) {
  process.stderr.write(
    `build-cli: entry point ${entry} does not exist yet.\n` +
      `The CLI source must be present before the bundle can be built; nothing was written to ${outfile}.\n`,
  );
  process.exit(1);
}

// esbuild keeps an entry file's own hashbang as the first line of the output,
// ahead of the banner. Only add ours when the entry has none, so the bundle
// never ends up with two.
const entryHasHashbang = readFileSync(entryPath, 'utf8').startsWith('#!');

// Bundled CommonJS dependencies call `require` for Node built-ins. ESM has no
// `require`, so provide one. The import is aliased to avoid colliding with a
// `createRequire` import inside the bundled code.
const banner = [
  ...(entryHasHashbang ? [] : ['#!/usr/bin/env node']),
  'import { createRequire as __rassamCreateRequire } from "node:module"; const require = __rassamCreateRequire(import.meta.url);',
].join('\n');

mkdirSync(path.dirname(outPath), { recursive: true });

let result;
try {
  result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    minify: false,
    sourcemap: false,
    legalComments: 'inline',
    charset: 'utf8',
    alias: { '@': './src' },
    banner: { js: banner },
    metafile: true,
    logLevel: 'warning',
  });
} catch (error) {
  // esbuild has already printed the diagnostics.
  process.stderr.write(`build-cli: bundling ${entry} failed${error instanceof Error && error.errors ? ` with ${error.errors.length} error(s)` : ''}.\n`);
  process.exit(1);
}

try {
  chmodSync(outPath, 0o755);
} catch {
  // Windows has no executable bit; git records the mode separately.
}

const output = result.metafile.outputs[outfile] ?? Object.values(result.metafile.outputs)[0];
const inputCount = Object.keys(result.metafile.inputs).length;
const kib = (output.bytes / 1024).toFixed(1);
process.stdout.write(`${outfile}  ${kib} KiB  (${inputCount} modules bundled, node20, esm, unminified)\n`);
