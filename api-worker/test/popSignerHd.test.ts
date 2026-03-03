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

describe('PoP signer HD configuration', () => {
  let state: MockDurableObjectState;

  beforeEach(() => {
    state = new MockDurableObjectState();
  });

  it('reports HD signer mode in runtime and pop status', async () => {
    const hdSeed = new Uint8Array(64);
    for (let i = 0; i < hdSeed.length; i += 1) hdSeed[i] = (i + 1) % 256;
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      POP_SIGNER_HD_MASTER_SEED_B64: Buffer.from(hdSeed).toString('base64'),
      POP_SIGNER_HD_PATH: "m/44'/501'/0'/0'/7'",
      AUDIT_IMMUTABLE_MODE: 'off',
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const runtimeRes = await store.fetch(
      new Request('https://example.com/v1/school/runtime-status', { method: 'GET' })
    );
    expect(runtimeRes.status).toBe(200);
    const runtimeBody = (await runtimeRes.json()) as {
      ready?: boolean;
      checks?: {
        popSignerConfigured?: boolean;
        popSignerPubkey?: string | null;
        popSignerMode?: string | null;
        popSignerDerivationPath?: string | null;
        popSignerLegacyEnabled?: boolean;
        popSignerRotation?: {
          enabled: boolean;
          index: number | null;
        };
      };
      blockingIssues?: string[];
    };
    expect(runtimeBody.ready).toBe(true);
    expect(runtimeBody.checks?.popSignerConfigured).toBe(true);
    expect(runtimeBody.checks?.popSignerMode).toBe('hd');
    expect(runtimeBody.checks?.popSignerDerivationPath).toBe("m/44'/501'/0'/0'/7'");
    expect(runtimeBody.checks?.popSignerLegacyEnabled).toBe(true);
    expect(runtimeBody.checks?.popSignerRotation?.enabled).toBe(false);
    expect(runtimeBody.checks?.popSignerPubkey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect((runtimeBody.blockingIssues ?? []).length).toBe(0);

    const popStatusRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-status', { method: 'GET' })
    );
    expect(popStatusRes.status).toBe(200);
    const popStatusBody = (await popStatusRes.json()) as {
      signerConfigured?: boolean;
      signerPubkey?: string | null;
      signerMode?: string | null;
      signerDerivationPath?: string | null;
      legacySignerEnabled?: boolean;
      signerRotation?: {
        enabled: boolean;
        index: number | null;
      };
      error?: string | null;
    };
    expect(popStatusBody.signerConfigured).toBe(true);
    expect(popStatusBody.signerMode).toBe('hd');
    expect(popStatusBody.signerDerivationPath).toBe("m/44'/501'/0'/0'/7'");
    expect(popStatusBody.legacySignerEnabled).toBe(true);
    expect(popStatusBody.signerRotation?.enabled).toBe(false);
    expect(popStatusBody.error).toBeNull();
    expect(popStatusBody.signerPubkey).toBe(runtimeBody.checks?.popSignerPubkey ?? null);
  });

  it('fails preflight when HD path uses non-hardened segment', async () => {
    const hdSeed = new Uint8Array(64);
    for (let i = 0; i < hdSeed.length; i += 1) hdSeed[i] = (i + 11) % 256;
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      POP_SIGNER_HD_MASTER_SEED_B64: Buffer.from(hdSeed).toString('base64'),
      POP_SIGNER_HD_PATH: "m/44/501'/0'/0'/0'",
      AUDIT_IMMUTABLE_MODE: 'off',
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const runtimeRes = await store.fetch(
      new Request('https://example.com/v1/school/runtime-status', { method: 'GET' })
    );
    expect(runtimeRes.status).toBe(200);
    const body = (await runtimeRes.json()) as {
      ready?: boolean;
      checks?: {
        popSignerConfigured?: boolean;
        popSignerError?: string | null;
      };
      blockingIssues?: string[];
    };
    expect(body.ready).toBe(false);
    expect(body.checks?.popSignerConfigured).toBe(false);
    expect(body.checks?.popSignerError).toContain('hardened indices only');
    expect((body.blockingIssues ?? []).some((issue) => issue.includes('PoP signer configuration error'))).toBe(true);
  });

  it('keeps legacy signer mode as fallback', async () => {
    const popSigner = nacl.sign.keyPair();
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      POP_SIGNER_SECRET_KEY_B64: Buffer.from(popSigner.secretKey).toString('base64'),
      POP_SIGNER_PUBKEY: bs58.encode(popSigner.publicKey),
      AUDIT_IMMUTABLE_MODE: 'off',
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const popStatusRes = await store.fetch(
      new Request('https://example.com/v1/school/pop-status', { method: 'GET' })
    );
    expect(popStatusRes.status).toBe(200);
    const body = (await popStatusRes.json()) as {
      signerConfigured?: boolean;
      signerPubkey?: string | null;
      signerMode?: string | null;
      signerDerivationPath?: string | null;
      error?: string | null;
    };
    expect(body.signerConfigured).toBe(true);
    expect(body.signerMode).toBe('legacy');
    expect(body.signerDerivationPath).toBeNull();
    expect(body.signerPubkey).toBe(bs58.encode(popSigner.publicKey));
    expect(body.error).toBeNull();
  });

  it('rotates HD signer pubkey dynamically by path template index', async () => {
    const hdSeed = new Uint8Array(64);
    for (let i = 0; i < hdSeed.length; i += 1) hdSeed[i] = (i + 21) % 256;
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      POP_SIGNER_HD_MASTER_SEED_B64: Buffer.from(hdSeed).toString('base64'),
      POP_SIGNER_HD_ROTATION_ENABLED: 'true',
      POP_SIGNER_HD_ROTATION_PATH_TEMPLATE: "m/44'/501'/{index}'/0'/0'",
      POP_SIGNER_HD_ROTATION_INTERVAL_DAYS: '1',
      POP_SIGNER_HD_ROTATION_START_UNIX: '0',
      POP_SIGNER_LEGACY_ENABLED: 'false',
      AUDIT_IMMUTABLE_MODE: 'off',
    };
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(2 * 24 * 60 * 60 * 1000 + 1);
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const popResDay2 = await store.fetch(
      new Request('https://example.com/v1/school/pop-status', { method: 'GET' })
    );
    expect(popResDay2.status).toBe(200);
    const day2 = (await popResDay2.json()) as {
      signerPubkey?: string | null;
      signerDerivationPath?: string | null;
      signerRotation?: { enabled?: boolean; index?: number | null; intervalDays?: number | null };
      legacySignerEnabled?: boolean;
      error?: string | null;
    };
    expect(day2.error).toBeNull();
    expect(day2.legacySignerEnabled).toBe(false);
    expect(day2.signerRotation?.enabled).toBe(true);
    expect(day2.signerRotation?.intervalDays).toBe(1);
    expect(day2.signerRotation?.index).toBe(2);
    expect(day2.signerDerivationPath).toBe("m/44'/501'/2'/0'/0'");
    expect(day2.signerPubkey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

    nowSpy.mockReturnValue(3 * 24 * 60 * 60 * 1000 + 1);
    const popResDay3 = await store.fetch(
      new Request('https://example.com/v1/school/pop-status', { method: 'GET' })
    );
    expect(popResDay3.status).toBe(200);
    const day3 = (await popResDay3.json()) as {
      signerPubkey?: string | null;
      signerDerivationPath?: string | null;
      signerRotation?: { index?: number | null };
      error?: string | null;
    };
    nowSpy.mockRestore();

    expect(day3.error).toBeNull();
    expect(day3.signerRotation?.index).toBe(3);
    expect(day3.signerDerivationPath).toBe("m/44'/501'/3'/0'/0'");
    expect(day3.signerPubkey).not.toBe(day2.signerPubkey);
  });

  it('rejects legacy signer config when POP_SIGNER_LEGACY_ENABLED=false', async () => {
    const popSigner = nacl.sign.keyPair();
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      POP_SIGNER_SECRET_KEY_B64: Buffer.from(popSigner.secretKey).toString('base64'),
      POP_SIGNER_PUBKEY: bs58.encode(popSigner.publicKey),
      POP_SIGNER_LEGACY_ENABLED: 'false',
      AUDIT_IMMUTABLE_MODE: 'off',
    };
    // @ts-expect-error mock for DurableObjectState
    const store = new SchoolStore(state, env);

    const runtimeRes = await store.fetch(
      new Request('https://example.com/v1/school/runtime-status', { method: 'GET' })
    );
    expect(runtimeRes.status).toBe(200);
    const body = (await runtimeRes.json()) as {
      ready?: boolean;
      checks?: {
        popSignerConfigured?: boolean;
        popSignerLegacyEnabled?: boolean;
        popSignerError?: string | null;
      };
      blockingIssues?: string[];
    };
    expect(body.ready).toBe(false);
    expect(body.checks?.popSignerConfigured).toBe(false);
    expect(body.checks?.popSignerLegacyEnabled).toBe(false);
    expect(body.checks?.popSignerError).toContain('legacy POP_SIGNER_* configuration is disabled');
    expect((body.blockingIssues ?? []).some((issue) => issue.includes('PoP signer configuration error'))).toBe(true);
  });
});
