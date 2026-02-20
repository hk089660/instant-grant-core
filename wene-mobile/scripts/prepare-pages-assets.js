/**
 * Cloudflare Pages deploy workaround:
 * `dist/assets/node_modules/**` can be omitted by deploy tooling.
 * Move/copy those assets to `dist/assets/vendor/**` and rewrite web bundle paths.
 *
 * Also flatten icon fonts to `dist/fonts/*.ttf` so webfont URLs are short and
 * stable on Cloudflare Pages.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const sourceRoot = path.join(assetsDir, 'node_modules');
const targetRoot = path.join(assetsDir, 'vendor');
const fontsDir = path.join(distDir, 'fonts');
const vectorIconFontsDir = path.join(
  targetRoot,
  '@expo',
  'vector-icons',
  'build',
  'vendor',
  'react-native-vector-icons',
  'Fonts'
);
const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');

const SEARCH = '/assets/node_modules/';
const REPLACE = '/assets/vendor/';
const FONT_REPLACE = '/fonts/';
const FONT_SEARCH_PATTERNS = [
  '/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/',
  '/assets/vendor/expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/',
  'expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/',
  '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/',
];

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

if (fs.existsSync(vectorIconFontsDir)) {
  fs.rmSync(fontsDir, { recursive: true, force: true });
  fs.mkdirSync(fontsDir, { recursive: true });
  const fontFiles = fs
    .readdirSync(vectorIconFontsDir)
    .filter((name) => name.toLowerCase().endsWith('.ttf'));
  for (const fileName of fontFiles) {
    const from = path.join(vectorIconFontsDir, fileName);
    const to = path.join(fontsDir, fileName);
    fs.copyFileSync(from, to);
  }
  console.log(`[prepare-pages-assets] copied ${fontFiles.length} font file(s) to ${fontsDir}.`);
} else {
  console.log(`[prepare-pages-assets] skip font flatten: ${vectorIconFontsDir} not found`);
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
let fontReplacementCount = 0;

for (const filePath of jsFiles) {
  const before = fs.readFileSync(filePath, 'utf8');
  const assetRefs = before.split(SEARCH).length - 1;
  const afterAssets = assetRefs > 0 ? before.split(SEARCH).join(REPLACE) : before;
  let afterFonts = afterAssets;
  let fontRefs = 0;
  for (const fontSearch of FONT_SEARCH_PATTERNS) {
    const refs = afterFonts.split(fontSearch).length - 1;
    if (refs > 0) {
      afterFonts = afterFonts.split(fontSearch).join(FONT_REPLACE);
      fontRefs += refs;
    }
  }
  if (before === afterFonts) continue;

  fs.writeFileSync(filePath, afterFonts, 'utf8');

  patchedFiles += 1;
  assetReplacementCount += Math.max(0, assetRefs);
  fontReplacementCount += Math.max(0, fontRefs);
}

const leftoverNodeModuleRefs = jsFiles.reduce((total, filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return total + (content.split(SEARCH).length - 1);
}, 0);

const leftoverFontRefs = jsFiles.reduce((total, filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const refs = FONT_SEARCH_PATTERNS.reduce((sum, pattern) => sum + (content.split(pattern).length - 1), 0);
  return total + refs;
}, 0);

if (leftoverNodeModuleRefs > 0) {
  fail(`"${SEARCH}" references still remain in JS bundles: ${leftoverNodeModuleRefs}`);
}
if (leftoverFontRefs > 0) {
  fail(`vector icon font references still remain in JS bundles: ${leftoverFontRefs}`);
}

console.log(
  `[prepare-pages-assets] patched ${patchedFiles} JS file(s), replaced ${assetReplacementCount} asset reference(s), ${fontReplacementCount} font reference(s).`
);
console.log(`[prepare-pages-assets] finalized assets under ${targetRoot}.`);
