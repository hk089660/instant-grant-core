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

describe('fairscale integration and admin issuance limits', () => {
  let state: MockDurableObjectState;

  beforeEach(() => {
    state = new MockDurableObjectState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('blocks user registration when fairscale denies', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      FAIRSCALE_ENABLED: 'true',
      FAIRSCALE_FAIL_CLOSED: 'true',
      FAIRSCALE_BASE_URL: 'https://fairscale.example',
      FAIRSCALE_VERIFY_PATH: '/v1/risk/score',
      FAIRSCALE_MIN_SCORE: '70',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          allow: false,
          score: 12,
          reason: 'high_sybil_risk',
          decisionId: 'decision-001',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const store = new SchoolStore(state as any, env);
    const res = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.101',
        },
        body: JSON.stringify({
          userId: 'fairscale-user-01',
          displayName: 'FairScale User',
          pin: '1234',
        }),
      })
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; reason?: string };
    expect(body.code).toBe('fairscale_blocked');
    expect(body.reason).toContain('high_sybil_risk');

    const users = await state.storage.list({ prefix: 'user:' });
    expect(users.size).toBe(0);
  });

  it('allows registration in fail-open mode when fairscale is unavailable', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      FAIRSCALE_ENABLED: 'true',
      FAIRSCALE_FAIL_CLOSED: 'false',
      FAIRSCALE_BASE_URL: 'https://fairscale.example',
      FAIRSCALE_VERIFY_PATH: '/v1/risk/score',
    };
    const fetchMock = vi.fn().mockRejectedValue(new Error('upstream timeout'));
    vi.stubGlobal('fetch', fetchMock);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    const store = new SchoolStore(state as any, env);
    const res = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.102',
        },
        body: JSON.stringify({
          userId: 'fairscale-user-02',
          displayName: 'Fail Open User',
          pin: '1234',
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId?: string };
    expect(body.userId).toBe('fairscale-user-02');
    consoleErrorSpy.mockRestore();
  });

  it('limits event issuance per admin per day', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      SECURITY_ADMIN_EVENT_ISSUE_LIMIT_PER_DAY: '1',
    };
    const store = new SchoolStore(state as any, env);
    const headers = {
      'content-type': 'application/json',
      Authorization: 'Bearer master-secret',
    };

    const first = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Issue Limit Event 1',
          datetime: '2026/03/01 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(first.status).toBe(201);

    const second = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Issue Limit Event 2',
          datetime: '2026/03/01 11:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(second.status).toBe(429);
    const body = (await second.json()) as { code?: string };
    expect(body.code).toBe('event_issue_limit_exceeded');
  });

  it('limits admin invite issuance per day', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      SECURITY_ADMIN_INVITE_ISSUE_LIMIT_PER_DAY: '1',
    };
    const store = new SchoolStore(state as any, env);
    const headers = {
      'content-type': 'application/json',
      Authorization: 'Bearer master-secret',
    };

    const first = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Admin One' }),
      })
    );
    expect(first.status).toBe(200);

    const second = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Admin Two' }),
      })
    );
    expect(second.status).toBe(429);
    const body = (await second.json()) as { code?: string };
    expect(body.code).toBe('admin_invite_issue_limit_exceeded');
  });
});
