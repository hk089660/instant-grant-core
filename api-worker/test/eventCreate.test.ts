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
      AUDIT_IMMUTABLE_MODE: 'off',
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
    expect(body.image).toContain('/ticket-token-symbol-circle.png');
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

  it('closes event via admin endpoint and rejects new claims', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'closable event',
          datetime: '2026/02/20 16:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };
    expect(typeof created.id).toBe('string');

    const closeRes = await store.fetch(
      new Request(`https://example.com/v1/school/events/${encodeURIComponent(created.id)}/close`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({}),
      })
    );
    expect(closeRes.status).toBe(200);
    const closed = (await closeRes.json()) as { state?: string };
    expect(closed.state).toBe('ended');

    const claimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: created.id,
          walletAddress: 'wallet_close_test',
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as { success?: boolean; error?: { code?: string } };
    expect(claimBody.success).toBe(false);
    expect(claimBody.error?.code).toBe('eligibility');
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

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'pop-user',
          displayName: 'PoP User',
          pin: '1234',
        }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registered = (await registerRes.json()) as { userId?: string };
    expect(typeof registered.userId).toBe('string');

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(created.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: registered.userId,
          pin: '1234',
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as {
      confirmationCode?: string;
      ticketReceipt?: { receiptHash?: string };
    };
    expect(typeof claimBody.confirmationCode).toBe('string');
    expect(claimBody.ticketReceipt?.receiptHash).toMatch(/^[0-9a-f]{64}$/);

    const proofRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: created.id,
          confirmationCode: claimBody.confirmationCode,
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
    expect(proof.auditHash).toBe(claimBody.ticketReceipt?.receiptHash);
    expect(proof.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.prevHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.streamPrevHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof proof.issuedAt).toBe('number');
    const message = Buffer.from(proof.messageBase64 ?? '', 'base64');
    expect(message[0]).toBe(2);
  });

  it('serializes concurrent PoP proof requests without forking the chain', async () => {
    const originalGet = state.storage.get.bind(state.storage);
    const originalPut = state.storage.put.bind(state.storage);
    state.storage.get = (async <T = unknown>(key: string): Promise<T | undefined> => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return originalGet<T>(key);
    }) as typeof state.storage.get;
    state.storage.put = (async (key: string, value: unknown): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return originalPut(key, value);
    }) as typeof state.storage.put;

    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'pop concurrent event',
          datetime: '2026/02/21 10:15',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const grant = 'So11111111111111111111111111111111111111112';
    const claimers = Array.from({ length: 3 }, () => bs58.encode(nacl.sign.keyPair().publicKey));
    const confirmationCodes: string[] = [];

    for (let i = 0; i < 3; i += 1) {
      const registerRes = await store.fetch(
        new Request('https://example.com/api/users/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: `pop-race-user-${i}`,
            displayName: `PoP Race User ${i}`,
            pin: '1234',
          }),
        })
      );
      expect(registerRes.status).toBe(200);
      const registered = (await registerRes.json()) as { userId?: string };
      expect(typeof registered.userId).toBe('string');

      const claimRes = await store.fetch(
        new Request(`https://example.com/api/events/${encodeURIComponent(created.id)}/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: registered.userId,
            pin: '1234',
          }),
        })
      );
      expect(claimRes.status).toBe(200);
      const claimBody = (await claimRes.json()) as { confirmationCode?: string };
      expect(typeof claimBody.confirmationCode).toBe('string');
      confirmationCodes.push(claimBody.confirmationCode as string);
    }

    const proofResponses = await Promise.all(
      confirmationCodes.map((confirmationCode, index) =>
        store.fetch(
          new Request('https://example.com/v1/school/pop-proof', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              eventId: created.id,
              confirmationCode,
              grant,
              claimer: claimers[index],
              periodIndex: '0',
            }),
          })
        )
      )
    );

    for (const res of proofResponses) {
      expect(res.status).toBe(200);
    }

    const proofs = await Promise.all(
      proofResponses.map(async (res) => {
        return (await res.json()) as {
          entryHash?: string;
          prevHash?: string;
          streamPrevHash?: string;
        };
      })
    );

    const genesis = '0'.repeat(64);
    expect(proofs[0].prevHash).toBe(genesis);
    expect(proofs[0].streamPrevHash).toBe(genesis);
    expect(proofs[1].prevHash).toBe(proofs[0].entryHash);
    expect(proofs[1].streamPrevHash).toBe(proofs[0].entryHash);
    expect(proofs[2].prevHash).toBe(proofs[1].entryHash);
    expect(proofs[2].streamPrevHash).toBe(proofs[1].entryHash);

    const uniqueEntryHashes = new Set(proofs.map((proof) => proof.entryHash));
    expect(uniqueEntryHashes.size).toBe(3);

    const globalKey = `pop_chain:lastHash:global:${grant}`;
    const streamKey = `pop_chain:lastHash:stream:${grant}`;
    expect(await state.storage.get(globalKey)).toBe(proofs[2].entryHash);
    expect(await state.storage.get(streamKey)).toBe(proofs[2].entryHash);
  });

  it('reuses a fresh PoP proof for identical repeated requests', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'pop idempotent event',
          datetime: '2026/02/21 10:20',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'pop-idempotent-user',
          displayName: 'PoP Idempotent User',
          pin: '1234',
        }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registered = (await registerRes.json()) as { userId?: string };
    expect(typeof registered.userId).toBe('string');

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(created.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: registered.userId,
          pin: '1234',
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as { confirmationCode?: string };
    expect(typeof claimBody.confirmationCode).toBe('string');

    const proofRequestBody = {
      eventId: created.id,
      confirmationCode: claimBody.confirmationCode,
      grant: 'So11111111111111111111111111111111111111112',
      claimer: '11111111111111111111111111111111',
      periodIndex: '0',
    };

    const firstProofRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(proofRequestBody),
      })
    );
    expect(firstProofRes.status).toBe(200);
    const firstProof = (await firstProofRes.json()) as {
      entryHash?: string;
      prevHash?: string;
      streamPrevHash?: string;
      issuedAt?: number;
      messageBase64?: string;
      signatureBase64?: string;
    };

    const secondProofRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(proofRequestBody),
      })
    );
    expect(secondProofRes.status).toBe(200);
    const secondProof = (await secondProofRes.json()) as {
      entryHash?: string;
      prevHash?: string;
      streamPrevHash?: string;
      issuedAt?: number;
      messageBase64?: string;
      signatureBase64?: string;
    };

    expect(secondProof.entryHash).toBe(firstProof.entryHash);
    expect(secondProof.prevHash).toBe(firstProof.prevHash);
    expect(secondProof.streamPrevHash).toBe(firstProof.streamPrevHash);
    expect(secondProof.issuedAt).toBe(firstProof.issuedAt);
    expect(secondProof.messageBase64).toBe(firstProof.messageBase64);
    expect(secondProof.signatureBase64).toBe(firstProof.signatureBase64);

    const grant = proofRequestBody.grant;
    const globalKey = `pop_chain:lastHash:global:${grant}`;
    const streamKey = `pop_chain:lastHash:stream:${grant}`;
    expect(await state.storage.get(globalKey)).toBe(firstProof.entryHash);
    expect(await state.storage.get(streamKey)).toBe(firstProof.entryHash);

    const history = await state.storage.list({ prefix: 'pop_chain:history:' });
    expect(history.size).toBe(1);
  });

  it('reissues PoP proof after the reuse window expires', async () => {
    const baseNow = Date.parse('2026-02-21T00:00:00.000Z');
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseNow);
    try {
      const createRes = await store.fetch(
        new Request('https://example.com/v1/school/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            title: 'pop reissue event',
            datetime: '2026/02/21 10:25',
            host: 'admin',
            ticketTokenAmount: 1,
          }),
        })
      );
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { id: string };

      const registerRes = await store.fetch(
        new Request('https://example.com/api/users/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: 'pop-reissue-user',
            displayName: 'PoP Reissue User',
            pin: '1234',
          }),
        })
      );
      expect(registerRes.status).toBe(200);
      const registered = (await registerRes.json()) as { userId?: string };
      expect(typeof registered.userId).toBe('string');

      const claimRes = await store.fetch(
        new Request(`https://example.com/api/events/${encodeURIComponent(created.id)}/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: registered.userId,
            pin: '1234',
          }),
        })
      );
      expect(claimRes.status).toBe(200);
      const claimBody = (await claimRes.json()) as { confirmationCode?: string };
      expect(typeof claimBody.confirmationCode).toBe('string');

      const proofRequestBody = {
        eventId: created.id,
        confirmationCode: claimBody.confirmationCode,
        grant: 'So11111111111111111111111111111111111111112',
        claimer: '11111111111111111111111111111111',
        periodIndex: '0',
      };

      const firstProofRes = await store.fetch(
        new Request('https://example.com/v1/school/pop-proof', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(proofRequestBody),
        })
      );
      expect(firstProofRes.status).toBe(200);
      const firstProof = (await firstProofRes.json()) as { entryHash?: string; issuedAt?: number };
      expect(firstProof.entryHash).toMatch(/^[0-9a-f]{64}$/);

      nowSpy.mockReturnValue(baseNow + (11 * 60 * 1000));

      const secondProofRes = await store.fetch(
        new Request('https://example.com/v1/school/pop-proof', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(proofRequestBody),
        })
      );
      expect(secondProofRes.status).toBe(200);
      const secondProof = (await secondProofRes.json()) as { entryHash?: string; prevHash?: string; issuedAt?: number };
      expect(secondProof.entryHash).toMatch(/^[0-9a-f]{64}$/);
      expect(secondProof.entryHash).not.toBe(firstProof.entryHash);
      expect(secondProof.prevHash).toBe(firstProof.entryHash);
      expect(secondProof.issuedAt).toBeGreaterThan(firstProof.issuedAt ?? 0);

      const grant = proofRequestBody.grant;
      const globalKey = `pop_chain:lastHash:global:${grant}`;
      const streamKey = `pop_chain:lastHash:stream:${grant}`;
      expect(await state.storage.get(globalKey)).toBe(secondProof.entryHash);
      expect(await state.storage.get(streamKey)).toBe(secondProof.entryHash);

      const history = await state.storage.list({ prefix: 'pop_chain:history:' });
      expect(history.size).toBe(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('does not advance stored pop chain when client-provided expected hashes are used', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'pop expected hash event',
          datetime: '2026/02/21 10:30',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'pop-hash-user',
          displayName: 'PoP Hash User',
          pin: '1234',
        }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registered = (await registerRes.json()) as { userId?: string };
    expect(typeof registered.userId).toBe('string');

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(created.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: registered.userId,
          pin: '1234',
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as { confirmationCode?: string };
    expect(typeof claimBody.confirmationCode).toBe('string');

    const grant = 'So11111111111111111111111111111111111111112';
    const claimer = '11111111111111111111111111111111';

    const firstProofRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: created.id,
          confirmationCode: claimBody.confirmationCode,
          grant,
          claimer,
          periodIndex: '0',
        }),
      })
    );
    expect(firstProofRes.status).toBe(200);
    const firstProof = (await firstProofRes.json()) as {
      entryHash?: string;
    };
    expect(firstProof.entryHash).toMatch(/^[0-9a-f]{64}$/);

    const globalKey = `pop_chain:lastHash:global:${grant}`;
    const streamKey = `pop_chain:lastHash:stream:${grant}`;
    expect(await state.storage.get(globalKey)).toBe(firstProof.entryHash);
    expect(await state.storage.get(streamKey)).toBe(firstProof.entryHash);

    const secondProofRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: created.id,
          confirmationCode: claimBody.confirmationCode,
          grant,
          claimer,
          periodIndex: '1',
          expectedPrevHash: firstProof.entryHash,
          expectedStreamPrevHash: firstProof.entryHash,
        }),
      })
    );
    expect(secondProofRes.status).toBe(200);
    const secondProof = (await secondProofRes.json()) as {
      entryHash?: string;
      prevHash?: string;
      streamPrevHash?: string;
      issuedAt?: number;
      messageBase64?: string;
      signatureBase64?: string;
    };
    expect(secondProof.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(secondProof.entryHash).not.toBe(firstProof.entryHash);

    const repeatedExpectedHashProofRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: created.id,
          confirmationCode: claimBody.confirmationCode,
          grant,
          claimer,
          periodIndex: '1',
          expectedPrevHash: firstProof.entryHash,
          expectedStreamPrevHash: firstProof.entryHash,
        }),
      })
    );
    expect(repeatedExpectedHashProofRes.status).toBe(200);
    const repeatedExpectedHashProof = (await repeatedExpectedHashProofRes.json()) as {
      entryHash?: string;
      prevHash?: string;
      streamPrevHash?: string;
      issuedAt?: number;
      messageBase64?: string;
      signatureBase64?: string;
    };
    expect(repeatedExpectedHashProof.entryHash).toBe(secondProof.entryHash);
    expect(repeatedExpectedHashProof.prevHash).toBe(secondProof.prevHash);
    expect(repeatedExpectedHashProof.streamPrevHash).toBe(secondProof.streamPrevHash);
    expect(repeatedExpectedHashProof.issuedAt).toBe(secondProof.issuedAt);
    expect(repeatedExpectedHashProof.messageBase64).toBe(secondProof.messageBase64);
    expect(repeatedExpectedHashProof.signatureBase64).toBe(secondProof.signatureBase64);

    expect(await state.storage.get(globalKey)).toBe(firstProof.entryHash);
    expect(await state.storage.get(streamKey)).toBe(firstProof.entryHash);

    const history = await state.storage.list({ prefix: 'pop_chain:history:' });
    expect(history.size).toBe(2);
  });

  it('rejects duplicate on-chain grant config across events', async () => {
    const onchainConfig = {
      solanaMint: 'So11111111111111111111111111111111111111112',
      solanaAuthority: '11111111111111111111111111111111',
      solanaGrantId: '999',
    };
    const createFirst = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'first onchain event',
          datetime: '2026/02/21 11:00',
          host: 'admin',
          ticketTokenAmount: 1,
          ...onchainConfig,
        }),
      })
    );
    expect(createFirst.status).toBe(201);

    const createSecond = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'second onchain event',
          datetime: '2026/02/21 11:30',
          host: 'admin',
          ticketTokenAmount: 1,
          ...onchainConfig,
        }),
      })
    );
    expect(createSecond.status).toBe(409);
    const body = (await createSecond.json()) as { error?: string };
    expect(body.error).toContain('on-chain grant config already linked to event');
  });

  it('accepts user claim without on-chain proof on on-chain configured event (off-chain fallback)', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'strict onchain event',
          datetime: '2026/02/21 12:00',
          host: 'admin',
          ticketTokenAmount: 1,
          solanaMint: 'So11111111111111111111111111111111111111112',
          solanaAuthority: '11111111111111111111111111111111',
          solanaGrantId: '1',
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'user-a', displayName: 'User A', pin: '1234' }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registered = (await registerRes.json()) as { userId?: string };
    expect(typeof registered.userId).toBe('string');

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(created.id)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: registered.userId,
          pin: '1234',
        }),
      })
    );
    expect(claimRes.status).toBe(200);
    const body = (await claimRes.json()) as { status?: string; confirmationCode?: string };
    expect(body.status).toBe('created');
    expect(typeof body.confirmationCode).toBe('string');
  });

  it('accepts /v1/school/claims without tx proof on on-chain configured event (off-chain fallback)', async () => {
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'strict school claim event',
          datetime: '2026/02/21 13:00',
          host: 'admin',
          ticketTokenAmount: 1,
          solanaMint: 'So11111111111111111111111111111111111111112',
          solanaAuthority: '11111111111111111111111111111111',
          solanaGrantId: '2',
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const res = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: created.id,
          walletAddress: '11111111111111111111111111111111',
        }),
      })
    );
    expect(res.status).toBe(200);
    const result = (await res.json()) as {
      success?: boolean;
      error?: { code?: string; message?: string };
      confirmationCode?: string;
    };
    expect(result.success).toBe(true);
    expect(typeof result.confirmationCode).toBe('string');
  });
});
