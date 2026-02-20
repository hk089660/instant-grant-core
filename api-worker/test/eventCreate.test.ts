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

describe('POST /v1/school/events ticketTokenAmount validation', () => {
  let state: MockDurableObjectState;
  let store: SchoolStore;

  beforeEach(() => {
    state = new MockDurableObjectState();
    const env: Env = { ADMIN_PASSWORD: 'master-secret' };
    // @ts-expect-error mock for DurableObjectState
    store = new SchoolStore(state, env);
  });

  it('rejects when ticketTokenAmount is missing', async () => {
    const res = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'test event',
          datetime: '2026/02/20 10:00',
          host: 'admin',
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('creates event and persists ticketTokenAmount (number/string)', async () => {
    const numberRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'number amount',
          datetime: '2026/02/20 11:00',
          host: 'admin',
          ticketTokenAmount: 3,
        }),
      })
    );

    expect(numberRes.status).toBe(201);
    const createdNumber = (await numberRes.json()) as { id: string; ticketTokenAmount?: number };
    expect(createdNumber.ticketTokenAmount).toBe(3);

    const stringRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'string amount',
          datetime: '2026/02/20 12:00',
          host: 'admin',
          ticketTokenAmount: '7',
        }),
      })
    );

    expect(stringRes.status).toBe(201);
    const createdString = (await stringRes.json()) as { id: string; ticketTokenAmount?: number };
    expect(createdString.ticketTokenAmount).toBe(7);

    const detailRes = await store.fetch(
      new Request(`https://example.com/v1/school/events/${encodeURIComponent(createdString.id)}`, {
        method: 'GET',
      })
    );
    const detail = (await detailRes.json()) as { ticketTokenAmount?: number };
    expect(detail.ticketTokenAmount).toBe(7);
  });
});
