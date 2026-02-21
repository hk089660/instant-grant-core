#!/usr/bin/env node

const WORKER_BASE_URL = (process.env.WORKER_BASE_URL || 'https://instant-grant-core.haruki-kira3.workers.dev').replace(/\/$/, '');
const PAGES_BASE_URL = (process.env.PAGES_BASE_URL || 'https://instant-grant-core.pages.dev').replace(/\/$/, '');
const MASTER_TOKEN = (process.env.MASTER_TOKEN || '').trim();
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.FETCH_TIMEOUT_MS || '8000', 10);

const results = [];

function addResult(ok, name, detail) {
  results.push({ ok, name, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
}

async function fetchJson(url, expectedStatus = 200) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (res.status !== expectedStatus) {
    throw new Error(`unexpected status ${res.status} (expected ${expectedStatus})`);
  }
  if (!json || typeof json !== 'object') {
    throw new Error('response is not valid JSON');
  }
  return json;
}

async function fetchJsonWithAuth(url, token, expectedStatus = 200) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (res.status !== expectedStatus) {
    throw new Error(`unexpected status ${res.status} (expected ${expectedStatus})`);
  }
  if (!json || typeof json !== 'object') {
    throw new Error('response is not valid JSON');
  }
  return json;
}

async function main() {
  console.log('=== Asuka/We-ne Production Readiness Check ===');
  console.log(`WORKER_BASE_URL=${WORKER_BASE_URL}`);
  console.log(`PAGES_BASE_URL=${PAGES_BASE_URL}`);
  console.log(`FETCH_TIMEOUT_MS=${FETCH_TIMEOUT_MS}`);

  try {
    const workerRoot = await fetchJson(`${WORKER_BASE_URL}/`);
    addResult(
      workerRoot.status === 'ok' && workerRoot.service === 'instant-grant-core',
      'Worker root',
      JSON.stringify(workerRoot)
    );
  } catch (err) {
    addResult(false, 'Worker root', err instanceof Error ? err.message : String(err));
  }

  try {
    const pop = await fetchJson(`${WORKER_BASE_URL}/v1/school/pop-status`);
    const ok = pop.enforceOnchainPop === true && pop.signerConfigured === true;
    addResult(ok, 'Worker PoP status', JSON.stringify(pop));
  } catch (err) {
    addResult(false, 'Worker PoP status', err instanceof Error ? err.message : String(err));
  }

  try {
    const audit = await fetchJson(`${WORKER_BASE_URL}/v1/school/audit-status`);
    const ok = audit.mode === 'required' && audit.operationalReady === true && audit.primaryImmutableSinkConfigured === true;
    addResult(ok, 'Worker audit status', JSON.stringify(audit));
  } catch (err) {
    addResult(false, 'Worker audit status', err instanceof Error ? err.message : String(err));
  }

  try {
    const runtime = await fetchJson(`${WORKER_BASE_URL}/v1/school/runtime-status`);
    addResult(runtime.ready === true, 'Worker runtime status', JSON.stringify(runtime));
  } catch (err) {
    addResult(false, 'Worker runtime status', err instanceof Error ? err.message : String(err));
  }

  try {
    const pagesRuntime = await fetchJson(`${PAGES_BASE_URL}/v1/school/runtime-status`);
    addResult(pagesRuntime.ready === true, 'Pages runtime status', JSON.stringify(pagesRuntime));
  } catch (err) {
    addResult(false, 'Pages runtime status', err instanceof Error ? err.message : String(err));
  }

  if (MASTER_TOKEN) {
    try {
      const integrity = await fetchJsonWithAuth(`${WORKER_BASE_URL}/api/master/audit-integrity?limit=50`, MASTER_TOKEN);
      addResult(integrity.ok === true, 'Audit integrity (master)', JSON.stringify(integrity));
    } catch (err) {
      addResult(false, 'Audit integrity (master)', err instanceof Error ? err.message : String(err));
    }
  } else {
    addResult(true, 'Audit integrity (master)', 'skipped (set MASTER_TOKEN to enable)');
  }

  const failed = results.some((r) => !r.ok);
  console.log('=== Summary ===');
  console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  if (failed) {
    console.error('Production readiness check failed.');
    process.exit(1);
  }
  console.log('Production readiness check passed.');
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
