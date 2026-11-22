import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgetBytes = 300 * 1024;
const htmlPath = '.next/server/app/index.html';
let html;
try {
  html = readFileSync(htmlPath, 'utf8');
} catch {
  throw new Error(`Missing ${htmlPath}. Run npm run build before the bundle check.`);
}

const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)]
  .map((match) => match[1])
  .filter((value, index, values) => values.indexOf(value) === index);

if (scriptPaths.length === 0) throw new Error('No initial home-route JavaScript was found.');

const entries = scriptPaths.map((publicPath) => {
  const diskPath = `.next/${publicPath.replace('/_next/', '')}`;
  const compressedBytes = gzipSync(readFileSync(diskPath), { level: 9 }).byteLength;
  return { publicPath, compressedBytes };
});
const totalBytes = entries.reduce((total, entry) => total + entry.compressedBytes, 0);

for (const entry of entries) {
  process.stdout.write(`${(entry.compressedBytes / 1024).toFixed(1).padStart(7)} KiB  ${entry.publicPath}\n`);
}
process.stdout.write(`${(totalBytes / 1024).toFixed(1)} KiB compressed initial home JavaScript (budget: 300.0 KiB)\n`);

if (totalBytes > budgetBytes) {
  process.exitCode = 1;
  throw new Error(`Initial home JavaScript exceeds the budget by ${((totalBytes - budgetBytes) / 1024).toFixed(1)} KiB.`);
}

