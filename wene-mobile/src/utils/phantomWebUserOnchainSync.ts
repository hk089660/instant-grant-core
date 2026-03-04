const STORAGE_KEY = 'phantom_web_user_onchain_sync_v1';
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

export interface PhantomWebUserOnchainSyncContext {
  eventId: string;
  userId: string;
  pin: string;
  confirmationCode: string;
  walletAddress?: string;
  eventName?: string;
  receiptPubkey?: string;
  mintAddress?: string;
  popEntryHash?: string;
  popAuditHash?: string;
  popSigner?: string;
  auditReceiptId?: string;
  auditReceiptHash?: string;
  createdAt: number;
}

function isWebRuntime(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function parseContext(raw: string | null): PhantomWebUserOnchainSyncContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PhantomWebUserOnchainSyncContext>;
    if (!parsed || typeof parsed !== 'object') return null;
    const eventId = normalizeOptionalString(parsed.eventId);
    const userId = normalizeOptionalString(parsed.userId);
    const pin = normalizeOptionalString(parsed.pin);
    const confirmationCode = normalizeOptionalString(parsed.confirmationCode);
    const createdAt = typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
      ? parsed.createdAt
      : Date.now();
    if (!eventId || !userId || !pin || !confirmationCode) return null;
    return {
      eventId,
      userId: userId.toLowerCase(),
      pin,
      confirmationCode,
      walletAddress: normalizeOptionalString(parsed.walletAddress),
      eventName: normalizeOptionalString(parsed.eventName),
      receiptPubkey: normalizeOptionalString(parsed.receiptPubkey),
      mintAddress: normalizeOptionalString(parsed.mintAddress),
      popEntryHash: normalizeOptionalString(parsed.popEntryHash),
      popAuditHash: normalizeOptionalString(parsed.popAuditHash),
      popSigner: normalizeOptionalString(parsed.popSigner),
      auditReceiptId: normalizeOptionalString(parsed.auditReceiptId),
      auditReceiptHash: normalizeOptionalString(parsed.auditReceiptHash),
      createdAt,
    };
  } catch {
    return null;
  }
}

export function clearPhantomWebUserOnchainSyncContext(): void {
  if (!isWebRuntime()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function savePhantomWebUserOnchainSyncContext(
  context: Omit<PhantomWebUserOnchainSyncContext, 'createdAt'>
): void {
  if (!isWebRuntime()) return;
  const eventId = context.eventId.trim();
  const userId = context.userId.trim().toLowerCase();
  const pin = context.pin.trim();
  const confirmationCode = context.confirmationCode.trim();
  if (!eventId || !userId || !pin || !confirmationCode) return;
  const payload: PhantomWebUserOnchainSyncContext = {
    eventId,
    userId,
    pin,
    confirmationCode,
    walletAddress: normalizeOptionalString(context.walletAddress),
    eventName: normalizeOptionalString(context.eventName),
    receiptPubkey: normalizeOptionalString(context.receiptPubkey),
    mintAddress: normalizeOptionalString(context.mintAddress),
    popEntryHash: normalizeOptionalString(context.popEntryHash),
    popAuditHash: normalizeOptionalString(context.popAuditHash),
    popSigner: normalizeOptionalString(context.popSigner),
    auditReceiptId: normalizeOptionalString(context.auditReceiptId),
    auditReceiptHash: normalizeOptionalString(context.auditReceiptHash),
    createdAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

export function patchPhantomWebUserOnchainSyncContext(
  patch: Partial<Omit<PhantomWebUserOnchainSyncContext, 'eventId' | 'userId' | 'pin' | 'confirmationCode' | 'createdAt'>>
): void {
  if (!isWebRuntime()) return;
  const current = parseContext(window.sessionStorage.getItem(STORAGE_KEY));
  if (!current) return;
  const next: PhantomWebUserOnchainSyncContext = {
    ...current,
    walletAddress: normalizeOptionalString(patch.walletAddress) ?? current.walletAddress,
    eventName: normalizeOptionalString(patch.eventName) ?? current.eventName,
    receiptPubkey: normalizeOptionalString(patch.receiptPubkey) ?? current.receiptPubkey,
    mintAddress: normalizeOptionalString(patch.mintAddress) ?? current.mintAddress,
    popEntryHash: normalizeOptionalString(patch.popEntryHash) ?? current.popEntryHash,
    popAuditHash: normalizeOptionalString(patch.popAuditHash) ?? current.popAuditHash,
    popSigner: normalizeOptionalString(patch.popSigner) ?? current.popSigner,
    auditReceiptId: normalizeOptionalString(patch.auditReceiptId) ?? current.auditReceiptId,
    auditReceiptHash: normalizeOptionalString(patch.auditReceiptHash) ?? current.auditReceiptHash,
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
}

export function consumePhantomWebUserOnchainSyncContext(options?: {
  eventId?: string;
  maxAgeMs?: number;
}): PhantomWebUserOnchainSyncContext | null {
  if (!isWebRuntime()) return null;
  const parsed = parseContext(window.sessionStorage.getItem(STORAGE_KEY));
  clearPhantomWebUserOnchainSyncContext();
  if (!parsed) return null;
  const eventId = options?.eventId?.trim();
  if (eventId && parsed.eventId !== eventId) return null;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (Date.now() - parsed.createdAt > maxAgeMs) return null;
  return parsed;
}

