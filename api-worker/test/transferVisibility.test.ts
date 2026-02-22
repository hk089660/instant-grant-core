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

interface TransferLogItem {
  event: string;
  eventId: string;
  transfer: {
    sender: { type: string; id: string };
    recipient: { type: string; id: string };
    mode: 'onchain' | 'offchain';
    amount: number | null;
    mint: string | null;
    txSignature: string | null;
    receiptPubkey: string | null;
  };
  pii?: Record<string, string>;
}

describe('transfer visibility role levels (master > admin)', () => {
  let state: MockDurableObjectState;
  let store: SchoolStore;

  const masterToken = 'master-secret';
  const authority = 'So11111111111111111111111111111111111111112';
  const mint = 'So11111111111111111111111111111111111111112';
  const claimerWallet = '11111111111111111111111111111111';

  async function createEvent(): Promise<string> {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({
          title: 'transfer audit event',
          datetime: '2026/02/21 10:00',
          host: 'admin',
          ticketTokenAmount: 3,
          solanaMint: mint,
          solanaAuthority: authority,
          solanaGrantId: 'grant-1',
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id?: string };
    expect(typeof created.id).toBe('string');
    return created.id as string;
  }

  async function createAdminInvite(): Promise<string> {
    const inviteRes = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ name: 'Admin A' }),
      })
    );
    expect(inviteRes.status).toBe(200);
    const invite = (await inviteRes.json()) as { code?: string };
    expect(typeof invite.code).toBe('string');
    return invite.code as string;
  }

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

  it('admin can read transfer sender/recipient IDs but not pii', async () => {
    const eventId = await createEvent();

    const walletClaimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          walletAddress: claimerWallet,
        }),
      })
    );
    expect(walletClaimRes.status).toBe(200);

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'User A', pin: '1234' }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registerBody = (await registerRes.json()) as { userId?: string };
    const userId = registerBody.userId as string;

    const userClaimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, pin: '1234' }),
      })
    );
    expect(userClaimRes.status).toBe(200);

    const adminToken = await createAdminInvite();
    const adminTransfersRes = await store.fetch(
      new Request(`https://example.com/api/admin/transfers?eventId=${encodeURIComponent(eventId)}&limit=20`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );
    expect(adminTransfersRes.status).toBe(200);

    const adminBody = (await adminTransfersRes.json()) as {
      roleView?: string;
      strictLevel?: string;
      items?: TransferLogItem[];
    };
    expect(adminBody.roleView).toBe('admin');
    expect(adminBody.strictLevel).toBe('admin_transfer_visible_no_pii');
    expect(Array.isArray(adminBody.items)).toBe(true);

    const walletEntry = adminBody.items?.find((item) => item.event === 'WALLET_CLAIM');
    expect(walletEntry).toBeTruthy();
    expect(walletEntry?.transfer.sender.id).toBe(authority);
    expect(walletEntry?.transfer.recipient.id).toBe(claimerWallet);
    expect(walletEntry?.pii).toBeUndefined();

    const userEntry = adminBody.items?.find((item) => item.event === 'USER_CLAIM');
    expect(userEntry).toBeTruthy();
    expect(userEntry?.transfer.recipient.type).toBe('user');
    expect(userEntry?.transfer.recipient.id).toBe(userId);
    expect(userEntry?.pii).toBeUndefined();
  });

  it('master can read full transfer records including pii; admin token is rejected on master route', async () => {
    const eventId = await createEvent();

    const walletClaimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          walletAddress: claimerWallet,
        }),
      })
    );
    expect(walletClaimRes.status).toBe(200);

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'User B', pin: '1234' }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registerBody = (await registerRes.json()) as { userId?: string };
    const userId = registerBody.userId as string;

    const userClaimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, pin: '1234' }),
      })
    );
    expect(userClaimRes.status).toBe(200);

    const adminToken = await createAdminInvite();
    const adminMasterRes = await store.fetch(
      new Request(`https://example.com/api/master/transfers?eventId=${encodeURIComponent(eventId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );
    expect(adminMasterRes.status).toBe(401);

    const masterTransfersRes = await store.fetch(
      new Request(`https://example.com/api/master/transfers?eventId=${encodeURIComponent(eventId)}&limit=20`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(masterTransfersRes.status).toBe(200);
    const masterBody = (await masterTransfersRes.json()) as {
      roleView?: string;
      strictLevel?: string;
      items?: TransferLogItem[];
    };
    expect(masterBody.roleView).toBe('master');
    expect(masterBody.strictLevel).toBe('master_full');

    const walletEntry = masterBody.items?.find((item) => item.event === 'WALLET_CLAIM');
    expect(walletEntry).toBeTruthy();
    expect(walletEntry?.transfer.sender.id).toBe(authority);
    expect(walletEntry?.transfer.recipient.id).toBe(claimerWallet);
    expect(walletEntry?.pii?.walletAddress).toBe(claimerWallet);

    const userEntry = masterBody.items?.find((item) => item.event === 'USER_CLAIM');
    expect(userEntry).toBeTruthy();
    expect(userEntry?.transfer.recipient.id).toBe(userId);
    expect(userEntry?.pii?.userId).toBe(userId);
    expect(userEntry?.pii?.displayName).toBe('User B');
  });

  it('rejects unauthenticated transfer endpoint access', async () => {
    const adminRes = await store.fetch(
      new Request('https://example.com/api/admin/transfers', { method: 'GET' })
    );
    expect(adminRes.status).toBe(401);

    const masterRes = await store.fetch(
      new Request('https://example.com/api/master/transfers', { method: 'GET' })
    );
    expect(masterRes.status).toBe(401);
  });
});
