// Stages the publishable npm package for the Rassam CLI and MCP server:
//
//   packages/rassam/package.json + README.md   (the manifest and npm page)
//   action/dist/rassam.mjs  →  rassam.mjs      (the committed, self-contained bundle)
//   schema/*.schema.json                        (the blueprint JSON Schema)
//   LICENSE, NOTICE                             (from the repository root)
//
// into .pack/rassam/ (gitignored). It refuses to stage a package that would not
// match what the repository says it is: a missing or stale bundle, a bundle
// that imports anything but Node built-ins, or a manifest whose name, version
// or licence disagrees with src/blueprint/constants.ts and the root manifest.
//
//   node scripts/pack-cli.mjs                 stage only
//   node scripts/pack-cli.mjs --pack <dir>    stage, then `npm pack` into <dir>
//
// Nothing is published. The release workflow publishes the tarball this makes.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'packages', 'rassam');
const stageDir = path.join(root, '.pack', 'rassam');
const bundlePath = path.join(root, 'action', 'dist', 'rassam.mjs');
const constantsPath = path.join(root, 'src', 'blueprint', 'constants.ts');
const schemaDir = path.join(root, 'schema');
const BIN_FILE = 'rassam.mjs';
const HASHBANG = '#!/usr/bin/env node';

function fail(problems) {
  const list = Array.isArray(problems) ? problems : [problems];
  process.stderr.write(`pack-cli: refusing to stage the package:\n${list.map((problem) => `  - ${problem}`).join('\n')}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { pack: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--pack') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) fail('--pack needs a directory: node scripts/pack-cli.mjs --pack <dir>');
      options.pack = value;
    } else if (arg.startsWith('--pack=')) {
      options.pack = arg.slice('--pack='.length);
      if (!options.pack) fail('--pack needs a directory: node scripts/pack-cli.mjs --pack <dir>');
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: node scripts/pack-cli.mjs [--pack <dir>]\n');
      process.exit(0);
    } else {
      fail(`unknown argument "${arg}". Usage: node scripts/pack-cli.mjs [--pack <dir>]`);
    }
  }
  return options;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path.relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Reads `export const NAME = "value"` from src/blueprint/constants.ts without importing TypeScript. */
function readConstant(source, name) {
  const match = new RegExp(`export\\s+const\\s+${name}\\s*(?::\\s*[\\w.]+\\s*)?=\\s*(["'\`])([^"'\`]+)\\1`).exec(source);
  return match ? match[2] : null;
}

/** Every module specifier the bundle loads: top-level imports, dynamic imports with a literal, require calls. */
function bundleSpecifiers(code) {
  const patterns = [
    /^(?:import|export)\s[^\n;]*?\sfrom\s*["']([^"']+)["']/gm,
    /^\}\s*from\s*["']([^"']+)["']/gm,
    /^import\s*["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const found = new Set();
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) found.add(match[1]);
  return [...found].sort();
}

function isBuiltin(specifier) {
  return specifier.startsWith('node:') || builtinModules.includes(specifier);
}

function copy(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), relative));
    else out.push(relative);
  }
  return out.sort();
}

/** How to run npm: the npm that runs this script when there is one, else the npm next to node. */
function npmCommand(args) {
  const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  for (const candidate of candidates) {
    if (candidate && /npm-cli\.c?js$/.test(candidate) && existsSync(candidate)) {
      return { file: process.execPath, args: [candidate, ...args], shell: false };
    }
  }
  // Fall back to npm on PATH. Windows can only start npm.cmd through a shell.
  const windows = process.platform === 'win32';
  return { file: 'npm', args: windows ? args.map((arg) => `"${arg}"`) : args, shell: windows };
}

const options = parseArgs(process.argv.slice(2));
const problems = [];

// 1. The bundle: present, executable as a bin, current, dependency-free.
if (!existsSync(bundlePath)) fail('action/dist/rassam.mjs is missing. Run npm run build:cli first.');
const bundle = readFileSync(bundlePath, 'utf8');
if (!/^#!\/usr\/bin\/env node\r?\n/.test(bundle)) {
  problems.push(`action/dist/rassam.mjs does not start with "${HASHBANG}", so it cannot run as the rassam bin. Rebuild it with npm run build:cli.`);
}
const bareImports = bundleSpecifiers(bundle).filter((specifier) => !isBuiltin(specifier));
if (bareImports.length > 0) {
  problems.push(`the bundle loads modules that are not Node built-ins (${bareImports.join(', ')}); the package ships no dependencies, so bundle them instead.`);
}

// 2. The manifest agrees with the engine constants and the root manifest.
const constants = readFileSync(constantsPath, 'utf8');
const engineVersion = readConstant(constants, 'ENGINE_VERSION');
const packageName = readConstant(constants, 'PACKAGE_NAME');
if (!engineVersion) problems.push('ENGINE_VERSION not found in src/blueprint/constants.ts.');
if (!packageName) problems.push('PACKAGE_NAME not found in src/blueprint/constants.ts.');

const manifest = readJson(path.join(packageDir, 'package.json'));
const rootManifest = readJson(path.join(root, 'package.json'));

if (engineVersion && manifest.version !== engineVersion) {
  problems.push(`packages/rassam/package.json version is ${manifest.version}, but ENGINE_VERSION is ${engineVersion}.`);
}
if (engineVersion && !new RegExp(`\\bENGINE_VERSION\\d*\\s*=\\s*"${engineVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(bundle)) {
  problems.push(`the bundle does not carry ENGINE_VERSION ${engineVersion}: it is stale. Run npm run build:cli.`);
}
if (packageName && manifest.name !== packageName) {
  problems.push(`packages/rassam/package.json name is ${manifest.name}, but PACKAGE_NAME is ${packageName}.`);
}
if (!rootManifest.license) {
  problems.push('the root package.json has no license field to compare against.');
} else if (manifest.license !== rootManifest.license) {
  problems.push(`packages/rassam/package.json license is ${manifest.license}, but the root package.json says ${rootManifest.license}.`);
}
if (manifest.private) problems.push('packages/rassam/package.json is marked private.');
if (manifest.bin?.rassam !== BIN_FILE) problems.push(`packages/rassam/package.json bin.rassam must be "${BIN_FILE}".`);
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies']) {
  if (manifest[field] && Object.keys(manifest[field]).length > 0) {
    problems.push(`packages/rassam/package.json declares ${field}; the bundle is self-contained and the package must have none.`);
  }
}
for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) {
  if (manifest.scripts?.[script]) problems.push(`packages/rassam/package.json has a "${script}" script; the package must not run code on install or pack.`);
}

// 3. The MCP Registry entry describes this package.
const serverPath = path.join(packageDir, 'server.json');
if (existsSync(serverPath)) {
  const server = readJson(serverPath);
  if (server.name !== manifest.mcpName) problems.push(`server.json name ${server.name} differs from mcpName ${manifest.mcpName} in package.json.`);
  if (server.version !== manifest.version) problems.push(`server.json version ${server.version} differs from package.json version ${manifest.version}.`);
  for (const entry of server.packages ?? []) {
    if (entry.registryType !== 'npm') continue;
    if (entry.identifier !== manifest.name) problems.push(`server.json package identifier ${entry.identifier} differs from ${manifest.name}.`);
    if (entry.version !== manifest.version) problems.push(`server.json package version ${entry.version} differs from ${manifest.version}.`);
  }
}

// 4. The files that ship.
const licensePath = path.join(root, 'LICENSE');
if (!existsSync(licensePath)) problems.push('LICENSE is missing from the repository root.');
const readmePath = path.join(packageDir, 'README.md');
if (!existsSync(readmePath)) problems.push('packages/rassam/README.md is missing.');
const schemas = existsSync(schemaDir) ? readdirSync(schemaDir).filter((name) => name.endsWith('.schema.json')).sort() : [];
if (schemas.length === 0) problems.push('schema/ has no *.schema.json file. Run npm run blueprint:schema.');

if (problems.length > 0) fail(problems);

// Stage into a clean directory.
if (path.relative(root, stageDir).startsWith('..')) fail(`staging directory ${stageDir} is outside the repository.`);
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

copy(path.join(packageDir, 'package.json'), path.join(stageDir, 'package.json'));
copy(readmePath, path.join(stageDir, 'README.md'));
copy(bundlePath, path.join(stageDir, BIN_FILE));
copy(licensePath, path.join(stageDir, 'LICENSE'));
const noticePath = path.join(root, 'NOTICE');
if (existsSync(noticePath)) copy(noticePath, path.join(stageDir, 'NOTICE'));
for (const name of schemas) copy(path.join(schemaDir, name), path.join(stageDir, 'schema', name));

const staged = listFiles(stageDir);
const stagedBytes = staged.reduce((sum, file) => sum + statSync(path.join(stageDir, file)).size, 0);
process.stdout.write(
  `Staged ${manifest.name}@${manifest.version} in ${path.relative(root, stageDir).split(path.sep).join('/')}/ ` +
    `(${staged.length} files, ${(stagedBytes / 1024).toFixed(1)} KiB):\n${staged.map((file) => `  ${file}`).join('\n')}\n`,
);

if (options.pack) {
  const destination = path.resolve(process.cwd(), options.pack);
  mkdirSync(destination, { recursive: true });
  const npm = npmCommand(['pack', '--json', '--pack-destination', destination]);
  let output;
  try {
    output = execFileSync(npm.file, npm.args, { cwd: stageDir, encoding: 'utf8', shell: npm.shell, stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (error) {
    fail(`npm pack failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  let result;
  try {
    // npm may print lifecycle noise before the JSON; the JSON array is the last thing it writes.
    result = JSON.parse(output.slice(output.indexOf('[')))[0];
  } catch {
    fail(`could not read the output of npm pack:\n${output}`);
  }
  const packed = result.files.map((file) => file.path).sort();
  const missing = staged.filter((file) => !packed.includes(file));
  const extra = packed.filter((file) => !staged.includes(file));
  const tarball = path.join(destination, result.filename);
  if (missing.length > 0 || extra.length > 0) {
    rmSync(tarball, { force: true });
    fail([
      ...missing.map((file) => `staged file ${file} is not in the tarball; check "files" in packages/rassam/package.json.`),
      ...extra.map((file) => `the tarball contains ${file}, which was not staged.`),
    ]);
  }
  process.stdout.write(
    `Packed ${result.files.length} files, ${(result.size / 1024).toFixed(1)} KiB (unpacked ${(result.unpackedSize / 1024).toFixed(1)} KiB), ${result.integrity}\n` +
      `${tarball}\n`,
  );
}
