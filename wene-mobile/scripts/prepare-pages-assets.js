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

if (!fs.existsSync(jsDir)) {
  fail(`JS bundle directory not found: ${jsDir}`);
}

if (fs.existsSync(sourceRoot)) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.cpSync(sourceRoot, targetRoot, { recursive: true });
  fs.rmSync(sourceRoot, { recursive: true, force: true });
} else {
  console.log(`[prepare-pages-assets] skip move: ${sourceRoot} not found`);
}

const jsFiles = fs
  .readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(jsDir, name));

if (jsFiles.length === 0) {
  fail(`No JS bundle files found in ${jsDir}`);
}

let patchedFiles = 0;
let assetReplacementCount = 0;

for (const filePath of jsFiles) {
  const before = fs.readFileSync(filePath, 'utf8');
  const assetRefs = before.split(SEARCH).length - 1;
  const afterAssets = assetRefs > 0 ? before.split(SEARCH).join(REPLACE) : before;

  if (before === afterAssets) continue;

  fs.writeFileSync(filePath, afterAssets, 'utf8');

  patchedFiles += 1;
  assetReplacementCount += Math.max(0, assetRefs);
}

const leftoverNodeModuleRefs = jsFiles.reduce((total, filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return total + (content.split(SEARCH).length - 1);
}, 0);

if (leftoverNodeModuleRefs > 0) {
  fail(`"${SEARCH}" references still remain in JS bundles: ${leftoverNodeModuleRefs}`);
}

console.log(
  `[prepare-pages-assets] patched ${patchedFiles} JS file(s), replaced ${assetReplacementCount} asset reference(s).`
);
console.log(`[prepare-pages-assets] finalized assets under ${targetRoot}.`);
