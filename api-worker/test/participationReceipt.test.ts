import { beforeEach, describe, expect, it } from 'vitest';
import { SchoolStore, type Env } from '../src/storeDO';
import type { ParticipationTicketReceipt } from '../src/types';

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

describe('participation audit receipt', () => {
  let state: MockDurableObjectState;
  let env: Env;
  let store: SchoolStore;
  const adminHeaders = {
    'content-type': 'application/json',
    Authorization: 'Bearer master-secret',
  };

  beforeEach(() => {
    state = new MockDurableObjectState();
    env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      ENFORCE_ONCHAIN_POP: 'false',
    };
    // @ts-expect-error mock for DurableObjectState
    store = new SchoolStore(state, env);
  });

  async function prepareEventAndUser(): Promise<{ eventId: string; userId: string }> {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'receipt event',
          datetime: '2026/02/22 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const event = (await createRes.json()) as { id: string };

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: 'receipt-user',
          pin: '1234',
        }),
      })
    );
    expect(registerRes.status).toBe(200);
    const user = (await registerRes.json()) as { userId: string };

    return { eventId: event.id, userId: user.userId };
  }

  it('returns immutable participation ticket receipt on claim', async () => {
    const { eventId, userId } = await prepareEventAndUser();

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const body = (await claimRes.json()) as {
      status: string;
      confirmationCode: string;
      ticketReceipt?: ParticipationTicketReceipt;
    };

    expect(body.status).toBe('created');
    expect(typeof body.confirmationCode).toBe('string');
    expect(body.ticketReceipt).toBeDefined();
    expect(body.ticketReceipt?.type).toBe('participation_audit_receipt');
    expect(body.ticketReceipt?.confirmationCode).toBe(body.confirmationCode);
    expect(body.ticketReceipt?.audit.event).toBe('USER_CLAIM');
    expect(body.ticketReceipt?.audit.eventId).toBe(eventId);
  });

  it('returns ticket receipt on /v1/school/claims and supports verify-by-code', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'school receipt event',
          datetime: '2026/02/22 11:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const event = (await createRes.json()) as { id: string };

    const claimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          joinToken: 'student-join-token',
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as {
      success: boolean;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
    };
    expect(claimBody.success).toBe(true);
    expect(typeof claimBody.confirmationCode).toBe('string');
    expect(claimBody.ticketReceipt?.type).toBe('participation_audit_receipt');
    expect(claimBody.ticketReceipt?.confirmationCode).toBe(claimBody.confirmationCode);

    const verifyRes = await store.fetch(
      new Request('https://example.com/api/audit/receipts/verify-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          confirmationCode: claimBody.confirmationCode,
        }),
      })
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as {
      ok: boolean;
      receipt?: ParticipationTicketReceipt;
      verification?: { ok?: boolean };
    };
    expect(verifyBody.ok).toBe(true);
    expect(verifyBody.receipt?.confirmationCode).toBe(claimBody.confirmationCode);
    expect(verifyBody.verification?.ok).toBe(true);
  });

  it('verifies ticket receipt and detects tampering', async () => {
    const { eventId, userId } = await prepareEventAndUser();

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
        }),
      })
    );
    const claimBody = (await claimRes.json()) as {
      confirmationCode: string;
      ticketReceipt?: ParticipationTicketReceipt;
    };
    const receipt = claimBody.ticketReceipt;
    expect(receipt).toBeDefined();

    const verifyRes = await store.fetch(
      new Request('https://example.com/api/audit/receipts/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receipt }),
      })
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as {
      ok: boolean;
      checks: { entryExists?: boolean; entryHashValid?: boolean; confirmationCodeMatches?: boolean };
    };
    expect(verifyBody.ok).toBe(true);
    expect(verifyBody.checks.entryExists).toBe(true);
    expect(verifyBody.checks.entryHashValid).toBe(true);
    expect(verifyBody.checks.confirmationCodeMatches).toBe(true);

    const tamperedReceipt: ParticipationTicketReceipt = {
      ...(receipt as ParticipationTicketReceipt),
      confirmationCode: 'TAMPER1',
    };
    const verifyTamperedRes = await store.fetch(
      new Request('https://example.com/api/audit/receipts/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receipt: tamperedReceipt }),
      })
    );
    expect(verifyTamperedRes.status).toBe(409);
    const tamperedBody = (await verifyTamperedRes.json()) as {
      ok: boolean;
      issues: Array<{ code?: string }>;
    };
    expect(tamperedBody.ok).toBe(false);
    expect(tamperedBody.issues.some((issue) => issue.code === 'receipt_hash_mismatch')).toBe(true);
    expect(tamperedBody.issues.some((issue) => issue.code === 'confirmation_code_mismatch')).toBe(true);
  });
});
