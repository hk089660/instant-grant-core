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
    const offchainClaimBody = (await offchainClaimRes.json()) as {
      confirmationCode?: string;
    };
    expect(typeof offchainClaimBody.confirmationCode).toBe('string');
    await state.storage.delete(`ticket_receipt:${eventId}:${offchainClaimBody.confirmationCode as string}`);
    await state.storage.delete(`ticket_receipt_subject:${eventId}:${userId}`);

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
          walletAddress: '4'.repeat(32),
          confirmationCode: offchainClaimBody.confirmationCode,
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as {
      confirmationCode: string;
      ticketReceipt?: ParticipationTicketReceipt;
      txSignature?: string;
      receiptPubkey?: string;
      explorerTxUrl?: string;
    };
    expect(claimBody.confirmationCode).toBeDefined();
    expect(claimBody.txSignature).toBe('5'.repeat(64));
    expect(claimBody.receiptPubkey).toBe('6'.repeat(32));
    expect(claimBody.explorerTxUrl).toContain('https://explorer.solana.com/tx/');
    expect(claimBody.explorerTxUrl).toContain('cluster=devnet');

    const replayRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
        }),
      })
    );
    expect(replayRes.status).toBe(200);
    const replayBody = (await replayRes.json()) as {
      status?: string;
      txSignature?: string;
      receiptPubkey?: string;
      explorerTxUrl?: string;
    };
    expect(replayBody.status).toBe('already');
    expect(replayBody.txSignature).toBe('5'.repeat(64));
    expect(replayBody.receiptPubkey).toBe('6'.repeat(32));
    expect(replayBody.explorerTxUrl).toContain('https://explorer.solana.com/tx/');

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

  it('recovers on-chain audit sync when existing user receipt verification fails', async () => {
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
    const offchainClaimBody = (await offchainClaimRes.json()) as {
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
    };
    expect(typeof offchainClaimBody.confirmationCode).toBe('string');
    expect(offchainClaimBody.ticketReceipt).toBeTruthy();

    const tamperedReceipt: ParticipationTicketReceipt = {
      ...(offchainClaimBody.ticketReceipt as ParticipationTicketReceipt),
      receiptHash: 'broken-hash',
    };
    await state.storage.put(`ticket_receipt:${eventId}:${offchainClaimBody.confirmationCode as string}`, tamperedReceipt);
    await state.storage.put(`ticket_receipt_subject:${eventId}:${userId}`, tamperedReceipt);

    const onchainSyncRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
          confirmationCode: offchainClaimBody.confirmationCode,
          walletAddress: '4'.repeat(32),
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(onchainSyncRes.status).toBe(200);
    const onchainSyncBody = (await onchainSyncRes.json()) as {
      status?: string;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      txSignature?: string;
      receiptPubkey?: string;
    };
    expect(onchainSyncBody.status).toBe('already');
    expect(onchainSyncBody.txSignature).toBe('5'.repeat(64));
    expect(onchainSyncBody.receiptPubkey).toBe('6'.repeat(32));
    expect(onchainSyncBody.ticketReceipt?.receiptHash).not.toBe('broken-hash');

    const transferRes = await store.fetch(
      new Request(`https://example.com/api/admin/transfers?eventId=${encodeURIComponent(eventId)}&limit=50`, {
        method: 'GET',
        headers: { Authorization: 'Bearer master-secret' },
      })
    );
    expect(transferRes.status).toBe(200);
    const transferBody = (await transferRes.json()) as {
      items?: Array<{
        event: string;
        transfer: {
          txSignature: string | null;
          receiptPubkey: string | null;
        };
      }>;
    };
    const onchainUserClaim = transferBody.items?.find(
      (item) => item.event === 'USER_CLAIM' && item.transfer.txSignature === '5'.repeat(64)
    );
    expect(onchainUserClaim).toBeTruthy();
    expect(onchainUserClaim?.transfer.receiptPubkey).toBe('6'.repeat(32));
  });

  it('records on-chain proof for already joined /v1/school/claims and returns proof fields', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'school wallet claim event',
          datetime: '2026/02/23 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const event = (await createRes.json()) as { id: string };

    const walletAddress = '4'.repeat(32);
    const firstClaimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
        }),
      })
    );
    expect(firstClaimRes.status).toBe(200);
    const firstClaimBody = (await firstClaimRes.json()) as {
      success: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
    };
    expect(firstClaimBody.success).toBe(true);
    expect(firstClaimBody.alreadyJoined).toBeFalsy();
    expect(typeof firstClaimBody.confirmationCode).toBe('string');
    await state.storage.delete(`ticket_receipt:${event.id}:${firstClaimBody.confirmationCode as string}`);
    await state.storage.delete(`ticket_receipt_subject:${event.id}:${walletAddress}`);

    const secondClaimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
          confirmationCode: firstClaimBody.confirmationCode,
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(secondClaimRes.status).toBe(200);
    const secondClaimBody = (await secondClaimRes.json()) as {
      success: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      txSignature?: string;
      receiptPubkey?: string;
      explorerTxUrl?: string;
    };
    expect(secondClaimBody.success).toBe(true);
    expect(secondClaimBody.alreadyJoined).toBe(true);
    expect(secondClaimBody.confirmationCode).toBe(firstClaimBody.confirmationCode);
    expect(secondClaimBody.txSignature).toBe('5'.repeat(64));
    expect(secondClaimBody.receiptPubkey).toBe('6'.repeat(32));
    expect(secondClaimBody.explorerTxUrl).toContain('https://explorer.solana.com/tx/');
    expect(secondClaimBody.ticketReceipt?.confirmationCode).toBe(firstClaimBody.confirmationCode);

    const replayClaimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
        }),
      })
    );
    expect(replayClaimRes.status).toBe(200);
    const replayClaimBody = (await replayClaimRes.json()) as {
      success: boolean;
      alreadyJoined?: boolean;
      txSignature?: string;
      receiptPubkey?: string;
      explorerTxUrl?: string;
    };
    expect(replayClaimBody.success).toBe(true);
    expect(replayClaimBody.alreadyJoined).toBe(true);
    expect(replayClaimBody.txSignature).toBe('5'.repeat(64));
    expect(replayClaimBody.receiptPubkey).toBe('6'.repeat(32));
    expect(replayClaimBody.explorerTxUrl).toContain('https://explorer.solana.com/tx/');

    const transferRes = await store.fetch(
      new Request(`https://example.com/api/admin/transfers?eventId=${encodeURIComponent(event.id)}&limit=50`, {
        method: 'GET',
        headers: { Authorization: 'Bearer master-secret' },
      })
    );
    expect(transferRes.status).toBe(200);
    const transferBody = (await transferRes.json()) as {
      items?: Array<{
        event: string;
        transfer: {
          txSignature: string | null;
          receiptPubkey: string | null;
        };
      }>;
    };
    const onchainWalletClaim = transferBody.items?.find(
      (item) => item.event === 'WALLET_CLAIM' && item.transfer.txSignature === '5'.repeat(64)
    );
    expect(onchainWalletClaim).toBeTruthy();
    expect(onchainWalletClaim?.transfer.receiptPubkey).toBe('6'.repeat(32));
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

  it('counts remaining user claims from confirmed on-chain receipts and reuses pending off-chain receipt', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'user on-chain quota event',
          datetime: '2026/02/25 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
          claimIntervalDays: 30,
          maxClaimsPerInterval: 2,
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
          userId: 'quota-user',
          displayName: 'Quota User',
          pin: '1234',
        }),
      })
    );
    expect(registerRes.status).toBe(200);

    const firstOffchainRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'quota-user',
          pin: '1234',
        }),
      })
    );
    expect(firstOffchainRes.status).toBe(200);
    const firstOffchainBody = (await firstOffchainRes.json()) as {
      status?: string;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(firstOffchainBody.status).toBe('created');
    expect(typeof firstOffchainBody.confirmationCode).toBe('string');
    expect(firstOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(0);
    expect(firstOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(2);

    const pendingOffchainRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'quota-user',
          pin: '1234',
        }),
      })
    );
    expect(pendingOffchainRes.status).toBe(200);
    const pendingOffchainBody = (await pendingOffchainRes.json()) as {
      status?: string;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(pendingOffchainBody.status).toBe('already');
    expect(pendingOffchainBody.confirmationCode).toBe(firstOffchainBody.confirmationCode);
    expect(pendingOffchainBody.ticketReceipt?.receiptId).toBe(firstOffchainBody.ticketReceipt?.receiptId);
    expect(pendingOffchainBody.ticketReceipt?.receiptHash).toBe(firstOffchainBody.ticketReceipt?.receiptHash);
    expect(pendingOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(0);
    expect(pendingOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(2);

    const firstOnchainSyncRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'quota-user',
          pin: '1234',
          walletAddress: '4'.repeat(32),
          confirmationCode: firstOffchainBody.confirmationCode,
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(firstOnchainSyncRes.status).toBe(200);
    const firstOnchainSyncBody = (await firstOnchainSyncRes.json()) as {
      status?: string;
      confirmationCode?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
        canClaimNow?: boolean;
      };
    };
    expect(firstOnchainSyncBody.status).toBe('already');
    expect(firstOnchainSyncBody.confirmationCode).toBe(firstOffchainBody.confirmationCode);
    expect(firstOnchainSyncBody.claimQuota?.claimsUsedInCurrentInterval).toBe(1);
    expect(firstOnchainSyncBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(1);
    expect(firstOnchainSyncBody.claimQuota?.canClaimNow).toBe(true);

    const secondOffchainRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'quota-user',
          pin: '1234',
        }),
      })
    );
    expect(secondOffchainRes.status).toBe(200);
    const secondOffchainBody = (await secondOffchainRes.json()) as {
      status?: string;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      txSignature?: string;
      receiptPubkey?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(secondOffchainBody.status).toBe('created');
    expect(secondOffchainBody.confirmationCode).toBeDefined();
    expect(secondOffchainBody.confirmationCode).not.toBe(firstOffchainBody.confirmationCode);
    expect(secondOffchainBody.txSignature).toBeUndefined();
    expect(secondOffchainBody.receiptPubkey).toBeUndefined();
    expect(secondOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(1);
    expect(secondOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(1);

    const secondPendingOffchainRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'quota-user',
          pin: '1234',
        }),
      })
    );
    expect(secondPendingOffchainRes.status).toBe(200);
    const secondPendingOffchainBody = (await secondPendingOffchainRes.json()) as {
      status?: string;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      txSignature?: string;
      receiptPubkey?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(secondPendingOffchainBody.status).toBe('already');
    expect(secondPendingOffchainBody.confirmationCode).toBe(secondOffchainBody.confirmationCode);
    expect(secondPendingOffchainBody.ticketReceipt?.receiptId).toBe(secondOffchainBody.ticketReceipt?.receiptId);
    expect(secondPendingOffchainBody.ticketReceipt?.receiptHash).toBe(secondOffchainBody.ticketReceipt?.receiptHash);
    expect(secondPendingOffchainBody.txSignature).toBeUndefined();
    expect(secondPendingOffchainBody.receiptPubkey).toBeUndefined();
    expect(secondPendingOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(1);
    expect(secondPendingOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(1);

    const secondOnchainSyncRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'quota-user',
          pin: '1234',
          walletAddress: '7'.repeat(32),
          confirmationCode: secondOffchainBody.confirmationCode,
          txSignature: '8'.repeat(64),
          receiptPubkey: '9'.repeat(32),
        }),
      })
    );
    expect(secondOnchainSyncRes.status).toBe(200);
    const secondOnchainSyncBody = (await secondOnchainSyncRes.json()) as {
      status?: string;
      confirmationCode?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
        canClaimNow?: boolean;
      };
    };
    expect(secondOnchainSyncBody.status).toBe('already');
    expect(secondOnchainSyncBody.confirmationCode).toBe(secondOffchainBody.confirmationCode);
    expect(secondOnchainSyncBody.claimQuota?.claimsUsedInCurrentInterval).toBe(2);
    expect(secondOnchainSyncBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(0);
    expect(secondOnchainSyncBody.claimQuota?.canClaimNow).toBe(false);

    const exhaustedRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'quota-user',
          pin: '1234',
        }),
      })
    );
    expect(exhaustedRes.status).toBe(200);
    const exhaustedBody = (await exhaustedRes.json()) as {
      status?: string;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
        canClaimNow?: boolean;
      };
    };
    expect(exhaustedBody.status).toBe('already');
    expect(exhaustedBody.confirmationCode).toBe(secondOffchainBody.confirmationCode);
    expect(exhaustedBody.ticketReceipt?.receiptId).toBe(secondOffchainBody.ticketReceipt?.receiptId);
    expect(exhaustedBody.claimQuota?.claimsUsedInCurrentInterval).toBe(2);
    expect(exhaustedBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(0);
    expect(exhaustedBody.claimQuota?.canClaimNow).toBe(false);
  });

  it('counts remaining wallet claims from confirmed on-chain receipts and reuses pending off-chain receipt', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'wallet on-chain quota event',
          datetime: '2026/02/26 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
          claimIntervalDays: 30,
          maxClaimsPerInterval: 2,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const event = (await createRes.json()) as { id: string };
    const walletAddress = '4'.repeat(32);

    const firstOffchainRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
        }),
      })
    );
    expect(firstOffchainRes.status).toBe(200);
    const firstOffchainBody = (await firstOffchainRes.json()) as {
      success?: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(firstOffchainBody.success).toBe(true);
    expect(firstOffchainBody.alreadyJoined).toBe(false);
    expect(typeof firstOffchainBody.confirmationCode).toBe('string');
    expect(firstOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(0);
    expect(firstOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(2);

    const pendingOffchainRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
        }),
      })
    );
    expect(pendingOffchainRes.status).toBe(200);
    const pendingOffchainBody = (await pendingOffchainRes.json()) as {
      success?: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(pendingOffchainBody.success).toBe(true);
    expect(pendingOffchainBody.alreadyJoined).toBe(true);
    expect(pendingOffchainBody.confirmationCode).toBe(firstOffchainBody.confirmationCode);
    expect(pendingOffchainBody.ticketReceipt?.receiptId).toBe(firstOffchainBody.ticketReceipt?.receiptId);
    expect(pendingOffchainBody.ticketReceipt?.receiptHash).toBe(firstOffchainBody.ticketReceipt?.receiptHash);
    expect(pendingOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(0);
    expect(pendingOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(2);

    const firstOnchainSyncRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
          confirmationCode: firstOffchainBody.confirmationCode,
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(firstOnchainSyncRes.status).toBe(200);
    const firstOnchainSyncBody = (await firstOnchainSyncRes.json()) as {
      success?: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
        canClaimNow?: boolean;
      };
    };
    expect(firstOnchainSyncBody.success).toBe(true);
    expect(firstOnchainSyncBody.alreadyJoined).toBe(true);
    expect(firstOnchainSyncBody.confirmationCode).toBe(firstOffchainBody.confirmationCode);
    expect(firstOnchainSyncBody.claimQuota?.claimsUsedInCurrentInterval).toBe(1);
    expect(firstOnchainSyncBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(1);
    expect(firstOnchainSyncBody.claimQuota?.canClaimNow).toBe(true);

    const secondOffchainRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
        }),
      })
    );
    expect(secondOffchainRes.status).toBe(200);
    const secondOffchainBody = (await secondOffchainRes.json()) as {
      success?: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      txSignature?: string;
      receiptPubkey?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(secondOffchainBody.success).toBe(true);
    expect(secondOffchainBody.alreadyJoined).toBe(false);
    expect(secondOffchainBody.confirmationCode).toBeDefined();
    expect(secondOffchainBody.confirmationCode).not.toBe(firstOffchainBody.confirmationCode);
    expect(secondOffchainBody.txSignature).toBeUndefined();
    expect(secondOffchainBody.receiptPubkey).toBeUndefined();
    expect(secondOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(1);
    expect(secondOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(1);

    const secondPendingOffchainRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
        }),
      })
    );
    expect(secondPendingOffchainRes.status).toBe(200);
    const secondPendingOffchainBody = (await secondPendingOffchainRes.json()) as {
      success?: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      txSignature?: string;
      receiptPubkey?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
      };
    };
    expect(secondPendingOffchainBody.success).toBe(true);
    expect(secondPendingOffchainBody.alreadyJoined).toBe(true);
    expect(secondPendingOffchainBody.confirmationCode).toBe(secondOffchainBody.confirmationCode);
    expect(secondPendingOffchainBody.ticketReceipt?.receiptId).toBe(secondOffchainBody.ticketReceipt?.receiptId);
    expect(secondPendingOffchainBody.ticketReceipt?.receiptHash).toBe(secondOffchainBody.ticketReceipt?.receiptHash);
    expect(secondPendingOffchainBody.txSignature).toBeUndefined();
    expect(secondPendingOffchainBody.receiptPubkey).toBeUndefined();
    expect(secondPendingOffchainBody.claimQuota?.claimsUsedInCurrentInterval).toBe(1);
    expect(secondPendingOffchainBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(1);

    const secondOnchainSyncRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
          confirmationCode: secondOffchainBody.confirmationCode,
          txSignature: '7'.repeat(64),
          receiptPubkey: '8'.repeat(32),
        }),
      })
    );
    expect(secondOnchainSyncRes.status).toBe(200);
    const secondOnchainSyncBody = (await secondOnchainSyncRes.json()) as {
      success?: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
        canClaimNow?: boolean;
      };
    };
    expect(secondOnchainSyncBody.success).toBe(true);
    expect(secondOnchainSyncBody.alreadyJoined).toBe(true);
    expect(secondOnchainSyncBody.confirmationCode).toBe(secondOffchainBody.confirmationCode);
    expect(secondOnchainSyncBody.claimQuota?.claimsUsedInCurrentInterval).toBe(2);
    expect(secondOnchainSyncBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(0);
    expect(secondOnchainSyncBody.claimQuota?.canClaimNow).toBe(false);

    const exhaustedRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          walletAddress,
        }),
      })
    );
    expect(exhaustedRes.status).toBe(200);
    const exhaustedBody = (await exhaustedRes.json()) as {
      success?: boolean;
      alreadyJoined?: boolean;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
      claimQuota?: {
        claimsUsedInCurrentInterval?: number;
        remainingClaimsInCurrentInterval?: number | null;
        canClaimNow?: boolean;
      };
    };
    expect(exhaustedBody.success).toBe(true);
    expect(exhaustedBody.alreadyJoined).toBe(true);
    expect(exhaustedBody.confirmationCode).toBe(secondOffchainBody.confirmationCode);
    expect(exhaustedBody.ticketReceipt?.receiptId).toBe(secondOffchainBody.ticketReceipt?.receiptId);
    expect(exhaustedBody.claimQuota?.claimsUsedInCurrentInterval).toBe(2);
    expect(exhaustedBody.claimQuota?.remainingClaimsInCurrentInterval).toBe(0);
    expect(exhaustedBody.claimQuota?.canClaimNow).toBe(false);
  });

  it('links on-chain proof to existing confirmation code even when policy still allows additional claims', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'policy sync event',
          datetime: '2026/02/24 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
          claimIntervalDays: 30,
          maxClaimsPerInterval: 2,
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
          userId: 'policy-user',
          displayName: 'Policy User',
          pin: '1234',
        }),
      })
    );
    expect(registerRes.status).toBe(200);

    const firstClaimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'policy-user',
          pin: '1234',
        }),
      })
    );
    expect(firstClaimRes.status).toBe(200);
    const firstClaimBody = (await firstClaimRes.json()) as {
      status?: string;
      confirmationCode?: string;
      ticketReceipt?: ParticipationTicketReceipt;
    };
    expect(firstClaimBody.status).toBe('created');
    expect(typeof firstClaimBody.confirmationCode).toBe('string');

    const onchainSyncRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(event.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'policy-user',
          pin: '1234',
          walletAddress: '4'.repeat(32),
          confirmationCode: firstClaimBody.confirmationCode,
          txSignature: '5'.repeat(64),
          receiptPubkey: '6'.repeat(32),
        }),
      })
    );
    expect(onchainSyncRes.status).toBe(200);
    const onchainSyncBody = (await onchainSyncRes.json()) as {
      status?: string;
      confirmationCode?: string;
      txSignature?: string;
      receiptPubkey?: string;
    };
    expect(onchainSyncBody.status).toBe('already');
    expect(onchainSyncBody.confirmationCode).toBe(firstClaimBody.confirmationCode);
    expect(onchainSyncBody.txSignature).toBe('5'.repeat(64));
    expect(onchainSyncBody.receiptPubkey).toBe('6'.repeat(32));

    const transferRes = await store.fetch(
      new Request(`https://example.com/api/admin/transfers?eventId=${encodeURIComponent(event.id)}&limit=50`, {
        method: 'GET',
        headers: { Authorization: 'Bearer master-secret' },
      })
    );
    expect(transferRes.status).toBe(200);
    const transferBody = (await transferRes.json()) as {
      items?: Array<{
        event: string;
        transfer: {
          txSignature: string | null;
          receiptPubkey: string | null;
        };
      }>;
    };
    const onchainUserClaim = transferBody.items?.find(
      (item) => item.event === 'USER_CLAIM' && item.transfer.txSignature === '5'.repeat(64)
    );
    expect(onchainUserClaim).toBeTruthy();
    expect(onchainUserClaim?.transfer.receiptPubkey).toBe('6'.repeat(32));
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
