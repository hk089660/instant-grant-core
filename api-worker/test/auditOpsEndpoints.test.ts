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

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, unknown>> {
    const prefix = options?.prefix ?? '';
    let entries = Array.from(this.data.entries()).filter(([key]) => key.startsWith(prefix));
    entries.sort(([a], [b]) => a.localeCompare(b));
    if (options?.reverse) entries = entries.reverse();
    if (typeof options?.limit === 'number') entries = entries.slice(0, options.limit);
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

describe('audit operational endpoints', () => {
  let state: MockDurableObjectState;
  let env: Env;
  let store: SchoolStore;

  beforeEach(() => {
    state = new MockDurableObjectState();
    env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'required',
      AUDIT_LOGS: new MockR2Bucket() as unknown as R2Bucket,
    };
    // @ts-expect-error mock for DurableObjectState
    store = new SchoolStore(state, env);
  });

  it('returns audit operational readiness status', async () => {
    const res = await store.fetch(
      new Request('https://example.com/v1/school/audit-status', { method: 'GET' })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode?: string;
      operationalReady?: boolean;
      sinks?: { r2Configured?: boolean };
    };
    expect(body.mode).toBe('required');
    expect(body.operationalReady).toBe(true);
    expect(body.sinks?.r2Configured).toBe(true);
  });

  it('returns integrity report ok=true for untampered logs', async () => {
    await store.appendAuditLog('E1', { type: 'system', id: 's1' }, { step: 1 }, 'evt-ops');
    await store.appendAuditLog('E2', { type: 'system', id: 's2' }, { step: 2 }, 'evt-ops');

    const res = await store.fetch(
      new Request('https://example.com/api/master/audit-integrity?limit=20', {
        method: 'GET',
        headers: { Authorization: 'Bearer master-secret' },
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; checked?: number; issues?: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.checked).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(body.issues) ? body.issues.length : -1).toBe(0);
  });

  it('detects tampered audit entry via integrity endpoint', async () => {
    const localState = new MockDurableObjectState();
    const localEnv: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
    };
    // @ts-expect-error mock for DurableObjectState
    const localStore = new SchoolStore(localState, localEnv);

    const entry = await localStore.appendAuditLog('TAMPER_TARGET', { type: 'system', id: 'x' }, { v: 1 }, 'evt-tamper');
    const historyKey = `audit_history:${entry.ts}:${entry.entry_hash}`;
    await localState.storage.put(historyKey, {
      ...entry,
      data: { v: 999 },
    });

    const res = await localStore.fetch(
      new Request('https://example.com/api/master/audit-integrity?limit=20&verifyImmutable=0', {
        method: 'GET',
        headers: { Authorization: 'Bearer master-secret' },
      })
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { ok?: boolean; issues?: Array<{ code?: string }> };
    expect(body.ok).toBe(false);
    expect(body.issues?.some((issue) => issue.code === 'entry_hash_mismatch')).toBe(true);
  });
});
