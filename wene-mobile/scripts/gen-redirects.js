/**
 * Generate Cloudflare Pages _redirects:
 * - API proxying is handled by Pages Functions (functions/[[path]].ts)
 * - keep redirects relative-only (Pages rejects external destination with status 200)
 * - static files bypass SPA fallback (prevents image/font requests from being rewritten to index.html)
 */
const fs = require("fs");
const path = require("path");

const distDir = path.join(process.cwd(), "dist");
const redirectsPath = path.join(distDir, "_redirects");

function fail(msg) {
  console.error(`[gen-redirects] ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fail(`dist directory not found. Run "npx expo export -p web" first.`);
}

const staticPassthroughRules = [
  `# API routes are handled by Cloudflare Pages Functions (functions/[[path]].ts).`,
  `# Keep _redirects relative-only to satisfy Pages validation.`,
  ``,
  `# Fallback for vector icon font paths referenced by some bundles.`,
  `/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*  /fonts/:splat  200`,
  `/assets/node_modules/expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*   /fonts/:splat  200`,
  `/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*                       /fonts/:splat  200`,
  `/expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*                        /fonts/:splat  200`,
  ``,
  `# Static asset passthrough`,
  `/favicon.ico    /favicon.ico     200`,
  `/metadata.json  /metadata.json   200`,
  `/version.txt    /version.txt     200`,
  `/_expo/*      /_expo/:splat      200`,
  `/assets/*     /assets/:splat     200`,
  `/fonts/*      /fonts/:splat      200`,
  ``,
  `# SPA fallback`,
];

const redirectRules = [
  ...staticPassthroughRules,
  `/*              /index.html      200`,
];

const lines = redirectRules.join("\n") + "\n";

fs.writeFileSync(redirectsPath, lines, "utf8");
console.log(`[gen-redirects] wrote ${redirectsPath}\n${lines}`);
