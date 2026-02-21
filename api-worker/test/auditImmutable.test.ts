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

  async list(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, unknown>> {
    const prefix = options?.prefix ?? '';
    const entries = Array.from(this.data.entries()).filter(([key]) => key.startsWith(prefix));
    return new Map(entries);
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

class MockR2Bucket {
  private data = new Map<string, string>();

  async put(key: string, value: unknown, options?: { onlyIf?: { etagDoesNotMatch?: string } }): Promise<R2Object | null> {
    const body = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    if (options?.onlyIf?.etagDoesNotMatch === '*' && this.data.has(key)) {
      return null;
    }
    this.data.set(key, body);
    return { key } as R2Object;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const body = this.data.get(key);
    if (body === undefined) return null;
    return {
      text: async () => body,
    } as R2ObjectBody;
  }
}

describe('immutable audit persistence', () => {
  let state: MockDurableObjectState;

  beforeEach(() => {
    state = new MockDurableObjectState();
  });

  it('fails closed when immutable mode is required and no sink is configured', async () => {
    const env: Env = { AUDIT_IMMUTABLE_MODE: 'required' };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    await expect(
      store.appendAuditLog('TEST', { type: 'system', id: 's1' }, { ok: true }, 'evt-1')
    ).rejects.toThrow('immutable audit sink is not configured');
  });

  it('persists immutable receipt when R2 sink is configured', async () => {
    const r2 = new MockR2Bucket();
    const env: Env = {
      AUDIT_IMMUTABLE_MODE: 'required',
      AUDIT_LOGS: r2 as unknown as R2Bucket,
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const entry = await store.appendAuditLog('TEST', { type: 'system', id: 's2' }, { ok: true }, 'evt-2');

    expect(entry.immutable?.mode).toBe('required');
    expect(entry.immutable?.sinks.some((sink) => sink.sink === 'r2_entry')).toBe(true);
    expect(entry.immutable?.sinks.some((sink) => sink.sink === 'r2_stream')).toBe(true);

    const entryObject = await r2.get(`audit/immutable/entry/${entry.entry_hash}.json`);
    expect(entryObject).not.toBeNull();
  });
});
