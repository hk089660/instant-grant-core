import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchoolStore, type Env } from '../src/storeDO';
import type { AuditEvent } from '../src/audit/types';

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

async function latestAudit(state: MockDurableObjectState): Promise<AuditEvent> {
  const logs = await state.storage.list({ prefix: 'audit_history:', reverse: true, limit: 1 });
  const entry = Array.from(logs.values())[0] as AuditEvent | undefined;
  if (!entry) throw new Error('audit log not found');
  return entry;
}

describe('API coverage audit logs', () => {
  let state: MockDurableObjectState;
  let store: SchoolStore;
  let env: Env;

  beforeEach(() => {
    state = new MockDurableObjectState();
    env = { ADMIN_PASSWORD: 'master-secret', AUDIT_IMMUTABLE_MODE: 'off' };
    store = new SchoolStore(state as any, env);
  });

  it('tracks admin login attempts and redacts password', async () => {
    const res = await store.fetch(
      new Request('https://example.com/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'wrong-secret' }),
      })
    );

    expect(res.status).toBe(401);

    const log = await latestAudit(state);
    expect(log.event).toBe('API_POST_API_ADMIN_LOGIN');
    expect(log.actor).toEqual({ type: 'operator', id: 'anonymous' });
    expect(log.eventId).toBe('system');
    expect((log.data.requestBody as Record<string, unknown>).password).toBe('[REDACTED]');
    expect(log.data.status).toBe(401);
  });

  it('tracks operator audit-dashboard access in hash chain', async () => {
    const res = await store.fetch(
      new Request('https://example.com/api/master/audit-logs', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.ADMIN_PASSWORD}` },
      })
    );

    expect(res.status).toBe(200);

    const log = await latestAudit(state);
    expect(log.event).toBe('API_GET_API_MASTER_AUDIT_LOGS');
    expect(log.actor.type).toBe('operator');
    expect(log.data.hasAuthorization).toBe(true);
  });

  it('tracks user auth verify and redacts pin', async () => {
    const res = await store.fetch(
      new Request('https://example.com/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'user-001', pin: '1234' }),
      })
    );

    expect(res.status).toBe(401);

    const log = await latestAudit(state);
    expect(log.event).toBe('API_POST_API_AUTH_VERIFY');
    expect(log.actor).toEqual({ type: 'user', id: 'user-001' });
    expect((log.data.requestBody as Record<string, unknown>).pin).toBe('[REDACTED]');
    expect(log.data.status).toBe(401);
  });

  it('tracks unauthorized admin-protected school route access as operator', async () => {
    const res = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'blocked',
          datetime: '2026/02/20 16:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );

    expect(res.status).toBe(401);

    const log = await latestAudit(state);
    expect(log.event).toBe('API_POST_V1_SCHOOL_EVENTS');
    expect(log.actor).toEqual({ type: 'operator', id: 'anonymous' });
    expect(log.data.status).toBe(401);
  });

  it('returns server configuration error for master-only routes when default password is not replaced', async () => {
    const localState = new MockDurableObjectState();
    const insecureEnv: Env = { ADMIN_PASSWORD: 'change-this-in-dashboard', AUDIT_IMMUTABLE_MODE: 'off' };
    const insecureStore = new SchoolStore(localState as any, insecureEnv);

    const res = await insecureStore.fetch(
      new Request('https://example.com/api/master/audit-logs', {
        method: 'GET',
        headers: { Authorization: 'Bearer change-this-in-dashboard' },
      })
    );

    expect(res.status).toBe(500);
  });

  it('allows master admin-code control routes even when immutable audit fail-close is active', async () => {
    const localState = new MockDurableObjectState();
    const strictEnv: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'required',
    };
    const strictStore = new SchoolStore(localState as any, strictEnv);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    const inviteRes = await strictStore.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer master-secret',
        },
        body: JSON.stringify({ name: 'Bootstrap Admin' }),
      })
    );

    expect(inviteRes.status).toBe(200);

    const eventCreateRes = await strictStore.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer master-secret',
        },
        body: JSON.stringify({
          title: 'blocked',
          datetime: '2026/02/20 16:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );

    expect(eventCreateRes.status).toBe(503);

    consoleErrorSpy.mockRestore();
  });
});
