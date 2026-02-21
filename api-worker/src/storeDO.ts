import bs58 from 'bs58';
import nacl from 'tweetnacl';
import type {
  ClaimBody,
  PopProofBody,
  PopProofResponse,
  RegisterBody,
  SchoolClaimResult,
  UserClaimBody,
  UserClaimResponse,
} from './types';
import { ClaimStore, type IClaimStorage } from './claimLogic';
import type { AuditActor, AuditEvent } from './audit/types';
import { canonicalize, sha256Hex } from './audit/hash';
import { parseAuditImmutableMode, persistImmutableAuditEntry } from './audit/immutable';

const USER_PREFIX = 'user:';

function userKey(userId: string): string {
  return USER_PREFIX + userId;
}

function adminCodeKey(code: string): string {
  return 'admin_code:' + code;
}

async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function genConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export interface Env {
  CORS_ORIGIN?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_DEMO_PASSWORD?: string;
  POP_SIGNER_SECRET_KEY_B64?: string;
  POP_SIGNER_PUBKEY?: string;
  ENFORCE_ONCHAIN_POP?: string;
  AUDIT_LOGS?: R2Bucket;
  AUDIT_INDEX?: KVNamespace;
  AUDIT_IMMUTABLE_MODE?: string;
  AUDIT_IMMUTABLE_INGEST_URL?: string;
  AUDIT_IMMUTABLE_INGEST_TOKEN?: string;
  AUDIT_IMMUTABLE_FETCH_TIMEOUT_MS?: string;
}

const AUDIT_MAX_DEPTH = 4;
const AUDIT_MAX_ARRAY = 20;
const AUDIT_MAX_KEYS = 50;
const AUDIT_MAX_STRING = 160;
const DEFAULT_ADMIN_PASSWORD = 'change-this-in-dashboard';
const AUDIT_LAST_HASH_GLOBAL_KEY = 'audit:lastHash:global';
const MINT_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TX_SIGNATURE_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
const POP_CHAIN_GLOBAL_PREFIX = 'pop_chain:lastHash:global:';
const POP_CHAIN_STREAM_PREFIX = 'pop_chain:lastHash:stream:';
const POP_HASH_LEN = 32;
const POP_MESSAGE_VERSION = 2;
const POP_MESSAGE_LEN = 1 + 32 + 32 + 8 + 32 + 32 + 32 + 32 + 8;
const POP_HASH_GENESIS_HEX = '0'.repeat(64);
const AUDIT_HISTORY_PREFIX = 'audit_history:';
const AUDIT_INTEGRITY_DEFAULT_LIMIT = 50;
const AUDIT_INTEGRITY_MAX_LIMIT = 200;
const IMMUTABLE_AUDIT_SOURCE = 'school-store';
const TOKEN_IMAGE_URL = 'https://instant-grant-core.pages.dev/ticket-token.png';

type AuditIntegrityIssue = {
  code: string;
  message: string;
  entryHash?: string;
  eventId?: string;
  ref?: string;
};

type AuditIntegrityReport = {
  ok: boolean;
  mode: 'off' | 'best_effort' | 'required';
  checked: number;
  limit: number;
  globalHead: string | null;
  oldestInWindow: string | null;
  verifyImmutable: boolean;
  issues: AuditIntegrityIssue[];
  warnings: string[];
  inspectedAt: string;
};

function buildTokenSymbol(title: string): string {
  const cleaned = title.replace(/\s+/g, '').slice(0, 10).toUpperCase();
  return cleaned || 'TICKET';
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error('invalid hash hex');
  }
  const out = new Uint8Array(POP_HASH_LEN);
  for (let i = 0; i < POP_HASH_LEN; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function readHashHex(raw: string | undefined | null): string {
  if (!raw || raw === 'GENESIS') return POP_HASH_GENESIS_HEX;
  const v = raw.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(v)) return v;
  throw new Error('invalid hash in storage');
}

function parsePeriodIndex(raw: unknown): bigint | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && Number.isInteger(raw)) {
    return BigInt(raw);
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    return BigInt(raw.trim());
  }
  return null;
}

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseBooleanQuery(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function u64ToLeBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(0, value, true);
  return out;
}

function i64ToLeBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const dv = new DataView(out.buffer);
  dv.setBigInt64(0, value, true);
  return out;
}

function doStorageAdapter(ctx: DurableObjectState): IClaimStorage {
  return {
    async get(key: string) {
      return ctx.storage.get(key);
    },
    async put(key: string, value: unknown) {
      await ctx.storage.put(key, value);
    },
    async list(prefix: string) {
      return ctx.storage.list({ prefix }) as Promise<Map<string, unknown>>;
    },
  };
}


export class SchoolStore implements DurableObject {
  private store: ClaimStore;

  constructor(private ctx: DurableObjectState, private env: Env) {
    this.store = new ClaimStore(doStorageAdapter(ctx));
  }


  private auditLock: Promise<void> = Promise.resolve();
  private popProofLock: Promise<void> = Promise.resolve();
  private popSignerCache:
    | { secretKey: Uint8Array; signerPubkey: string }
    | null
    | undefined;

  private getPopSigner(): { secretKey: Uint8Array; signerPubkey: string } | null {
    if (this.popSignerCache !== undefined) return this.popSignerCache;

    const secretB64 = this.env.POP_SIGNER_SECRET_KEY_B64?.trim() ?? '';
    const signerPubkey = this.env.POP_SIGNER_PUBKEY?.trim() ?? '';
    if (!secretB64 || !signerPubkey) {
      this.popSignerCache = null;
      return null;
    }

    if (!MINT_BASE58_RE.test(signerPubkey)) {
      throw new Error('POP_SIGNER_PUBKEY is invalid');
    }

    let decoded: Uint8Array;
    try {
      decoded = decodeBase64(secretB64);
    } catch {
      throw new Error('POP_SIGNER_SECRET_KEY_B64 is not base64');
    }

    let secretKey: Uint8Array;
    if (decoded.length === 64) {
      secretKey = decoded;
    } else if (decoded.length === 32) {
      secretKey = nacl.sign.keyPair.fromSeed(decoded).secretKey;
    } else {
      throw new Error('POP_SIGNER_SECRET_KEY_B64 must decode to 32-byte seed or 64-byte secret key');
    }

    let configuredPubkey: Uint8Array;
    try {
      configuredPubkey = bs58.decode(signerPubkey);
    } catch {
      throw new Error('POP_SIGNER_PUBKEY is invalid');
    }
    if (configuredPubkey.length !== 32) {
      throw new Error('POP_SIGNER_PUBKEY must decode to 32 bytes');
    }
    const actualPubkey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
    if (!bytesEqual(actualPubkey, configuredPubkey)) {
      throw new Error('POP signer keypair mismatch (POP_SIGNER_SECRET_KEY_B64 / POP_SIGNER_PUBKEY)');
    }

    this.popSignerCache = { secretKey, signerPubkey };
    return this.popSignerCache;
  }

  private isOnchainPopEnforced(): boolean {
    const raw = (this.env.ENFORCE_ONCHAIN_POP ?? '').trim().toLowerCase();
    if (!raw) return true;
    return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no');
  }

  private getAuditImmutableMode() {
    return parseAuditImmutableMode(this.env.AUDIT_IMMUTABLE_MODE);
  }

  private isMutatingMethod(method: string): boolean {
    const m = method.toUpperCase();
    return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
  }

  private isAuditFailClosed(method: string): boolean {
    return this.getAuditImmutableMode() === 'required' && this.isMutatingMethod(method);
  }

  private isEventOnchainConfigured(event: { solanaMint?: string; solanaAuthority?: string; solanaGrantId?: string } | null | undefined): boolean {
    if (!event) return false;
    return Boolean(
      typeof event.solanaMint === 'string' && event.solanaMint.trim() &&
      typeof event.solanaAuthority === 'string' && event.solanaAuthority.trim() &&
      typeof event.solanaGrantId === 'string' && event.solanaGrantId.trim()
    );
  }

  private getOnchainProofFields(body: {
    walletAddress?: unknown;
    txSignature?: unknown;
    receiptPubkey?: unknown;
  }): { walletAddress: string; txSignature: string; receiptPubkey: string } {
    const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress.trim() : '';
    const txSignature = typeof body.txSignature === 'string' ? body.txSignature.trim() : '';
    const receiptPubkey = typeof body.receiptPubkey === 'string' ? body.receiptPubkey.trim() : '';
    return { walletAddress, txSignature, receiptPubkey };
  }

  private validateOnchainProofFields(fields: {
    walletAddress: string;
    txSignature: string;
    receiptPubkey: string;
  }): string | null {
    if (!fields.walletAddress || !MINT_BASE58_RE.test(fields.walletAddress)) {
      return 'walletAddress is required for on-chain claim';
    }
    if (!fields.txSignature || !TX_SIGNATURE_BASE58_RE.test(fields.txSignature)) {
      return 'txSignature is required for on-chain claim';
    }
    if (!fields.receiptPubkey || !MINT_BASE58_RE.test(fields.receiptPubkey)) {
      return 'receiptPubkey is required for on-chain claim';
    }
    return null;
  }

  private async buildPopEntryHash(params: {
    prevHash: Uint8Array;
    streamPrevHash: Uint8Array;
    auditHash: Uint8Array;
    grant: Uint8Array;
    claimer: Uint8Array;
    periodIndex: bigint;
    issuedAt: bigint;
  }): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const periodBytes = u64ToLeBytes(params.periodIndex);
    const issuedAtBytes = i64ToLeBytes(params.issuedAt);
    const domain = encoder.encode('we-ne:pop:v2');
    const input = new Uint8Array(
      domain.length +
      params.prevHash.length +
      params.streamPrevHash.length +
      params.auditHash.length +
      params.grant.length +
      params.claimer.length +
      periodBytes.length +
      issuedAtBytes.length
    );

    let offset = 0;
    input.set(domain, offset); offset += domain.length;
    input.set(params.prevHash, offset); offset += params.prevHash.length;
    input.set(params.streamPrevHash, offset); offset += params.streamPrevHash.length;
    input.set(params.auditHash, offset); offset += params.auditHash.length;
    input.set(params.grant, offset); offset += params.grant.length;
    input.set(params.claimer, offset); offset += params.claimer.length;
    input.set(periodBytes, offset); offset += periodBytes.length;
    input.set(issuedAtBytes, offset);

    const digest = await crypto.subtle.digest('SHA-256', input);
    return new Uint8Array(digest);
  }

  private buildPopProofMessage(params: {
    grant: Uint8Array;
    claimer: Uint8Array;
    periodIndex: bigint;
    prevHash: Uint8Array;
    streamPrevHash: Uint8Array;
    auditHash: Uint8Array;
    entryHash: Uint8Array;
    issuedAt: bigint;
  }): Uint8Array {
    const out = new Uint8Array(POP_MESSAGE_LEN);
    let offset = 0;
    out[offset] = POP_MESSAGE_VERSION;
    offset += 1;
    out.set(params.grant, offset); offset += 32;
    out.set(params.claimer, offset); offset += 32;
    out.set(u64ToLeBytes(params.periodIndex), offset); offset += 8;
    out.set(params.prevHash, offset); offset += 32;
    out.set(params.streamPrevHash, offset); offset += 32;
    out.set(params.auditHash, offset); offset += 32;
    out.set(params.entryHash, offset); offset += 32;
    out.set(i64ToLeBytes(params.issuedAt), offset);
    return out;
  }

  private async issuePopClaimProof(body: PopProofBody): Promise<PopProofResponse> {
    const task = this.popProofLock.then(async () => {
      const signer = this.getPopSigner();
      if (!signer) {
        throw new Error('PoP signer is not configured');
      }

      const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
      const grantRaw = typeof body?.grant === 'string' ? body.grant.trim() : '';
      const claimerRaw = typeof body?.claimer === 'string' ? body.claimer.trim() : '';
      const periodIndex = parsePeriodIndex(body?.periodIndex);

      if (!eventId || !grantRaw || !claimerRaw || periodIndex === null || periodIndex < BigInt(0)) {
        throw new Error('invalid PoP proof request');
      }
      if (!MINT_BASE58_RE.test(grantRaw) || !MINT_BASE58_RE.test(claimerRaw)) {
        throw new Error('invalid grant/claimer format');
      }
      const maxU64 = (BigInt(1) << BigInt(64)) - BigInt(1);
      if (periodIndex > maxU64) {
        throw new Error('periodIndex out of range');
      }

      const event = await this.store.getEvent(eventId);
      if (!event) {
        throw new Error('event not found');
      }
      if (event.state && event.state !== 'published') {
        throw new Error('event not available');
      }

      const grant = bs58.decode(grantRaw);
      const claimer = bs58.decode(claimerRaw);
      if (grant.length !== 32 || claimer.length !== 32) {
        throw new Error('invalid grant/claimer bytes');
      }

      const globalKey = `${POP_CHAIN_GLOBAL_PREFIX}${grantRaw}`;
      const streamKey = `${POP_CHAIN_STREAM_PREFIX}${grantRaw}`;
      const prevHashHex = readHashHex(await this.ctx.storage.get<string>(globalKey));
      const streamPrevHashHex = readHashHex(await this.ctx.storage.get<string>(streamKey));
      const prevHash = hexToBytes(prevHashHex);
      const streamPrevHash = hexToBytes(streamPrevHashHex);
      const issuedAt = BigInt(Math.floor(Date.now() / 1000));

      // Bind PoP proof to the immutable API audit chain with an anchor hash.
      const auditAnchor = await this.appendAuditLog(
        'POP_CLAIM_PROOF_ANCHOR',
        { type: 'wallet', id: this.maskActorId(claimerRaw) },
        {
          eventId,
          grant: grantRaw,
          claimer: claimerRaw,
          periodIndex: periodIndex.toString(),
          prevHash: prevHashHex,
          streamPrevHash: streamPrevHashHex,
        },
        `pop:${eventId}`
      );
      const auditHashHex = readHashHex(auditAnchor.entry_hash);
      const auditHash = hexToBytes(auditHashHex);

      const entryHash = await this.buildPopEntryHash({
        prevHash,
        streamPrevHash,
        auditHash,
        grant,
        claimer,
        periodIndex,
        issuedAt,
      });
      const entryHashHex = bytesToHex(entryHash);

      await this.ctx.storage.put(globalKey, entryHashHex);
      await this.ctx.storage.put(streamKey, entryHashHex);
      await this.ctx.storage.put(`pop_chain:history:${new Date().toISOString()}:${entryHashHex}`, {
        eventId,
        grant: grantRaw,
        claimer: claimerRaw,
        periodIndex: periodIndex.toString(),
        prevHash: prevHashHex,
        streamPrevHash: streamPrevHashHex,
        auditHash: auditHashHex,
        entryHash: entryHashHex,
        issuedAt: Number(issuedAt),
      });

      const message = this.buildPopProofMessage({
        grant,
        claimer,
        periodIndex,
        prevHash,
        streamPrevHash,
        auditHash,
        entryHash,
        issuedAt,
      });
      const signature = nacl.sign.detached(message, signer.secretKey);

      return {
        signerPubkey: signer.signerPubkey,
        messageBase64: encodeBase64(message),
        signatureBase64: encodeBase64(signature),
        auditHash: auditHashHex,
        prevHash: prevHashHex,
        streamPrevHash: streamPrevHashHex,
        entryHash: entryHashHex,
        issuedAt: Number(issuedAt),
      };
    });

    this.popProofLock = task.then(() => { }, () => { });
    return task;
  }

  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization') ?? '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() ?? '';
    return token || null;
  }

  private getConfiguredMasterPassword(): string | null {
    const password = this.env.ADMIN_PASSWORD?.trim() ?? '';
    if (!password || password === DEFAULT_ADMIN_PASSWORD) return null;
    return password;
  }

  private getConfiguredDemoPassword(): string | null {
    const password = this.env.ADMIN_DEMO_PASSWORD?.trim() ?? '';
    return password || null;
  }

  private unauthorizedResponse(): Response {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  private serverConfigErrorResponse(): Response {
    return Response.json({ error: 'server configuration error' }, { status: 500 });
  }

  private async authenticateOperator(
    request: Request
  ): Promise<{ role: 'master' | 'admin'; source: 'master' | 'invite' | 'demo' } | null> {
    const token = this.extractBearerToken(request);
    if (!token) return null;

    const masterPassword = this.getConfiguredMasterPassword();
    if (masterPassword && token === masterPassword) {
      return { role: 'master', source: 'master' };
    }

    const demoPassword = this.getConfiguredDemoPassword();
    if (demoPassword && token === demoPassword) {
      return { role: 'admin', source: 'demo' };
    }

    const adminData = await this.ctx.storage.get(adminCodeKey(token));
    if (adminData) {
      return { role: 'admin', source: 'invite' };
    }

    return null;
  }

  private requireMasterAuthorization(request: Request): Response | null {
    const masterPassword = this.getConfiguredMasterPassword();
    if (!masterPassword) {
      return this.serverConfigErrorResponse();
    }
    const token = this.extractBearerToken(request);
    if (!token || token !== masterPassword) {
      return this.unauthorizedResponse();
    }
    return null;
  }

  private async requireAdminAuthorization(request: Request): Promise<Response | null> {
    const operator = await this.authenticateOperator(request);
    if (!operator) {
      return this.unauthorizedResponse();
    }
    return null;
  }

  private isAdminProtectedSchoolRoute(path: string, method: string): boolean {
    const normalizedMethod = method.toUpperCase();
    if (normalizedMethod === 'POST' && path === '/v1/school/events') return true;
    if (normalizedMethod === 'GET' && /^\/v1\/school\/events\/[^/]+\/claimants$/.test(path)) return true;
    return false;
  }

  async appendAuditLog(event: string, actor: AuditActor, data: unknown, eventId: string): Promise<AuditEvent> {
    // Serialize globally so a single hash chain can cover all API logs.
    const task = this.auditLock.then(async () => {
      const ts = new Date().toISOString();
      const globalPrevHash = (await this.ctx.storage.get<string>(AUDIT_LAST_HASH_GLOBAL_KEY)) ?? 'GENESIS';
      const streamLastHashKey = `audit:lastHash:${eventId}`;
      const streamPrevHash = (await this.ctx.storage.get<string>(streamLastHashKey)) ?? 'GENESIS';

      const baseEntry = {
        ts,
        event,
        eventId,
        actor,
        data: (data as Record<string, unknown>) ?? {},
        prev_hash: globalPrevHash,
        stream_prev_hash: streamPrevHash,
      };

      const entry_hash = await sha256Hex(canonicalize(baseEntry));
      const fullEntry: AuditEvent = { ...baseEntry, entry_hash };

      const immutableReceipt = await persistImmutableAuditEntry({
        entry: fullEntry,
        mode: this.getAuditImmutableMode(),
        source: 'school-store',
        bindings: {
          AUDIT_LOGS: this.env.AUDIT_LOGS,
          AUDIT_INDEX: this.env.AUDIT_INDEX,
          AUDIT_IMMUTABLE_INGEST_URL: this.env.AUDIT_IMMUTABLE_INGEST_URL,
          AUDIT_IMMUTABLE_INGEST_TOKEN: this.env.AUDIT_IMMUTABLE_INGEST_TOKEN,
          AUDIT_IMMUTABLE_FETCH_TIMEOUT_MS: this.env.AUDIT_IMMUTABLE_FETCH_TIMEOUT_MS,
        },
      });
      if (immutableReceipt) {
        fullEntry.immutable = immutableReceipt;
      }

      // Update both global and per-event stream chains.
      await this.ctx.storage.put(AUDIT_LAST_HASH_GLOBAL_KEY, entry_hash);
      await this.ctx.storage.put(streamLastHashKey, entry_hash);

      // Store history for Master Dashboard
      // Key format: audit_history:<timestamp>:<hash> to allow reverse chronological listing
      const historyKey = `audit_history:${ts}:${entry_hash}`;
      await this.ctx.storage.put(historyKey, fullEntry);

      return fullEntry;
    });

    // Update lock for next caller, robust against failures.
    this.auditLock = task.then(() => { }, () => { });

    return task;
  }

  async getAuditLogs(): Promise<AuditEvent[]> {
    // List latest 50 logs (reverse order)
    const result = await this.ctx.storage.list({ prefix: AUDIT_HISTORY_PREFIX, limit: 50, reverse: true });
    return Array.from(result.values()) as AuditEvent[];
  }

  private getAuditStatus() {
    const mode = this.getAuditImmutableMode();
    const r2Configured = Boolean(this.env.AUDIT_LOGS);
    const kvConfigured = Boolean(this.env.AUDIT_INDEX);
    const ingestConfigured = Boolean(this.env.AUDIT_IMMUTABLE_INGEST_URL?.trim());
    const primaryImmutableSinkConfigured = r2Configured || ingestConfigured;
    const operationalReady = mode === 'off' ? true : primaryImmutableSinkConfigured;
    return {
      mode,
      failClosedForMutatingRequests: mode === 'required',
      operationalReady,
      primaryImmutableSinkConfigured,
      sinks: {
        r2Configured,
        kvConfigured,
        ingestConfigured,
      },
    };
  }

  private buildAuditHashInput(entry: AuditEvent): Record<string, unknown> {
    const base: Record<string, unknown> = {
      ts: entry.ts,
      event: entry.event,
      eventId: entry.eventId,
      actor: entry.actor,
      data: entry.data,
      prev_hash: entry.prev_hash,
    };
    if (typeof entry.stream_prev_hash === 'string') {
      base.stream_prev_hash = entry.stream_prev_hash;
    }
    return base;
  }

  private buildImmutablePayload(entry: AuditEvent): string {
    const payloadEntry = {
      ...this.buildAuditHashInput(entry),
      entry_hash: entry.entry_hash,
    };
    return canonicalize({
      version: 1,
      source: IMMUTABLE_AUDIT_SOURCE,
      entry: payloadEntry,
    });
  }

  private async verifyAuditIntegrity(limit: number, verifyImmutable: boolean): Promise<AuditIntegrityReport> {
    const mode = this.getAuditImmutableMode();
    const shouldVerifyImmutable = verifyImmutable && mode !== 'off';
    const issues: AuditIntegrityIssue[] = [];
    const warningSet = new Set<string>();

    const rows = await this.ctx.storage.list({ prefix: AUDIT_HISTORY_PREFIX, limit, reverse: true });
    const entries = Array.from(rows.values()) as AuditEvent[];

    let newerEntry: AuditEvent | null = null;
    const expectedStreamOlderHashByEvent = new Map<string, string>();

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || typeof entry.entry_hash !== 'string') {
        issues.push({
          code: 'invalid_entry_shape',
          message: 'invalid audit history entry',
        });
        continue;
      }

      const recomputedEntryHash = await sha256Hex(canonicalize(this.buildAuditHashInput(entry)));
      if (recomputedEntryHash !== entry.entry_hash) {
        issues.push({
          code: 'entry_hash_mismatch',
          message: 'entry hash mismatch',
          entryHash: entry.entry_hash,
          eventId: entry.eventId,
        });
      }

      if (newerEntry && newerEntry.prev_hash !== entry.entry_hash) {
        issues.push({
          code: 'global_chain_break',
          message: 'global prev_hash does not point to the next older entry',
          entryHash: newerEntry.entry_hash,
          eventId: newerEntry.eventId,
        });
      }

      const expectedOlderHash = expectedStreamOlderHashByEvent.get(entry.eventId);
      if (expectedOlderHash && expectedOlderHash !== entry.entry_hash) {
        issues.push({
          code: 'stream_chain_break',
          message: 'stream_prev_hash does not point to next older entry in this event stream',
          entryHash: entry.entry_hash,
          eventId: entry.eventId,
        });
      }
      expectedStreamOlderHashByEvent.set(entry.eventId, entry.stream_prev_hash ?? 'GENESIS');

      if (shouldVerifyImmutable) {
        if (!entry.immutable) {
          issues.push({
            code: 'immutable_receipt_missing',
            message: 'immutable receipt is missing',
            entryHash: entry.entry_hash,
            eventId: entry.eventId,
          });
        } else {
          const payload = this.buildImmutablePayload(entry);
          const payloadHash = await sha256Hex(payload);
          if (entry.immutable.payload_hash !== payloadHash) {
            issues.push({
              code: 'immutable_payload_hash_mismatch',
              message: 'immutable payload hash mismatch',
              entryHash: entry.entry_hash,
              eventId: entry.eventId,
            });
          }

          const hasPrimarySink = entry.immutable.sinks.some(
            (sink) => sink.sink === 'r2_entry' || sink.sink === 'immutable_ingest'
          );
          if (!hasPrimarySink) {
            issues.push({
              code: 'immutable_primary_sink_missing',
              message: 'immutable receipt has no accepted primary sink',
              entryHash: entry.entry_hash,
              eventId: entry.eventId,
            });
          }

          const r2Refs = entry.immutable.sinks.filter((sink) => sink.sink === 'r2_entry');
          if (r2Refs.length > 0) {
            if (!this.env.AUDIT_LOGS) {
              warningSet.add('AUDIT_LOGS binding is not configured, skipped R2 object checks');
            } else {
              for (const sink of r2Refs) {
                const objectBody = await this.env.AUDIT_LOGS.get(sink.ref);
                if (!objectBody) {
                  issues.push({
                    code: 'immutable_r2_object_missing',
                    message: 'immutable R2 object is missing',
                    entryHash: entry.entry_hash,
                    eventId: entry.eventId,
                    ref: sink.ref,
                  });
                  continue;
                }
                const objectText = await objectBody.text();
                if (objectText !== payload) {
                  issues.push({
                    code: 'immutable_r2_object_mismatch',
                    message: 'immutable R2 object content mismatch',
                    entryHash: entry.entry_hash,
                    eventId: entry.eventId,
                    ref: sink.ref,
                  });
                }
              }
            }
          }
        }
      }

      newerEntry = entry;
    }

    return {
      ok: issues.length === 0,
      mode,
      checked: entries.length,
      limit,
      globalHead: entries[0]?.entry_hash ?? null,
      oldestInWindow: entries.at(-1)?.entry_hash ?? null,
      verifyImmutable: shouldVerifyImmutable,
      issues,
      warnings: Array.from(warningSet.values()),
      inspectedAt: new Date().toISOString(),
    };
  }

  private isApiPath(path: string): boolean {
    return path.startsWith('/api/') || path.startsWith('/v1/school/');
  }

  private routeTemplate(path: string): string {
    if (/^\/v1\/school\/events\/[^/]+\/claimants$/.test(path)) return '/v1/school/events/:eventId/claimants';
    if (/^\/v1\/school\/events\/[^/]+$/.test(path)) return '/v1/school/events/:eventId';
    if (/^\/api\/events\/[^/]+\/claim$/.test(path)) return '/api/events/:eventId/claim';
    return path;
  }

  private eventIdForAudit(path: string, body: unknown): string {
    const schoolEventPath = path.match(/^\/v1\/school\/events\/([^/]+)/);
    if (schoolEventPath?.[1]) return schoolEventPath[1];

    const userEventPath = path.match(/^\/api\/events\/([^/]+)\/claim$/);
    if (userEventPath?.[1]) return userEventPath[1];

    if (body && typeof body === 'object' && 'eventId' in body) {
      const raw = (body as { eventId?: unknown }).eventId;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
    }

    return 'system';
  }

  private maskActorId(id: string): string {
    const trimmed = id.trim();
    if (!trimmed) return 'unknown';
    if (trimmed.length <= 8) return trimmed;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  private actorForAudit(path: string, request: Request, body: unknown): AuditActor {
    if (path.startsWith('/api/admin/') || path.startsWith('/api/master/')) {
      const hasAuth = Boolean(this.extractBearerToken(request));
      return { type: 'operator', id: hasAuth ? 'authenticated' : 'anonymous' };
    }

    if (this.isAdminProtectedSchoolRoute(path, request.method)) {
      const hasAuth = Boolean(this.extractBearerToken(request));
      return { type: 'operator', id: hasAuth ? 'authenticated' : 'anonymous' };
    }

    if (path === '/v1/school/claims') {
      const payload = body as { walletAddress?: unknown; joinToken?: unknown } | undefined;
      const wallet = typeof payload?.walletAddress === 'string' ? payload.walletAddress : '';
      const joinToken = typeof payload?.joinToken === 'string' ? payload.joinToken : '';
      const subject = wallet || joinToken;
      return { type: 'wallet', id: this.maskActorId(subject || 'unknown') };
    }

    if (path === '/api/users/register' || path === '/api/auth/verify' || /^\/api\/events\/[^/]+\/claim$/.test(path)) {
      const payload = body as { userId?: unknown } | undefined;
      const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : '';
      return { type: 'user', id: userId || 'anonymous' };
    }

    if (path.startsWith('/v1/school/')) {
      return { type: 'school', id: 'public-api' };
    }

    return { type: 'system', id: 'api' };
  }

  private isSensitiveKey(key: string): boolean {
    const lowered = key.toLowerCase();
    return (
      lowered.includes('password') ||
      lowered.includes('pin') ||
      lowered.includes('token') ||
      lowered.includes('authorization') ||
      lowered.includes('secret') ||
      lowered.includes('private') ||
      lowered === 'code' ||
      lowered.endsWith('_code')
    );
  }

  private sanitizeAuditValue(value: unknown, depth = 0): unknown {
    if (depth > AUDIT_MAX_DEPTH) return '[TRUNCATED_DEPTH]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (value.length > AUDIT_MAX_STRING) return `${value.slice(0, AUDIT_MAX_STRING)}...`;
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.slice(0, AUDIT_MAX_ARRAY).map((item) => this.sanitizeAuditValue(item, depth + 1));
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const keys = Object.keys(obj).slice(0, AUDIT_MAX_KEYS);
      for (const key of keys) {
        if (this.isSensitiveKey(key)) {
          out[key] = '[REDACTED]';
          continue;
        }
        out[key] = this.sanitizeAuditValue(obj[key], depth + 1);
      }
      return out;
    }
    return String(value);
  }

  private async requestBodyForAudit(request: Request): Promise<unknown> {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return undefined;

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) return undefined;

    try {
      return await request.clone().json();
    } catch {
      return { parseError: 'invalid_json' };
    }
  }

  private apiAuditEventName(method: string, route: string): string {
    const token = route
      .replace(/^\/+/, '')
      .replace(/[:]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return `API_${method.toUpperCase()}_${token || 'ROOT'}`;
  }

  private async appendApiAuditTrail(
    request: Request,
    url: URL,
    path: string,
    response: Response,
    requestBody: unknown,
    startedAt: number,
    errorMessage?: string
  ): Promise<void> {
    if (!this.isApiPath(path) || request.method.toUpperCase() === 'OPTIONS') return;

    const route = this.routeTemplate(path);
    const event = this.apiAuditEventName(request.method, route);
    const actor = this.actorForAudit(path, request, requestBody);
    const eventId = this.eventIdForAudit(path, requestBody);

    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) query[k] = v;
    const hasQuery = Object.keys(query).length > 0;

    const data: Record<string, unknown> = {
      route,
      method: request.method.toUpperCase(),
      status: response.status,
      statusClass: response.status >= 500 ? '5xx' : response.status >= 400 ? '4xx' : response.status >= 300 ? '3xx' : '2xx',
      durationMs: Date.now() - startedAt,
      hasAuthorization: Boolean(request.headers.get('Authorization')),
      origin: request.headers.get('origin') ?? '',
      requestBody: this.sanitizeAuditValue(requestBody),
      ...(hasQuery ? { query: this.sanitizeAuditValue(query) } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };

    try {
      await this.appendAuditLog(event, actor, data, eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[audit] failed to append API audit trail', { event, path, message });
      if (this.isAuditFailClosed(request.method)) {
        throw new Error(`audit append failed: ${message}`);
      }
    }
  }

  private async handleRequest(request: Request, path: string): Promise<Response> {

    const metadataMatch = path.match(/^\/metadata\/([^/]+)\.json$/);
    if (metadataMatch && request.method === 'GET') {
      const mint = metadataMatch[1]?.trim() ?? '';
      if (!MINT_BASE58_RE.test(mint)) {
        return Response.json({ error: 'invalid mint' }, { status: 400 });
      }

      const events = await this.store.getEvents();
      const linked = events.find((event) => event.solanaMint === mint);

      const title = linked?.title?.trim() || `We-ne Ticket ${mint.slice(0, 6)}`;
      const symbol = buildTokenSymbol(linked?.title?.trim() || '');
      const description = linked
        ? `${linked.title} の参加券トークン`
        : 'we-ne participation ticket token';

      const metadata = {
        name: title,
        symbol,
        description,
        image: TOKEN_IMAGE_URL,
        external_url: 'https://instant-grant-core.pages.dev/',
        attributes: [
          { trait_type: 'mint', value: mint },
          { trait_type: 'event_id', value: linked?.id ?? 'unknown' },
          { trait_type: 'host', value: linked?.host ?? 'unknown' },
          { trait_type: 'datetime', value: linked?.datetime ?? 'unknown' },
          { trait_type: 'claim_interval_days', value: linked?.claimIntervalDays ?? 30 },
          {
            trait_type: 'max_claims_per_interval',
            value: linked?.maxClaimsPerInterval === null
              ? 'unlimited'
              : (linked?.maxClaimsPerInterval ?? 1),
          },
        ],
        properties: {
          category: 'image',
          files: [{ uri: TOKEN_IMAGE_URL, type: 'image/png' }],
        },
      };

      return new Response(JSON.stringify(metadata), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }

    // GET /api/master/audit-logs (Master Password required)
    if (path === '/api/master/audit-logs' && request.method === 'GET') {
      const authError = this.requireMasterAuthorization(request);
      if (authError) {
        return authError;
      }
      const logs = await this.getAuditLogs();
      return Response.json({ logs });
    }

    // GET /api/master/audit-integrity (Master Password required)
    if (path === '/api/master/audit-integrity' && request.method === 'GET') {
      const authError = this.requireMasterAuthorization(request);
      if (authError) {
        return authError;
      }
      const url = new URL(request.url);
      const limit = parseBoundedInt(
        url.searchParams.get('limit'),
        AUDIT_INTEGRITY_DEFAULT_LIMIT,
        1,
        AUDIT_INTEGRITY_MAX_LIMIT
      );
      const verifyImmutable = parseBooleanQuery(url.searchParams.get('verifyImmutable'), true);
      const report = await this.verifyAuditIntegrity(limit, verifyImmutable);
      const status = report.ok ? 200 : 409;
      return Response.json(report, { status });
    }

    // POST /api/admin/invite (Master Password required)
    if (path === '/api/admin/invite' && request.method === 'POST') {
      const authError = this.requireMasterAuthorization(request);
      if (authError) {
        return authError;
      }

      let body: { name?: string };
      try {
        body = (await request.json()) as any;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : 'Unknown Admin';

      // Generate secure random code
      const code = crypto.randomUUID().replace(/-/g, '');
      await this.ctx.storage.put(adminCodeKey(code), {
        name,
        createdAt: new Date().toISOString(),
      });

      return Response.json({ code, name });
    }

    // GET /api/admin/invites (Master Password required)
    if (path === '/api/admin/invites' && request.method === 'GET') {
      const authError = this.requireMasterAuthorization(request);
      if (authError) {
        return authError;
      }

      const result = await this.ctx.storage.list({ prefix: 'admin_code:' });
      const invites = Array.from(result.entries()).map(([k, v]) => {
        const code = k.replace('admin_code:', '');
        return { code, ...(v as any) };
      });
      invites.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return Response.json({ invites });
    }

    // POST /api/admin/revoke (Master Password required)
    if (path === '/api/admin/revoke' && request.method === 'POST') {
      const authError = this.requireMasterAuthorization(request);
      if (authError) {
        return authError;
      }
      let body: { code?: string };
      try {
        body = (await request.json()) as any;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      if (typeof body?.code !== 'string') {
        return Response.json({ error: 'code required' }, { status: 400 });
      }
      const deleted = await this.ctx.storage.delete(adminCodeKey(body.code));
      return Response.json({ success: deleted });
    }

    // POST /api/admin/login
    if (path === '/api/admin/login' && request.method === 'POST') {
      let body: { password?: string };
      try {
        body = (await request.json()) as { password?: string };
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }

      const password = typeof body?.password === 'string' ? body.password : '';
      const masterPassword = this.getConfiguredMasterPassword();
      const demoPassword = this.getConfiguredDemoPassword();

      if (masterPassword && password === masterPassword) {
        return Response.json({ ok: true, role: 'master' });
      }

      if (demoPassword && password === demoPassword) {
        return Response.json({
          ok: true,
          role: 'admin',
          info: { name: 'Demo Admin', source: 'demo' },
        });
      }

      // Check Issued Admin Codes
      const adminData = await this.ctx.storage.get(adminCodeKey(password));
      if (adminData) {
        return Response.json({ ok: true, role: 'admin', info: adminData });
      }

      return Response.json({ error: 'invalid password' }, { status: 401 });
    }

    if (path === '/v1/school/events' && request.method === 'GET') {
      const items = await this.store.getEvents();
      return Response.json({ items, nextCursor: undefined });
    }

    // POST /v1/school/events — イベント新規作成（admin用）
    if (path === '/v1/school/events' && request.method === 'POST') {
      const authError = await this.requireAdminAuthorization(request);
      if (authError) {
        return authError;
      }

      let body: {
        title?: string;
        datetime?: string;
        host?: string;
        state?: 'draft' | 'published';
        solanaMint?: string;
        solanaAuthority?: string;
        solanaGrantId?: string;
        ticketTokenAmount?: number | string;
        claimIntervalDays?: number | string;
        maxClaimsPerInterval?: number | string | null;
      };
      try {
        body = (await request.json()) as any;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const datetime = typeof body?.datetime === 'string' ? body.datetime.trim() : '';
      const host = typeof body?.host === 'string' ? body.host.trim() : '';
      const rawTokenAmount = body?.ticketTokenAmount;
      const ticketTokenAmount =
        typeof rawTokenAmount === 'number' && Number.isFinite(rawTokenAmount)
          ? Math.floor(rawTokenAmount)
          : typeof rawTokenAmount === 'string' && /^\d+$/.test(rawTokenAmount.trim())
            ? Number.parseInt(rawTokenAmount.trim(), 10)
            : NaN;
      const rawClaimIntervalDays = body?.claimIntervalDays;
      const claimIntervalDays =
        typeof rawClaimIntervalDays === 'number' && Number.isFinite(rawClaimIntervalDays)
          ? Math.floor(rawClaimIntervalDays)
          : typeof rawClaimIntervalDays === 'string' && /^\d+$/.test(rawClaimIntervalDays.trim())
            ? Number.parseInt(rawClaimIntervalDays.trim(), 10)
            : 30;
      const rawMaxClaimsPerInterval = body?.maxClaimsPerInterval;
      const maxClaimsPerInterval =
        rawMaxClaimsPerInterval === null || rawMaxClaimsPerInterval === 'unlimited'
          ? null
          : typeof rawMaxClaimsPerInterval === 'number' && Number.isFinite(rawMaxClaimsPerInterval)
            ? Math.floor(rawMaxClaimsPerInterval)
            : typeof rawMaxClaimsPerInterval === 'string' && /^\d+$/.test(rawMaxClaimsPerInterval.trim())
              ? Number.parseInt(rawMaxClaimsPerInterval.trim(), 10)
              : 1;

      if (!title || !datetime || !host) {
        return Response.json({ error: 'title, datetime, host are required' }, { status: 400 });
      }
      if (!Number.isInteger(ticketTokenAmount) || ticketTokenAmount <= 0) {
        return Response.json({ error: 'ticketTokenAmount must be a positive integer' }, { status: 400 });
      }
      if (!Number.isInteger(claimIntervalDays) || claimIntervalDays <= 0) {
        return Response.json({ error: 'claimIntervalDays must be a positive integer' }, { status: 400 });
      }
      if (maxClaimsPerInterval !== null && (!Number.isInteger(maxClaimsPerInterval) || maxClaimsPerInterval <= 0)) {
        return Response.json({ error: 'maxClaimsPerInterval must be null or a positive integer' }, { status: 400 });
      }
      const event = await this.store.createEvent({
        title, datetime, host, state: body.state,
        solanaMint: body.solanaMint,
        solanaAuthority: body.solanaAuthority,
        solanaGrantId: body.solanaGrantId,
        ticketTokenAmount,
        claimIntervalDays,
        maxClaimsPerInterval,
      });
      // Audit Log
      await this.appendAuditLog(
        'EVENT_CREATE',
        { type: 'admin', id: 'admin' },
        {
          title,
          datetime,
          host,
          eventId: event.id,
          solanaMint: body.solanaMint,
          ticketTokenAmount,
          claimIntervalDays,
          maxClaimsPerInterval,
        },
        event.id
      );
      return Response.json(event, { status: 201 });
    }

    const eventIdMatch = path.match(/^\/v1\/school\/events\/([^/]+)$/);
    if (eventIdMatch && request.method === 'GET') {
      const eventId = eventIdMatch[1];
      const event = await this.store.getEvent(eventId);
      if (!event) {
        return Response.json(
          { success: false, error: { code: 'not_found', message: 'イベントが見つかりません' } } as SchoolClaimResult,
          { status: 404 }
        );
      }
      return Response.json(event);
    }

    // GET /v1/school/events/:eventId/claimants — 参加者一覧
    const claimantsMatch = path.match(/^\/v1\/school\/events\/([^/]+)\/claimants$/);
    if (claimantsMatch && request.method === 'GET') {
      const authError = await this.requireAdminAuthorization(request);
      if (authError) {
        return authError;
      }

      const eventId = claimantsMatch[1];
      const event = await this.store.getEvent(eventId);
      if (!event) {
        return Response.json({ error: 'event not found' }, { status: 404 });
      }
      const claimants = await this.store.getClaimants(eventId);
      // subject が user ID の場合 displayName を引く
      const items = await Promise.all(claimants.map(async (c) => {
        let displayName: string | undefined;
        const userRaw = await this.ctx.storage.get(userKey(c.subject));
        if (userRaw && typeof userRaw === 'object' && 'displayName' in userRaw) {
          displayName = (userRaw as { displayName: string }).displayName;
        }
        return {
          subject: c.subject,
          displayName: displayName ?? '-',
          confirmationCode: c.confirmationCode,
          claimedAt: c.claimedAt ? new Date(c.claimedAt).toISOString() : undefined,
        };
      }));
      return Response.json({ eventId, eventTitle: event.title, items });
    }

    if (path === '/v1/school/pop-status' && request.method === 'GET') {
      let signerConfigured = false;
      let signerPubkey: string | null = null;
      let error: string | null = null;
      try {
        const signer = this.getPopSigner();
        signerConfigured = signer !== null;
        signerPubkey = signer?.signerPubkey ?? null;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      return Response.json({
        enforceOnchainPop: this.isOnchainPopEnforced(),
        signerConfigured,
        signerPubkey,
        error,
      });
    }

    if (path === '/v1/school/audit-status' && request.method === 'GET') {
      return Response.json(this.getAuditStatus());
    }

    if (path === '/v1/school/pop-proof' && request.method === 'POST') {
      let body: PopProofBody;
      try {
        body = (await request.json()) as PopProofBody;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      try {
        const proof = await this.issuePopClaimProof(body);
        return Response.json(proof);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status =
          message.includes('not configured') ? 500 :
            message.includes('not found') ? 404 :
              message.includes('not available') ? 400 :
                message.includes('invalid') || message.includes('out of range') ? 400 : 500;
        return Response.json({ error: message }, { status });
      }
    }

    if (path === '/v1/school/claims' && request.method === 'POST') {
      let body: ClaimBody;
      try {
        body = (await request.json()) as ClaimBody;
      } catch {
        return Response.json({
          success: false,
          error: { code: 'invalid', message: 'イベントIDが無効です' },
        } as SchoolClaimResult);
      }
      const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
      const event = eventId ? await this.store.getEvent(eventId) : null;
      if (!event) {
        return Response.json({
          success: false,
          error: { code: 'not_found', message: 'イベントが見つかりません' },
        } as SchoolClaimResult);
      }
      if (this.isOnchainPopEnforced() && this.isEventOnchainConfigured(event)) {
        let signerConfigured = false;
        try {
          signerConfigured = this.getPopSigner() !== null;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({
            success: false,
            error: { code: 'retryable', message: `PoP設定エラー: ${message}` },
          } as SchoolClaimResult);
        }
        if (!signerConfigured) {
          return Response.json({
            success: false,
            error: { code: 'retryable', message: 'PoP署名設定が未完了のためオンチェーン参加を受け付けできません' },
          } as SchoolClaimResult);
        }
        const fields = this.getOnchainProofFields(body);
        const invalidReason = this.validateOnchainProofFields(fields);
        if (invalidReason) {
          return Response.json({
            success: false,
            error: { code: 'wallet_required', message: `オンチェーンPoP証跡が必要です: ${invalidReason}` },
          } as SchoolClaimResult);
        }
      }
      const result = await this.store.submitClaim(body);

      // Audit Log
      if (result.success && !result.alreadyJoined) {
        await this.appendAuditLog('WALLET_CLAIM', { type: 'wallet', id: body.walletAddress || body.joinToken || 'unknown' }, body, body.eventId || 'unknown');
      }
      return Response.json(result);
    }

    // POST /api/auth/verify
    if (path === '/api/auth/verify' && request.method === 'POST') {
      let body: { userId?: string; pin?: string };
      try {
        body = (await request.json()) as { userId?: string; pin?: string };
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
      const pin = typeof body?.pin === 'string' ? body.pin : '';
      if (!userId || !pin) {
        return Response.json({ error: 'missing params' }, { status: 400 });
      }
      const userRaw = await this.ctx.storage.get(userKey(userId));
      if (!userRaw || typeof userRaw !== 'object' || !('pinHash' in userRaw)) {
        return Response.json({ message: 'User not found', code: 'user_not_found' }, { status: 401 });
      }
      const pinHash = await hashPin(pin);
      if ((userRaw as { pinHash: string }).pinHash !== pinHash) {
        return Response.json({ message: 'Invalid PIN', code: 'invalid_pin' }, { status: 401 });
      }
      return Response.json({ ok: true });
    }

    // POST /api/users/register
    if (path === '/api/users/register' && request.method === 'POST') {
      let body: RegisterBody;
      try {
        body = (await request.json()) as RegisterBody;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 32) : '';
      const pin = typeof body?.pin === 'string' ? body.pin : '';
      if (!displayName || displayName.length < 1) {
        return Response.json({ error: 'displayName required (1-32)' }, { status: 400 });
      }
      if (!/^\d{4,6}$/.test(pin)) {
        return Response.json({ error: 'pin must be 4-6 digits' }, { status: 400 });
      }
      const userId = crypto.randomUUID();
      const pinHash = await hashPin(pin);
      await this.ctx.storage.put(userKey(userId), { pinHash, displayName });

      // Audit Log
      await this.appendAuditLog('USER_REGISTER', { type: 'user', id: userId }, { displayName }, 'system');

      return Response.json({ userId });
    }

    // POST /api/events/:eventId/claim (userId + pin)
    const claimMatch = path.match(/^\/api\/events\/([^/]+)\/claim$/);
    if (claimMatch && request.method === 'POST') {
      const eventId = claimMatch[1].trim();
      let body: UserClaimBody;
      try {
        body = (await request.json()) as UserClaimBody;
      } catch {
        return Response.json({ error: 'missing params' }, { status: 400 });
      }
      const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
      const pin = typeof body?.pin === 'string' ? body.pin : '';
      if (!userId || !pin) {
        return Response.json({ error: 'missing params' }, { status: 400 });
      }
      const userRaw = await this.ctx.storage.get(userKey(userId));
      if (!userRaw || typeof userRaw !== 'object' || !('pinHash' in userRaw)) {
        return Response.json({ message: 'User not found', code: 'user_not_found' }, { status: 401 });
      }
      const pinHash = await hashPin(pin);
      if ((userRaw as { pinHash: string }).pinHash !== pinHash) {
        return Response.json({ message: 'Invalid PIN', code: 'invalid_pin' }, { status: 401 });
      }
      const event = await this.store.getEvent(eventId);
      if (!event) {
        return Response.json({ error: 'event not found' }, { status: 404 });
      }
      if (event.state && event.state !== 'published') {
        return Response.json({ error: 'event not available' }, { status: 400 });
      }
      if (this.isOnchainPopEnforced() && this.isEventOnchainConfigured(event)) {
        let signerConfigured = false;
        try {
          signerConfigured = this.getPopSigner() !== null;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ error: `PoP configuration error: ${message}` }, { status: 500 });
        }
        if (!signerConfigured) {
          return Response.json({ error: 'PoP signer is not configured' }, { status: 500 });
        }
        const proofFields = this.getOnchainProofFields(body);
        const invalidReason = this.validateOnchainProofFields(proofFields);
        if (invalidReason) {
          return Response.json({ error: `on-chain claim proof required: ${invalidReason}` }, { status: 400 });
        }
      }
      const already = await this.store.hasClaimed(eventId, userId, event);
      if (already) {
        const rec = await this.store.getClaimRecord(eventId, userId);
        const confirmationCode = rec?.confirmationCode ?? genConfirmationCode();
        return Response.json({ status: 'already', confirmationCode } as UserClaimResponse);
      }
      const confirmationCode = genConfirmationCode();
      await this.store.addClaim(eventId, userId, confirmationCode);

      // Audit Log
      await this.appendAuditLog('USER_CLAIM', { type: 'user', id: userId }, { eventId, status: 'created', confirmationCode }, eventId);

      return Response.json({ status: 'created', confirmationCode } as UserClaimResponse);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': this.env.CORS_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const startedAt = Date.now();
    const requestBody = await this.requestBodyForAudit(request);

    let response: Response;
    let errorMessage: string | undefined;

    try {
      response = await this.handleRequest(request, path);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      response = Response.json({ error: 'internal server error' }, { status: 500 });
    }

    try {
      await this.appendApiAuditTrail(request, url, path, response, requestBody, startedAt, errorMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.isAuditFailClosed(request.method)) {
        return Response.json({ error: 'audit log persistence failed', detail: message }, { status: 503 });
      }
      console.error('[audit] non-blocking append failure', { path, method: request.method, message });
    }
    return response;
  }
}
