import { beforeEach, describe, expect, it, vi } from 'vitest';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
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

describe('runtime readiness and fail-close preflight', () => {
  let state: MockDurableObjectState;

  beforeEach(() => {
    state = new MockDurableObjectState();
  });

  it('returns blocking issues in runtime status when production prerequisites are missing', async () => {
    const env: Env = {
      AUDIT_IMMUTABLE_MODE: 'required',
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const res = await store.fetch(
      new Request('https://example.com/v1/school/runtime-status', { method: 'GET' })
    );
    consoleSpy.mockRestore();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready?: boolean;
      checks?: {
        adminPasswordConfigured?: boolean;
        popEnforced?: boolean;
        popSignerConfigured?: boolean;
        auditMode?: string;
        auditOperationalReady?: boolean;
      };
      blockingIssues?: string[];
    };

    expect(body.ready).toBe(false);
    expect(body.checks?.adminPasswordConfigured).toBe(false);
    expect(body.checks?.popEnforced).toBe(true);
    expect(body.checks?.popSignerConfigured).toBe(false);
    expect(body.checks?.auditMode).toBe('required');
    expect(body.checks?.auditOperationalReady).toBe(false);
    const issues = body.blockingIssues ?? [];
    expect(issues.some((issue) => issue.includes('ADMIN_PASSWORD'))).toBe(true);
    expect(issues.some((issue) => issue.includes('PoP signer'))).toBe(true);
    expect(issues.some((issue) => issue.includes('Audit immutable sink'))).toBe(true);
  });

  it('returns ready=true in runtime status when production prerequisites are configured', async () => {
    const popSigner = nacl.sign.keyPair();
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      POP_SIGNER_SECRET_KEY_B64: Buffer.from(popSigner.secretKey).toString('base64'),
      POP_SIGNER_PUBKEY: bs58.encode(popSigner.publicKey),
      ENFORCE_ONCHAIN_POP: 'true',
      AUDIT_IMMUTABLE_MODE: 'required',
      AUDIT_LOGS: new MockR2Bucket() as unknown as R2Bucket,
      CORS_ORIGIN: 'https://instant-grant-core.pages.dev',
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const res = await store.fetch(
      new Request('https://example.com/v1/school/runtime-status', { method: 'GET' })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready?: boolean;
      checks?: {
        adminPasswordConfigured?: boolean;
        popSignerConfigured?: boolean;
        auditOperationalReady?: boolean;
      };
      blockingIssues?: string[];
    };

    expect(body.ready).toBe(true);
    expect(body.checks?.adminPasswordConfigured).toBe(true);
    expect(body.checks?.popSignerConfigured).toBe(true);
    expect(body.checks?.auditOperationalReady).toBe(true);
    expect((body.blockingIssues ?? []).length).toBe(0);
  });

  it('blocks mutating APIs before side effects when immutable audit sink is not ready', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'required',
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Student A',
          pin: '1234',
        }),
      })
    );

    expect(registerRes.status).toBe(503);
    const registerBody = (await registerRes.json()) as { error?: string };
    expect(registerBody.error).toContain('audit immutable sink');

    const users = await state.storage.list({ prefix: 'user:' });
    expect(users.size).toBe(0);
  });
});
