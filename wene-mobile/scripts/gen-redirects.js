/**
 * Generate Cloudflare Pages _redirects:
 * - /api/* and /v1/* proxy to Workers
 * - static files bypass SPA fallback (prevents image/font requests from being rewritten to index.html)
 * Required env:
 *   EXPO_PUBLIC_SCHOOL_API_BASE_URL or EXPO_PUBLIC_API_BASE_URL
 */
const fs = require("fs");
const path = require("path");

const base =
  process.env.EXPO_PUBLIC_SCHOOL_API_BASE_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "";

const distDir = path.join(process.cwd(), "dist");
const redirectsPath = path.join(distDir, "_redirects");

function fail(msg) {
  console.error(`[gen-redirects] ERROR: ${msg}`);
  process.exit(1);
}

if (!base) {
  fail(
    `API base URL is required. Set EXPO_PUBLIC_API_BASE_URL or EXPO_PUBLIC_SCHOOL_API_BASE_URL.
Example: https://we-ne-school-api.<subdomain>.workers.dev
Without this, claim POST requests hit Pages and return 405 Method Not Allowed.`
  );
}

if (!fs.existsSync(distDir)) {
  fail(`dist directory not found. Run "npx expo export -p web" first.`);
}

const staticPassthroughRules = [
  `/_expo/*      /_expo/:splat      200`,
  `/assets/*     /assets/:splat     200`,
  `/fonts/*      /fonts/:splat      200`,
  `/favicon.ico  /favicon.ico       200`,
  `/metadata.json /metadata.json    200`,
  `/version.txt  /version.txt       200`,
];

const redirectRules = [
  `/api/*  ${base}/api/:splat  200`,
  `/v1/*   ${base}/v1/:splat   200`,
  `/metadata/*   ${base}/metadata/:splat   200`,
  ...staticPassthroughRules,
  `/*      /index.html         200`,
];

const lines = redirectRules.join("\n") + "\n";

fs.writeFileSync(redirectsPath, lines, "utf8");
console.log(`[gen-redirects] wrote ${redirectsPath}\n${lines}`);
