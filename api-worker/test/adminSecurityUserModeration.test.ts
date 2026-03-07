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

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

describe('admin security user moderation wiring', () => {
  let store: SchoolStore;
  const masterToken = 'master-secret';

  beforeEach(() => {
    const state = new MockDurableObjectState();
    const env: Env = {
      ADMIN_PASSWORD: masterToken,
      AUDIT_IMMUTABLE_MODE: 'off',
      ENFORCE_ONCHAIN_POP: 'false',
    };
    // @ts-expect-error mock for DurableObjectState
    store = new SchoolStore(state, env);
  });

  async function postJson(path: string, body: unknown, headers?: Record<string, string>): Promise<Response> {
    return store.fetch(new Request(`https://example.com${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    }));
  }

  async function registerUser(userId: string, pin = '1234'): Promise<Response> {
    return postJson('/api/users/register', {
      userId,
      displayName: userId,
      pin,
    });
  }

  async function createPublishedEvent(title: string): Promise<string> {
    const res = await postJson(
      '/v1/school/events',
      {
        title,
        datetime: '2026/03/01 10:00',
        host: title,
        state: 'published',
        ticketTokenAmount: 1,
      },
      authHeaders(masterToken)
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id?: string };
    expect(typeof body.id).toBe('string');
    return body.id as string;
  }

  it('enforces frozen users on auth, sync, and claim APIs', async () => {
    const registerRes = await registerUser('alice', '1234');
    expect(registerRes.status).toBe(200);
    const eventId = await createPublishedEvent('freeze-target-event');

    const freezeRes = await postJson(
      '/v1/school/admin/security/users/freeze',
      { userId: 'alice', reason: 'test-freeze' },
      authHeaders(masterToken)
    );
    expect(freezeRes.status).toBe(200);
    const freezeBody = (await freezeRes.json()) as { success?: boolean };
    expect(freezeBody.success).toBe(true);

    const verifyRes = await postJson('/api/auth/verify', { userId: 'alice', pin: '1234' });
    expect(verifyRes.status).toBe(423);
    const verifyBody = (await verifyRes.json()) as { code?: string; unlockRequired?: boolean };
    expect(verifyBody.code).toBe('user_frozen');
    expect(verifyBody.unlockRequired).toBe(true);

    const syncRes = await postJson('/api/users/tickets/sync', { userId: 'alice', pin: '1234' });
    expect(syncRes.status).toBe(423);
    const syncBody = (await syncRes.json()) as { code?: string };
    expect(syncBody.code).toBe('user_frozen');

    const claimRes = await postJson(`/api/events/${encodeURIComponent(eventId)}/claim`, {
      userId: 'alice',
      pin: '1234',
    });
    expect(claimRes.status).toBe(423);
    const claimBody = (await claimRes.json()) as { code?: string };
    expect(claimBody.code).toBe('user_frozen');

    const unfreezeRes = await postJson(
      '/v1/school/admin/security/users/unfreeze',
      { userId: 'alice' },
      authHeaders(masterToken)
    );
    expect(unfreezeRes.status).toBe(200);
    const unfreezeBody = (await unfreezeRes.json()) as { success?: boolean };
    expect(unfreezeBody.success).toBe(true);

    const verifyAfterRes = await postJson('/api/auth/verify', { userId: 'alice', pin: '1234' });
    expect(verifyAfterRes.status).toBe(200);
    const verifyAfterBody = (await verifyAfterRes.json()) as { ok?: boolean };
    expect(verifyAfterBody.ok).toBe(true);
  });

  it('enforces deleted users on register and allows restore', async () => {
    const deleteRes = await postJson(
      '/v1/school/admin/security/users/delete',
      { userId: 'ghost', reason: 'test-delete' },
      authHeaders(masterToken)
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as { success?: boolean };
    expect(deleteBody.success).toBe(true);

    const blockedRegister = await registerUser('ghost', '1234');
    expect(blockedRegister.status).toBe(403);
    const blockedBody = (await blockedRegister.json()) as { code?: string };
    expect(blockedBody.code).toBe('user_deleted');

    const restoreRes = await postJson(
      '/v1/school/admin/security/users/restore',
      { userId: 'ghost' },
      authHeaders(masterToken)
    );
    expect(restoreRes.status).toBe(200);
    const restoreBody = (await restoreRes.json()) as { success?: boolean };
    expect(restoreBody.success).toBe(true);

    const registerAfterRestore = await registerUser('ghost', '1234');
    expect(registerAfterRestore.status).toBe(200);
    const registerBody = (await registerAfterRestore.json()) as { userId?: string };
    expect(registerBody.userId).toBe('ghost');
  });
});
