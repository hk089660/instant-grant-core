#!/usr/bin/env bash
set -uE -o pipefail

PREFIX='[verify-pages-build]'
log() { echo "${PREFIX} $*"; }
fail() { log "FAIL: $*"; exit 1; }

if [ $# -lt 1 ]; then
  log "Usage: $0 https://your-pages-domain.example.com"
  fail "BASE_URL is required"
fi

PAGES_BASE_URL_RAW="$1"
PAGES_BASE_URL="${PAGES_BASE_URL_RAW%/}"
log "BASE_URL=${PAGES_BASE_URL}"

############################################
# Step 1: ローカル dist の index-*.js を取得
############################################
LOCAL_JS_DIR="dist/_expo/static/js/web"
if [ ! -d "$LOCAL_JS_DIR" ]; then
  log "LOCAL_JS_DIR=${LOCAL_JS_DIR}"
  fail "Local directory not found. Run 'npm run export:web' first."
fi

LOCAL_INDEX_JS="$(ls -t "${LOCAL_JS_DIR}"/index-*.js 2>/dev/null | head -n 1 || true)"
if [ -z "$LOCAL_INDEX_JS" ]; then
  fail "Local file not found: ${LOCAL_JS_DIR}/index-*.js (Expo web export may have failed)."
fi

LOCAL_JS_HASH="$(shasum -a 256 "${LOCAL_INDEX_JS}" | awk '{print $1}')"
log "LOCAL_JS=${LOCAL_INDEX_JS}"
log "LOCAL_SHA256=${LOCAL_JS_HASH}"

#########################################################
# Step 2: 本番 /admin HTML から index-*.js を抽出して比較
#########################################################
TMP_HTML="$(mktemp)"
if ! curl -sSL -H 'Accept: text/html' "${PAGES_BASE_URL}/admin" -o "${TMP_HTML}"; then
  rm -f "${TMP_HTML}"
  fail "Could not fetch ${PAGES_BASE_URL}/admin (DNS or routing issue?)"
fi

REMOTE_SCRIPT_PATH="$(grep -Eo '/_expo/static/js/web/index-[^"]+\.js' "${TMP_HTML}" | head -n 1 || true)"
rm -f "${TMP_HTML}"

if [ -z "$REMOTE_SCRIPT_PATH" ]; then
  fail "Could not find /_expo/static/js/web/index-*.js in /admin HTML (production may be serving a different build)."
fi

REMOTE_JS_URL="${PAGES_BASE_URL}${REMOTE_SCRIPT_PATH}"
REMOTE_JS_HASH="$(curl -sSL "${REMOTE_JS_URL}" | shasum -a 256 | awk '{print $1}')"
if [ -z "$REMOTE_JS_HASH" ]; then
  fail "Could not download remote JS bundle: ${REMOTE_JS_URL}"
fi

log "REMOTE_JS=${REMOTE_JS_URL}"
log "REMOTE_SHA256=${REMOTE_JS_HASH}"

if [ "$LOCAL_JS_HASH" != "$REMOTE_JS_HASH" ]; then
  fail "SHA256 mismatch between local and production JS bundle (production is serving a different artifact)."
fi

log "OK: JS build matches (local dist == production JS bundle)."

############################################
# Step 3: アイコンフォント（Ionicons）が配信されることを確認
############################################
IONICONS_FONT_PATH="$(grep -Eo '/fonts/Ionicons\.[^"]+\.ttf' "${LOCAL_INDEX_JS}" | head -n 1 || true)"
if [ -z "${IONICONS_FONT_PATH}" ]; then
  IONICONS_FONT_PATH="$(grep -Eo '/fonts/[^"]+\.ttf' "${LOCAL_INDEX_JS}" | head -n 1 || true)"
fi

if [ -z "${IONICONS_FONT_PATH}" ]; then
  fail "Could not find /fonts/*.ttf reference in local JS bundle."
fi

IONICONS_FONT_URL="${PAGES_BASE_URL}${IONICONS_FONT_PATH}"
FONT_HEADERS="$(curl -sSIL "${IONICONS_FONT_URL}" 2>/dev/null || true)"
if [ -z "$FONT_HEADERS" ]; then
  fail "Could not fetch icon font: ${IONICONS_FONT_URL}"
fi

FONT_STATUS_CODE="$(printf '%s\n' "$FONT_HEADERS" | awk '/^HTTP/{code=$2} END{print code}')"
FONT_CT_RAW="$(printf '%s\n' "$FONT_HEADERS" | grep -i '^content-type:' | tail -n 1 | sed -E 's/^content-type:\s*//I' | tr -d '\r')"

log "CHECK: GET ${IONICONS_FONT_PATH} status=${FONT_STATUS_CODE} content-type=${FONT_CT_RAW}"

if [ "${FONT_STATUS_CODE}" != "200" ]; then
  fail "Expected HTTP 200 from ${IONICONS_FONT_PATH} but got ${FONT_STATUS_CODE}."
fi

if printf '%s\n' "$FONT_CT_RAW" | grep -Eqi 'text/html'; then
  fail "${IONICONS_FONT_PATH} returned text/html (SPA rewrite likely swallowed font file)."
fi

log "OK: icon font is reachable (${IONICONS_FONT_PATH})."

############################################
# Step 4: GET /v1/school/events の到達先確認
############################################
EVENTS_URL="${PAGES_BASE_URL}/v1/school/events"
EVENTS_HEADERS="$(curl -sSIL "${EVENTS_URL}" 2>/dev/null || true)"
if [ -z "$EVENTS_HEADERS" ]; then
  fail "Could not reach ${EVENTS_URL}"
fi

STATUS_LINE="$(printf '%s\n' "$EVENTS_HEADERS" | head -n 1 | tr -d '\r')"
EVENTS_STATUS_CODE="$(printf '%s\n' "$STATUS_LINE" | awk '{print $2}')"
EVENTS_CT_RAW="$(printf '%s\n' "$EVENTS_HEADERS" | grep -i '^content-type:' | head -n 1 | sed -E 's/^content-type:\s*//I' | tr -d '\r')"

log "CHECK: GET /v1/school/events status=${EVENTS_STATUS_CODE} content-type=${EVENTS_CT_RAW}"

if [ "${EVENTS_STATUS_CODE}" != "200" ]; then
  fail "Expected HTTP 200 from /v1/school/events but got ${EVENTS_STATUS_CODE}."
fi

if printf '%s\n' "$EVENTS_CT_RAW" | grep -qi 'application/json'; then
  log "OK: /v1/school/events returns application/json (likely hitting Workers API)."
else
  fail "/v1/school/events does not return application/json (likely hitting Pages/HTML)."
fi

############################################
# Step 5: POST /api/users/register の挙動確認
############################################
REGISTER_URL="${PAGES_BASE_URL}/api/users/register"
REGISTER_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "${REGISTER_URL}" 2>/dev/null || echo "000")"

log "CHECK: POST /api/users/register status=${REGISTER_STATUS}"

if [ "$REGISTER_STATUS" = "000" ]; then
  fail "Could not reach /api/users/register (network or routing error)."
elif [ "$REGISTER_STATUS" = "405" ]; then
  fail "POST /api/users/register returned 405 (likely hitting Cloudflare Pages directly)."
fi

log "OK: /api/users/register is not 405 (current status=${REGISTER_STATUS})."
log "OK: proxy works."
exit 0
