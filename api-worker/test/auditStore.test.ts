import { beforeEach, describe, expect, it } from 'vitest';
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
    mockEnv = { AUDIT_IMMUTABLE_MODE: 'off' };
    store = new SchoolStore(mockState, mockEnv);
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
});
