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

describe('security preflight guardrails', () => {
  let state: MockDurableObjectState;
  let baseEnv: Env;

  beforeEach(() => {
    state = new MockDurableObjectState();
    baseEnv = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      SECURITY_RATE_LIMIT_GLOBAL_PER_MINUTE: '1000',
      SECURITY_RATE_LIMIT_BLOCK_SECONDS: '30',
    };
  });

  it('rejects oversized API payloads with 413', async () => {
    const env: Env = {
      ...baseEnv,
      SECURITY_MAX_REQUEST_BODY_BYTES: '4096',
    };
    const store = new SchoolStore(state as any, env);
    const body = JSON.stringify({
      userId: 'security-user-001',
      displayName: `Security User ${'x'.repeat(5000)}`,
      pin: '1234',
    });
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(4096);

    const res = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.10',
        },
        body,
      })
    );

    expect(res.status).toBe(413);
    const payload = (await res.json()) as { code?: string; maxBytes?: number };
    expect(payload.code).toBe('payload_too_large');
    expect(payload.maxBytes).toBe(4096);
  });

  it('rate-limits repeated admin login attempts from the same client', async () => {
    const env: Env = {
      ...baseEnv,
      SECURITY_RATE_LIMIT_ADMIN_LOGIN_PER_10_MINUTES: '3',
    };
    const store = new SchoolStore(state as any, env);

    let latest: Response | null = null;
    for (let i = 0; i < 4; i += 1) {
      latest = await store.fetch(
        new Request('https://example.com/api/admin/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'CF-Connecting-IP': '198.51.100.20',
          },
          body: JSON.stringify({ password: 'wrong-password' }),
        })
      );
    }

    expect(latest).not.toBeNull();
    expect(latest?.status).toBe(429);
    const payload = (await latest?.json()) as { code?: string; bucket?: string };
    expect(payload.code).toBe('rate_limited');
    expect(payload.bucket).toBe('admin_login');
    expect(Number(latest?.headers.get('Retry-After') ?? '0')).toBeGreaterThan(0);
  });

  it('disables rate-limiting when SECURITY_RATE_LIMIT_ENABLED is false', async () => {
    const env: Env = {
      ...baseEnv,
      SECURITY_RATE_LIMIT_ENABLED: 'false',
      SECURITY_RATE_LIMIT_ADMIN_LOGIN_PER_10_MINUTES: '3',
    };
    const store = new SchoolStore(state as any, env);

    let latest: Response | null = null;
    for (let i = 0; i < 4; i += 1) {
      latest = await store.fetch(
        new Request('https://example.com/api/admin/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'CF-Connecting-IP': '198.51.100.30',
          },
          body: JSON.stringify({ password: 'wrong-password' }),
        })
      );
    }
    expect(latest?.status).toBe(401);
  });
});
