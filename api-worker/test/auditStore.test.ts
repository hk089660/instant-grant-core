import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchoolStore, type Env } from '../src/storeDO';

class MockStorage {
  private data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async list(options?: { prefix?: string }): Promise<Map<string, unknown>> {
    const result = new Map<string, unknown>();
    const prefix = options?.prefix ?? '';
    for (const [key, value] of this.data.entries()) {
      if (key.startsWith(prefix)) {
        result.set(key, value);
      }
    }
    return result;
  }
}

class MockDurableObjectState {
  storage: MockStorage;
  id: { toString: () => string } = { toString: () => 'mock-id' };

  constructor() {
    this.storage = new MockStorage();
  }

  waitUntil(_promise: Promise<unknown>): void {
    // no-op
  }

  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> {
    return callback();
  }
}

describe('SchoolStore Audit Log', () => {
  let store: SchoolStore;
  let mockState: MockDurableObjectState;
  let mockEnv: Env;

  beforeEach(() => {
    mockState = new MockDurableObjectState();
    mockEnv = {
      AUDIT_IMMUTABLE_MODE: 'off',
      AUDIT_RANDOM_ANCHOR_ENABLED: 'true',
      AUDIT_RANDOM_ANCHOR_PERIOD_MINUTES: '60',
    };
    store = new SchoolStore(mockState, mockEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a genesis log entry for both global and event stream chains', async () => {
    const eventId = 'event-123';
    const entry = await store.appendAuditLog(
      'TEST_EVENT',
      { type: 'user', id: 'u1' },
      { foo: 'bar' },
      eventId
    );

    expect(entry.event).toBe('TEST_EVENT');
    expect(entry.eventId).toBe(eventId);
    expect(entry.prev_hash).toBe('GENESIS');
    expect(entry.stream_prev_hash).toBe('GENESIS');
    expect(entry.entry_hash).toBeDefined();
    expect(entry.ts).toBeDefined();

    const streamHash = await mockState.storage.get(`audit:lastHash:${eventId}`);
    expect(streamHash).toBe(entry.entry_hash);

    const globalHash = await mockState.storage.get('audit:lastHash:global');
    expect(globalHash).toBe(entry.entry_hash);
  });

  it('chains global and stream hashes correctly for sequential entries of same event', async () => {
    const eventId = 'event-chain';

    const entry1 = await store.appendAuditLog(
      'EVENT_1',
      { type: 'system', id: 'sys' },
      {},
      eventId
    );
    const entry2 = await store.appendAuditLog(
      'EVENT_2',
      { type: 'system', id: 'sys' },
      {},
      eventId
    );

    expect(entry1.prev_hash).toBe('GENESIS');
    expect(entry2.prev_hash).toBe(entry1.entry_hash);
    expect(entry2.stream_prev_hash).toBe(entry1.entry_hash);

    const streamHash = await mockState.storage.get(`audit:lastHash:${eventId}`);
    expect(streamHash).toBe(entry2.entry_hash);
  });

  it('uses one global chain across different events while keeping per-event stream continuity', async () => {
    const eventA = 'event-A';
    const eventB = 'event-B';

    const entryA1 = await store.appendAuditLog('A1', { type: 'u', id: '1' }, {}, eventA);
    const entryB1 = await store.appendAuditLog('B1', { type: 'u', id: '1' }, {}, eventB);
    const entryA2 = await store.appendAuditLog('A2', { type: 'u', id: '1' }, {}, eventA);

    expect(entryA1.prev_hash).toBe('GENESIS');
    expect(entryA1.stream_prev_hash).toBe('GENESIS');

    // global chain should continue regardless of eventId
    expect(entryB1.prev_hash).toBe(entryA1.entry_hash);
    // first event-B entry still starts its own stream from GENESIS
    expect(entryB1.stream_prev_hash).toBe('GENESIS');

    expect(entryA2.prev_hash).toBe(entryB1.entry_hash);
    // event-A stream should reference previous event-A entry
    expect(entryA2.stream_prev_hash).toBe(entryA1.entry_hash);

    const lastHashB = await mockState.storage.get(`audit:lastHash:${eventB}`);
    expect(lastHashB).toBe(entryB1.entry_hash);

    const globalHash = await mockState.storage.get('audit:lastHash:global');
    expect(globalHash).toBe(entryA2.entry_hash);
  });

  it('anchors latest hash once when random periodic target is reached', async () => {
    const baseNow = Date.UTC(2026, 1, 28, 10, 0, 0);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseNow);
    const periodMs = 60 * 60 * 1000;
    const windowStartMs = Math.floor(baseNow / periodMs) * periodMs;
    const targetTsMs = windowStartMs + 45 * 60 * 1000;

    await mockState.storage.put('audit:random_anchor:state', {
      windowStartMs,
      targetTsMs,
      anchoredAtMs: null,
      lastEntryHash: null,
    });

    const earlyRes = await store.fetch(
      new Request('https://example.com/_internal/audit/random-anchor', { method: 'POST' })
    );
    const earlyBody = await earlyRes.json() as { anchored?: boolean; reason?: string };
    expect(earlyRes.status).toBe(200);
    expect(earlyBody.anchored).toBe(false);
    expect(earlyBody.reason).toBe('not_due');
    expect(await mockState.storage.get('audit:lastHash:global')).toBeUndefined();

    nowSpy.mockReturnValue(targetTsMs + 1);
    const anchorRes = await store.fetch(
      new Request('https://example.com/_internal/audit/random-anchor', { method: 'POST' })
    );
    const anchorBody = await anchorRes.json() as {
      anchored?: boolean;
      reason?: string;
      entryHash?: string | null;
    };
    expect(anchorRes.status).toBe(200);
    expect(anchorBody.anchored).toBe(true);
    expect(anchorBody.reason).toBe('anchored');
    expect(anchorBody.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await mockState.storage.get('audit:lastHash:global')).toBe(anchorBody.entryHash);

    const duplicateRes = await store.fetch(
      new Request('https://example.com/_internal/audit/random-anchor', { method: 'POST' })
    );
    const duplicateBody = await duplicateRes.json() as {
      anchored?: boolean;
      reason?: string;
      entryHash?: string | null;
    };
    expect(duplicateRes.status).toBe(200);
    expect(duplicateBody.anchored).toBe(false);
    expect(duplicateBody.reason).toBe('already_anchored');
    expect(duplicateBody.entryHash).toBe(anchorBody.entryHash);

    const history = await mockState.storage.list({ prefix: 'audit_history:' });
    expect(history.size).toBe(1);
  });
});
