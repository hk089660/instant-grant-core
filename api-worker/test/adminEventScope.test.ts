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

describe('GET /v1/school/events scope=mine', () => {
  let state: MockDurableObjectState;
  let store: SchoolStore;
  const masterToken = 'master-secret';

  beforeEach(() => {
    state = new MockDurableObjectState();
    const env: Env = {
      ADMIN_PASSWORD: masterToken,
      AUDIT_IMMUTABLE_MODE: 'off',
      ENFORCE_ONCHAIN_POP: 'false',
    };
    // @ts-expect-error mock for DurableObjectState
    store = new SchoolStore(state, env);
  });

  async function inviteAdmin(name: string): Promise<string> {
    const res = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ name }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string };
    expect(typeof body.code).toBe('string');
    return body.code as string;
  }

  async function createEvent(token: string, title: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 2));
    const res = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          datetime: '2026/03/01 10:00',
          host: title,
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id?: string };
    expect(typeof body.id).toBe('string');
    return body.id as string;
  }

  it('returns only owner-issued events for each admin token', async () => {
    const adminACode = await inviteAdmin('Admin A');
    const adminBCode = await inviteAdmin('Admin B');

    const eventAId = await createEvent(adminACode, 'event-admin-a');
    const eventBId = await createEvent(adminBCode, 'event-admin-b');
    const eventMasterId = await createEvent(masterToken, 'event-master');

    const adminARes = await store.fetch(
      new Request('https://example.com/v1/school/events?scope=mine', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminACode}` },
      })
    );
    expect(adminARes.status).toBe(200);
    const adminABody = (await adminARes.json()) as { items?: Array<{ id: string }> };
    const adminAIds = new Set((adminABody.items ?? []).map((item) => item.id));
    expect(adminAIds.has(eventAId)).toBe(true);
    expect(adminAIds.has(eventBId)).toBe(false);
    expect(adminAIds.has(eventMasterId)).toBe(false);

    const adminBRes = await store.fetch(
      new Request('https://example.com/v1/school/events?scope=mine', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminBCode}` },
      })
    );
    expect(adminBRes.status).toBe(200);
    const adminBBody = (await adminBRes.json()) as { items?: Array<{ id: string }> };
    const adminBIds = new Set((adminBBody.items ?? []).map((item) => item.id));
    expect(adminBIds.has(eventAId)).toBe(false);
    expect(adminBIds.has(eventBId)).toBe(true);
    expect(adminBIds.has(eventMasterId)).toBe(false);

    const masterRes = await store.fetch(
      new Request('https://example.com/v1/school/events?scope=mine', {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(masterRes.status).toBe(200);
    const masterBody = (await masterRes.json()) as { items?: Array<{ id: string }> };
    const masterIds = new Set((masterBody.items ?? []).map((item) => item.id));
    expect(masterIds.has(eventAId)).toBe(true);
    expect(masterIds.has(eventBId)).toBe(true);
    expect(masterIds.has(eventMasterId)).toBe(true);

    const publicRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'GET',
      })
    );
    expect(publicRes.status).toBe(200);
    const publicBody = (await publicRes.json()) as { items?: Array<{ id: string }> };
    const publicIds = new Set((publicBody.items ?? []).map((item) => item.id));
    expect(publicIds.has(eventAId)).toBe(true);
    expect(publicIds.has(eventBId)).toBe(true);
    expect(publicIds.has(eventMasterId)).toBe(true);
  });

  it('requires operator authorization when scope=mine is requested', async () => {
    const res = await store.fetch(
      new Request('https://example.com/v1/school/events?scope=mine', {
        method: 'GET',
      })
    );
    expect(res.status).toBe(401);
  });
});
