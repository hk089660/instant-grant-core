#!/usr/bin/env node

const WORKER_BASE_URL = (process.env.WORKER_BASE_URL || 'https://instant-grant-core.haruki-kira3.workers.dev').replace(/\/$/, '');
const PAGES_BASE_URL = (process.env.PAGES_BASE_URL || 'https://instant-grant-core.pages.dev').replace(/\/$/, '');
const MASTER_TOKEN = (process.env.MASTER_TOKEN || '').trim();
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.FETCH_TIMEOUT_MS || '8000', 10);
const SOLANA_RPC_URL = (process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com').trim();
const POP_CONFIG_PROGRAM_ID = (process.env.POP_CONFIG_PROGRAM_ID || 'GZcUoGHk8SfAArTKicL1jiRHZEQa3EuzgYcC2u4yWfSR').trim();
const POP_CONFIG_CHECK_ENABLED = parseBooleanEnv(process.env.POP_CONFIG_CHECK_ENABLED, true);
const POP_CONFIG_EVENT_STATES = parseCsvSet(process.env.POP_CONFIG_EVENT_STATES || 'published');
const POP_CONFIG_ACCOUNT_DATA_SIZE = 73;

const results = [];

function addResult(ok, name, detail) {
  results.push({ ok, name, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
}

function parseBooleanEnv(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function parseCsvSet(raw) {
  const out = new Set();
  for (const chunk of String(raw || '').split(',')) {
    const normalized = chunk.trim().toLowerCase();
    if (!normalized) continue;
    out.add(normalized);
  }
  return out;
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

async function fetchWithStatus(url, expectedStatus, options = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...options,
  });
  if (res.status !== expectedStatus) {
    throw new Error(`unexpected status ${res.status} (expected ${expectedStatus})`);
  }
  return res;
}

async function rpcCall(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new Error(`rpc http ${res.status}: ${text}`);
  }
  if (!body || typeof body !== 'object') {
    throw new Error('rpc response is not valid JSON');
  }
  if (body.error) {
    throw new Error(`rpc error: ${JSON.stringify(body.error)}`);
  }
  if (!('result' in body)) {
    throw new Error('rpc response has no result');
  }
  return body.result;
}

async function getProgramAccounts({ rpcUrl, programId, filters }) {
  const result = await rpcCall(rpcUrl, 'getProgramAccounts', [
    programId,
    {
      commitment: 'confirmed',
      encoding: 'base64',
      filters,
    },
  ]);
  return Array.isArray(result) ? result : [];
}

function collectOnchainAuthorityMap(events, targetStates) {
  const out = new Map();
  for (const event of events) {
    const eventId = typeof event?.id === 'string' ? event.id.trim() : '';
    const state = typeof event?.state === 'string' ? event.state.trim().toLowerCase() : '';
    const authority = typeof event?.solanaAuthority === 'string' ? event.solanaAuthority.trim() : '';
    const mint = typeof event?.solanaMint === 'string' ? event.solanaMint.trim() : '';
    const grantId = typeof event?.solanaGrantId === 'string' ? event.solanaGrantId.trim() : '';
    if (!eventId || !authority || !mint || !grantId) continue;
    if (targetStates.size > 0 && !targetStates.has(state)) continue;

    const entry = out.get(authority) || [];
    entry.push(eventId);
    out.set(authority, entry);
  }
  return out;
}

async function verifyAuthorityPopConfig({ rpcUrl, programId, authority, signerPubkey }) {
  const exactMatches = await getProgramAccounts({
    rpcUrl,
    programId,
    filters: [
      { dataSize: POP_CONFIG_ACCOUNT_DATA_SIZE },
      { memcmp: { offset: 8, bytes: authority } },
      { memcmp: { offset: 40, bytes: signerPubkey } },
    ],
  });

  if (exactMatches.length === 1) {
    return {
      authority,
      status: 'ok',
      popConfigAccounts: exactMatches.map((item) => item?.pubkey).filter(Boolean),
    };
  }

  if (exactMatches.length > 1) {
    return {
      authority,
      status: 'duplicate',
      popConfigAccounts: exactMatches.map((item) => item?.pubkey).filter(Boolean),
    };
  }

  const byAuthority = await getProgramAccounts({
    rpcUrl,
    programId,
    filters: [
      { dataSize: POP_CONFIG_ACCOUNT_DATA_SIZE },
      { memcmp: { offset: 8, bytes: authority } },
    ],
  });

  if (byAuthority.length === 0) {
    return {
      authority,
      status: 'missing',
      popConfigAccounts: [],
    };
  }

  return {
    authority,
    status: 'mismatch',
    popConfigAccounts: byAuthority.map((item) => item?.pubkey).filter(Boolean),
  };
}

async function main() {
  console.log('=== Asuka/We-ne Production Readiness Check ===');
  console.log(`WORKER_BASE_URL=${WORKER_BASE_URL}`);
  console.log(`PAGES_BASE_URL=${PAGES_BASE_URL}`);
  console.log(`FETCH_TIMEOUT_MS=${FETCH_TIMEOUT_MS}`);
  console.log(`SOLANA_RPC_URL=${SOLANA_RPC_URL}`);
  console.log(`POP_CONFIG_PROGRAM_ID=${POP_CONFIG_PROGRAM_ID}`);

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
    const detailsRedacted = pop.detailsRedacted === true;
    const basicReady = pop.enforceOnchainPop === true && pop.signerConfigured === true;
    const detailedReady =
      pop.signerMode === 'hd' &&
      pop.legacySignerEnabled === false;
    const ok = detailsRedacted ? basicReady : (basicReady && detailedReady);
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

  if (POP_CONFIG_CHECK_ENABLED) {
    try {
      const popStatus = await fetchJson(`${WORKER_BASE_URL}/v1/school/pop-status`);
      const signerConfigured = popStatus?.signerConfigured === true;
      const signerPubkey = typeof popStatus?.signerPubkey === 'string' ? popStatus.signerPubkey.trim() : '';
      if (!signerConfigured || !signerPubkey) {
        addResult(
          false,
          'On-chain pop-config alignment',
          `PoP signer not configured (signerConfigured=${String(signerConfigured)} signerPubkey=${signerPubkey || 'null'})`
        );
      } else {
        const eventsBody = await fetchJson(`${WORKER_BASE_URL}/v1/school/events`);
        const events = Array.isArray(eventsBody?.items) ? eventsBody.items : [];
        const authorityMap = collectOnchainAuthorityMap(events, POP_CONFIG_EVENT_STATES);
        const authorities = Array.from(authorityMap.keys()).sort();

        if (authorities.length === 0) {
          addResult(
            true,
            'On-chain pop-config alignment',
            `no on-chain events for states=${Array.from(POP_CONFIG_EVENT_STATES).join(',') || '(all)'}`
          );
        } else {
          const checks = await Promise.all(
            authorities.map((authority) =>
              verifyAuthorityPopConfig({
                rpcUrl: SOLANA_RPC_URL,
                programId: POP_CONFIG_PROGRAM_ID,
                authority,
                signerPubkey,
              })
            )
          );

          const issues = checks
            .filter((item) => item.status !== 'ok')
            .map((item) => ({
              authority: item.authority,
              status: item.status,
              eventIds: authorityMap.get(item.authority) || [],
              popConfigAccounts: item.popConfigAccounts,
            }));
          const ok = issues.length === 0;
          addResult(
            ok,
            'On-chain pop-config alignment',
            JSON.stringify({
              signerPubkey,
              eventStates: Array.from(POP_CONFIG_EVENT_STATES),
              authorityCount: authorities.length,
              okAuthorities: checks.filter((item) => item.status === 'ok').length,
              issueCount: issues.length,
              issues,
            })
          );
        }
      }
    } catch (err) {
      addResult(false, 'On-chain pop-config alignment', err instanceof Error ? err.message : String(err));
    }
  } else {
    addResult(true, 'On-chain pop-config alignment', 'skipped (set POP_CONFIG_CHECK_ENABLED=true to enable)');
  }

  if (MASTER_TOKEN) {
    try {
      const integrity = await fetchJsonWithAuth(`${WORKER_BASE_URL}/api/master/audit-integrity?limit=50`, MASTER_TOKEN);
      addResult(integrity.ok === true, 'Audit integrity (master)', JSON.stringify(integrity));
    } catch (err) {
      addResult(false, 'Audit integrity (master)', err instanceof Error ? err.message : String(err));
    }

    try {
      const adminTransfers = await fetchJsonWithAuth(`${WORKER_BASE_URL}/api/admin/transfers?limit=20`, MASTER_TOKEN);
      const ok =
        adminTransfers.roleView === 'admin' &&
        adminTransfers.strictLevel === 'admin_transfer_visible_no_pii' &&
        Array.isArray(adminTransfers.items);
      addResult(ok, 'Admin transfers view (master token)', JSON.stringify({
        roleView: adminTransfers.roleView,
        strictLevel: adminTransfers.strictLevel,
        count: Array.isArray(adminTransfers.items) ? adminTransfers.items.length : -1,
      }));
    } catch (err) {
      addResult(false, 'Admin transfers view (master token)', err instanceof Error ? err.message : String(err));
    }

    try {
      const masterTransfers = await fetchJsonWithAuth(`${WORKER_BASE_URL}/api/master/transfers?limit=20`, MASTER_TOKEN);
      const ok =
        masterTransfers.roleView === 'master' &&
        masterTransfers.strictLevel === 'master_full' &&
        Array.isArray(masterTransfers.items);
      addResult(ok, 'Master transfers view', JSON.stringify({
        roleView: masterTransfers.roleView,
        strictLevel: masterTransfers.strictLevel,
        count: Array.isArray(masterTransfers.items) ? masterTransfers.items.length : -1,
      }));
    } catch (err) {
      addResult(false, 'Master transfers view', err instanceof Error ? err.message : String(err));
    }

    try {
      const pagesAdminTransfers = await fetchJsonWithAuth(`${PAGES_BASE_URL}/api/admin/transfers?limit=20`, MASTER_TOKEN);
      const ok = pagesAdminTransfers.roleView === 'admin' && Array.isArray(pagesAdminTransfers.items);
      addResult(ok, 'Pages proxy admin transfers', JSON.stringify({
        roleView: pagesAdminTransfers.roleView,
        count: Array.isArray(pagesAdminTransfers.items) ? pagesAdminTransfers.items.length : -1,
      }));
    } catch (err) {
      addResult(false, 'Pages proxy admin transfers', err instanceof Error ? err.message : String(err));
    }
  } else {
    addResult(true, 'Audit integrity (master)', 'skipped (set MASTER_TOKEN to enable)');
    addResult(true, 'Admin transfers view (master token)', 'skipped (set MASTER_TOKEN to enable)');
    addResult(true, 'Master transfers view', 'skipped (set MASTER_TOKEN to enable)');
    addResult(true, 'Pages proxy admin transfers', 'skipped (set MASTER_TOKEN to enable)');
  }

  try {
    await fetchWithStatus(`${WORKER_BASE_URL}/api/master/transfers?limit=1`, 401, {
      headers: { Accept: 'application/json' },
    });
    addResult(true, 'Master transfers unauthorized check', '401 without token');
  } catch (err) {
    addResult(false, 'Master transfers unauthorized check', err instanceof Error ? err.message : String(err));
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
