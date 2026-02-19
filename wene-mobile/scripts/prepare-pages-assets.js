/**
 * Cloudflare Pages deploy workaround:
 * `dist/assets/node_modules/**` can be omitted by deploy tooling.
 * Move/copy those assets to `dist/assets/vendor/**` and rewrite web bundle paths.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const sourceRoot = path.join(assetsDir, 'node_modules');
const targetRoot = path.join(assetsDir, 'vendor');
const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');

const SEARCH = '/assets/node_modules/';
const REPLACE = '/assets/vendor/';

function fail(msg) {
  console.error(`[prepare-pages-assets] ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fail(`dist directory not found. Run web export first.`);
}

if (!fs.existsSync(sourceRoot)) {
  console.log(`[prepare-pages-assets] skip: ${sourceRoot} not found`);
  process.exit(0);
}

if (!fs.existsSync(jsDir)) {
  fail(`JS bundle directory not found: ${jsDir}`);
}

fs.rmSync(targetRoot, { recursive: true, force: true });
fs.cpSync(sourceRoot, targetRoot, { recursive: true });

const jsFiles = fs
  .readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(jsDir, name));

if (jsFiles.length === 0) {
  fail(`No JS bundle files found in ${jsDir}`);
}

let patchedFiles = 0;
let replacementCount = 0;

for (const filePath of jsFiles) {
  const before = fs.readFileSync(filePath, 'utf8');
  const count = before.split(SEARCH).length - 1;
  if (count <= 0) continue;

  const after = before.split(SEARCH).join(REPLACE);
  fs.writeFileSync(filePath, after, 'utf8');

  patchedFiles += 1;
  replacementCount += count;
}

if (replacementCount === 0) {
  fail(`No "${SEARCH}" references found in JS bundles.`);
}

fs.rmSync(sourceRoot, { recursive: true, force: true });

console.log(
  `[prepare-pages-assets] patched ${patchedFiles} JS file(s), replaced ${replacementCount} reference(s).`
);
console.log(`[prepare-pages-assets] moved assets from ${sourceRoot} to ${targetRoot}.`);
