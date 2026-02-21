import { beforeEach, describe, expect, it } from 'vitest';
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
  const adminHeaders = {
    'content-type': 'application/json',
    Authorization: 'Bearer master-secret',
  };

  beforeEach(() => {
    state = new MockDurableObjectState();
    const popSigner = nacl.sign.keyPair();
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      POP_SIGNER_SECRET_KEY_B64: Buffer.from(popSigner.secretKey).toString('base64'),
      POP_SIGNER_PUBKEY: bs58.encode(popSigner.publicKey),
    };
    // @ts-expect-error mock for DurableObjectState
    store = new SchoolStore(state, env);
  });

  it('rejects when ticketTokenAmount is missing', async () => {
    const res = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
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
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'number amount',
          datetime: '2026/02/20 11:00',
          host: 'admin',
          ticketTokenAmount: 3,
        }),
      })
    );

    expect(numberRes.status).toBe(201);
    const createdNumber = (await numberRes.json()) as {
      id: string;
      ticketTokenAmount?: number;
      claimIntervalDays?: number;
      maxClaimsPerInterval?: number | null;
    };
    expect(createdNumber.ticketTokenAmount).toBe(3);
    expect(createdNumber.claimIntervalDays).toBe(30);
    expect(createdNumber.maxClaimsPerInterval).toBe(1);

    const stringRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'string amount',
          datetime: '2026/02/20 12:00',
          host: 'admin',
          ticketTokenAmount: '7',
        }),
      })
    );

    expect(stringRes.status).toBe(201);
    const createdString = (await stringRes.json()) as {
      id: string;
      ticketTokenAmount?: number;
      claimIntervalDays?: number;
      maxClaimsPerInterval?: number | null;
    };
    expect(createdString.ticketTokenAmount).toBe(7);
    expect(createdString.claimIntervalDays).toBe(30);
    expect(createdString.maxClaimsPerInterval).toBe(1);

    const detailRes = await store.fetch(
      new Request(`https://example.com/v1/school/events/${encodeURIComponent(createdString.id)}`, {
        method: 'GET',
      })
    );
    const detail = (await detailRes.json()) as {
      ticketTokenAmount?: number;
      claimIntervalDays?: number;
      maxClaimsPerInterval?: number | null;
    };
    expect(detail.ticketTokenAmount).toBe(7);
    expect(detail.claimIntervalDays).toBe(30);
    expect(detail.maxClaimsPerInterval).toBe(1);
  });

  it('accepts custom claim policy (interval + unlimited)', async () => {
    const res = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'policy event',
          datetime: '2026/02/20 13:00',
          host: 'admin',
          ticketTokenAmount: 2,
          claimIntervalDays: 14,
          maxClaimsPerInterval: null,
        }),
      })
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as {
      id: string;
      claimIntervalDays?: number;
      maxClaimsPerInterval?: number | null;
    };
    expect(created.claimIntervalDays).toBe(14);
    expect(created.maxClaimsPerInterval).toBeNull();
  });

  it('serves token metadata JSON for issued mint', async () => {
    const mint = 'So11111111111111111111111111111111111111112';
    const title = 'metadata event';
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title,
          datetime: '2026/02/20 14:00',
          host: 'admin',
          ticketTokenAmount: 1,
          solanaMint: mint,
        }),
      })
    );
    expect(createRes.status).toBe(201);

    const metadataRes = await store.fetch(
      new Request(`https://example.com/metadata/${mint}.json`, {
        method: 'GET',
      })
    );
    expect(metadataRes.status).toBe(200);
    expect(metadataRes.headers.get('content-type')).toContain('application/json');

    const body = (await metadataRes.json()) as {
      name?: string;
      symbol?: string;
      image?: string;
      attributes?: Array<{ trait_type?: string; value?: string | number }>;
    };
    expect(body.name).toBe(title);
    expect(body.symbol).toBe('METADATAEV');
    expect(body.image).toContain('/ticket-token.png');
    const mintAttr = body.attributes?.find((attr) => attr.trait_type === 'mint');
    expect(mintAttr?.value).toBe(mint);
  });

  it('rejects event create without admin authorization header', async () => {
    const res = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'unauthorized event',
          datetime: '2026/02/20 15:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it('issues signed PoP claim proof for on-chain verification', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'pop event',
          datetime: '2026/02/21 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const proofRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: created.id,
          grant: 'So11111111111111111111111111111111111111112',
          claimer: '11111111111111111111111111111111',
          periodIndex: '0',
        }),
      })
    );
    expect(proofRes.status).toBe(200);
    const proof = (await proofRes.json()) as {
      signerPubkey?: string;
      messageBase64?: string;
      signatureBase64?: string;
      auditHash?: string;
      entryHash?: string;
      prevHash?: string;
      streamPrevHash?: string;
      issuedAt?: number;
    };
    expect(typeof proof.signerPubkey).toBe('string');
    expect(typeof proof.messageBase64).toBe('string');
    expect(typeof proof.signatureBase64).toBe('string');
    expect(proof.auditHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.prevHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.streamPrevHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof proof.issuedAt).toBe('number');
    const message = Buffer.from(proof.messageBase64 ?? '', 'base64');
    expect(message[0]).toBe(2);
  });
});
