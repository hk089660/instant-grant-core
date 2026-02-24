import { beforeEach, describe, expect, it, vi } from 'vitest';
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
          userId: 'receipt-user',
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

  it('syncs user tickets on login with off-chain and on-chain proof fields', async () => {
    const { eventId, userId } = await prepareEventAndUser();

    const offchainClaimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
        }),
      })
    );
    expect(offchainClaimRes.status).toBe(200);

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
          walletAddress: '4'.repeat(32),
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as {
      confirmationCode: string;
      ticketReceipt?: ParticipationTicketReceipt;
    };
    expect(claimBody.confirmationCode).toBeDefined();

    const syncRes = await store.fetch(
      new Request('https://example.com/api/users/tickets/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
        }),
      })
    );
    expect(syncRes.status).toBe(200);
    const syncBody = (await syncRes.json()) as {
      syncedAt?: string;
      tickets?: Array<{
        eventId: string;
        eventName: string;
        claimedAt: number;
        confirmationCode?: string;
        auditReceiptId?: string;
        auditReceiptHash?: string;
        txSignature?: string;
        receiptPubkey?: string;
      }>;
    };
    expect(typeof syncBody.syncedAt).toBe('string');
    expect(Array.isArray(syncBody.tickets)).toBe(true);
    const syncedTicket = syncBody.tickets?.find((ticket) => ticket.eventId === eventId);
    expect(syncedTicket).toBeTruthy();
    expect(syncedTicket?.eventName).toBe('receipt event');
    expect(syncedTicket?.confirmationCode).toBe(claimBody.confirmationCode);
    expect(syncedTicket?.auditReceiptId).toBe(claimBody.ticketReceipt?.receiptId);
    expect(syncedTicket?.auditReceiptHash).toBe(claimBody.ticketReceipt?.receiptHash);
    expect(syncedTicket?.txSignature).toBe('5'.repeat(64));
    expect(syncedTicket?.receiptPubkey).toBe('6'.repeat(32));
  });

  it('rejects on-chain proof before off-chain receipt is issued', async () => {
    const { eventId, userId } = await prepareEventAndUser();

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
          walletAddress: '4'.repeat(32),
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(claimRes.status).toBe(409);
    const body = (await claimRes.json()) as { code?: string };
    expect(body.code).toBe('offchain_receipt_required');
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

  it('rejects duplicate userId at registration', async () => {
    const firstRegisterRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'dup-user',
          displayName: 'dup-user-1',
          pin: '1234',
        }),
      })
    );
    expect(firstRegisterRes.status).toBe(200);

    const duplicateRegisterRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'DUP-USER',
          displayName: 'dup-user-2',
          pin: '1234',
        }),
      })
    );
    expect(duplicateRegisterRes.status).toBe(409);
    const duplicateBody = (await duplicateRegisterRes.json()) as { code?: string };
    expect(duplicateBody.code).toBe('duplicate_user_id');
  });

  it('retries when generated confirmation code collides and keeps 6-char random rule', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'collision event',
          datetime: '2026/02/22 12:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const event = (await createRes.json()) as { id: string };

    const registerUser = async (userId: string, displayName: string): Promise<string> => {
      const registerRes = await store.fetch(
        new Request('https://example.com/api/users/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId,
            displayName,
            pin: '1234',
          }),
        })
      );
      expect(registerRes.status).toBe(200);
      const body = (await registerRes.json()) as { userId: string };
      return body.userId;
    };

    const userA = await registerUser('collision-user-a', 'collision-user-a');
    const userB = await registerUser('collision-user-b', 'collision-user-b');

    const getRandomValuesSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    let callCount = 0;
    getRandomValuesSpy.mockImplementation(((array: Uint8Array) => {
      callCount += 1;
      // 1回目: AAAAAA を発行
      // 2回目: 同じ AAAAAA を再生成して衝突
      // 3回目: BBBBBB を再生成して回避
      const fill = callCount <= 2 ? 0 : 1;
      array.fill(fill);
      return array;
    }) as typeof globalThis.crypto.getRandomValues);

    try {
      const firstClaimRes = await store.fetch(
        new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: userA,
            pin: '1234',
          }),
        })
      );
      expect(firstClaimRes.status).toBe(200);
      const firstClaimBody = (await firstClaimRes.json()) as { confirmationCode?: string };
      expect(firstClaimBody.confirmationCode).toBe('AAAAAA');

      const secondClaimRes = await store.fetch(
        new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: userB,
            pin: '1234',
          }),
        })
      );
      expect(secondClaimRes.status).toBe(200);
      const secondClaimBody = (await secondClaimRes.json()) as { confirmationCode?: string };
      expect(secondClaimBody.confirmationCode).toBe('BBBBBB');
      expect(secondClaimBody.confirmationCode).not.toBe(firstClaimBody.confirmationCode);
    } finally {
      getRandomValuesSpy.mockRestore();
    }
  });
});
