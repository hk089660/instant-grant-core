import { canonicalize, sha256Hex } from './hash';
import type { AuditEvent, AuditImmutableMode, AuditImmutableReceipt, AuditImmutableSink } from './types';

type ImmutableBindings = {
  AUDIT_LOGS?: R2Bucket;
  AUDIT_INDEX?: KVNamespace;
  AUDIT_IMMUTABLE_INGEST_URL?: string;
  AUDIT_IMMUTABLE_INGEST_TOKEN?: string;
  AUDIT_IMMUTABLE_FETCH_TIMEOUT_MS?: string;
};

type PersistImmutableAuditParams = {
  entry: AuditEvent;
  mode: AuditImmutableMode;
  source: string;
  bindings: ImmutableBindings;
};

const DEFAULT_INGEST_TIMEOUT_MS = 5000;

function parseTimeout(raw: string | undefined): number {
  if (!raw) return DEFAULT_INGEST_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_INGEST_TIMEOUT_MS;
  return parsed;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function putIfAbsentOrVerify(
  bucket: R2Bucket,
  key: string,
  payload: string,
  metadata: Record<string, string>
): Promise<void> {
  const putResult = await bucket.put(key, payload, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: metadata,
    onlyIf: { etagDoesNotMatch: '*' },
  });
  if (putResult) return;

  const existing = await bucket.get(key);
  if (!existing) {
    throw new Error(`conditional put failed and object is missing: ${key}`);
  }

  const existingText = await existing.text();
  if (existingText !== payload) {
    throw new Error(`immutable conflict detected for ${key}`);
  }
}

async function writeR2ImmutableCopies(
  bucket: R2Bucket,
  entry: AuditEvent,
  payload: string,
  payloadHash: string
): Promise<AuditImmutableSink[]> {
  const eventId = encodeURIComponent(entry.eventId);
  const ts = entry.ts.replace(/[:.]/g, '-');
  const entryKey = `audit/immutable/entry/${entry.entry_hash}.json`;
  const streamKey = `audit/immutable/stream/${eventId}/${ts}_${entry.entry_hash}.json`;

  const meta = {
    event_id: entry.eventId,
    entry_hash: entry.entry_hash,
    payload_hash: payloadHash,
  };

  await putIfAbsentOrVerify(bucket, entryKey, payload, meta);
  await putIfAbsentOrVerify(bucket, streamKey, payload, meta);

  return [
    { sink: 'r2_entry', ref: entryKey, at: nowIso() },
    { sink: 'r2_stream', ref: streamKey, at: nowIso() },
  ];
}

async function writeKvIndex(
  kv: KVNamespace,
  entry: AuditEvent,
  payloadHash: string
): Promise<AuditImmutableSink> {
  const key = `audit:immutable:${entry.entry_hash}`;
  const value = JSON.stringify({
    ts: entry.ts,
    eventId: entry.eventId,
    prev_hash: entry.prev_hash,
    stream_prev_hash: entry.stream_prev_hash ?? 'GENESIS',
    payload_hash: payloadHash,
  });
  await kv.put(key, value);
  return { sink: 'kv_index', ref: key, at: nowIso() };
}

async function writeImmutableWebhook(
  ingestUrl: string,
  token: string,
  timeoutMs: number,
  source: string,
  entry: AuditEvent,
  payloadHash: string
): Promise<AuditImmutableSink> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const res = await fetch(ingestUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-audit-entry-hash': entry.entry_hash,
        'x-audit-payload-sha256': payloadHash,
      },
      body: JSON.stringify({
        version: 1,
        source,
        payload_hash: payloadHash,
        entry,
      }),
    });

    if (!res.ok) {
      throw new Error(`immutable ingest failed with status ${res.status}`);
    }

    const refHeader = res.headers.get('x-immutable-receipt') ?? '';
    const ref = refHeader || `http:${res.status}`;
    return { sink: 'immutable_ingest', ref, at: nowIso() };
  } finally {
    clearTimeout(timeout);
  }
}

function hasPrimaryImmutableSink(bindings: ImmutableBindings): boolean {
  if (bindings.AUDIT_LOGS) return true;
  return Boolean(bindings.AUDIT_IMMUTABLE_INGEST_URL?.trim());
}

export function parseAuditImmutableMode(raw: string | undefined): AuditImmutableMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'required';
  if (value === 'off' || value === 'false' || value === '0' || value === 'disabled' || value === 'no') {
    return 'off';
  }
  if (value === 'best_effort' || value === 'best-effort' || value === 'relaxed' || value === 'warn') {
    return 'best_effort';
  }
  return 'required';
}

export async function persistImmutableAuditEntry(
  params: PersistImmutableAuditParams
): Promise<AuditImmutableReceipt | null> {
  const { entry, mode, source, bindings } = params;
  if (mode === 'off') return null;

  const payload = canonicalize({
    version: 1,
    source,
    entry,
  });
  const payloadHash = await sha256Hex(payload);
  const sinks: AuditImmutableSink[] = [];
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (!hasPrimaryImmutableSink(bindings)) {
    const msg = 'immutable audit sink is not configured (AUDIT_LOGS or AUDIT_IMMUTABLE_INGEST_URL)';
    if (mode === 'required') throw new Error(msg);
    return {
      mode,
      payload_hash: payloadHash,
      sinks,
      warnings: [msg],
    };
  }

  if (bindings.AUDIT_LOGS) {
    try {
      sinks.push(...await writeR2ImmutableCopies(bindings.AUDIT_LOGS, entry, payload, payloadHash));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail = `r2:${message}`;
      blockingErrors.push(detail);
      warnings.push(detail);
    }
  }

  if (bindings.AUDIT_INDEX) {
    try {
      sinks.push(await writeKvIndex(bindings.AUDIT_INDEX, entry, payloadHash));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`kv:${message}`);
    }
  }

  const ingestUrl = bindings.AUDIT_IMMUTABLE_INGEST_URL?.trim() ?? '';
  if (ingestUrl) {
    try {
      const token = bindings.AUDIT_IMMUTABLE_INGEST_TOKEN?.trim() ?? '';
      const timeoutMs = parseTimeout(bindings.AUDIT_IMMUTABLE_FETCH_TIMEOUT_MS);
      sinks.push(await writeImmutableWebhook(ingestUrl, token, timeoutMs, source, entry, payloadHash));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail = `ingest:${message}`;
      blockingErrors.push(detail);
      warnings.push(detail);
    }
  }

  const hasImmutableWrite = sinks.some((sink) => sink.sink === 'r2_entry' || sink.sink === 'immutable_ingest');
  if (!hasImmutableWrite) {
    const detail = 'no immutable sink accepted this entry';
    blockingErrors.push(detail);
    warnings.push(detail);
  }

  if (mode === 'required' && blockingErrors.length > 0) {
    throw new Error(`immutable audit persistence failed: ${blockingErrors.join('; ')}`);
  }

  return {
    mode,
    payload_hash: payloadHash,
    sinks,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
