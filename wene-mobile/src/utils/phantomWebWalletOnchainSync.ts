const SESSION_STORAGE_KEY = 'phantom_web_wallet_onchain_sync_v1';
const LOCAL_STORAGE_KEY = 'phantom_web_wallet_onchain_sync_shared_v1';
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

export interface PhantomWebWalletOnchainSyncContext {
  campaignId: string;
  confirmationCode: string;
  walletAddress?: string;
  eventName?: string;
  receiptPubkey?: string;
  mintAddress?: string;
  auditReceiptId?: string;
  auditReceiptHash?: string;
  createdAt: number;
}

function isWebRuntime(): boolean {
  return typeof window !== 'undefined';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function parseContext(raw: string | null): PhantomWebWalletOnchainSyncContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PhantomWebWalletOnchainSyncContext>;
    if (!parsed || typeof parsed !== 'object') return null;
    const campaignId = normalizeOptionalString(parsed.campaignId);
    const confirmationCode = normalizeOptionalString(parsed.confirmationCode);
    const createdAt = typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
      ? parsed.createdAt
      : Date.now();
    if (!campaignId || !confirmationCode) return null;
    return {
      campaignId,
      confirmationCode,
      walletAddress: normalizeOptionalString(parsed.walletAddress),
      eventName: normalizeOptionalString(parsed.eventName),
      receiptPubkey: normalizeOptionalString(parsed.receiptPubkey),
      mintAddress: normalizeOptionalString(parsed.mintAddress),
      auditReceiptId: normalizeOptionalString(parsed.auditReceiptId),
      auditReceiptHash: normalizeOptionalString(parsed.auditReceiptHash),
      createdAt,
    };
  } catch {
    return null;
  }
}

function readStoredContextRaw(): string | null {
  if (!isWebRuntime()) return null;
  let sessionRaw: string | null = null;
  try {
    sessionRaw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    sessionRaw = null;
  }
  if (sessionRaw) return sessionRaw;

  let localRaw: string | null = null;
  try {
    localRaw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    localRaw = null;
  }
  return localRaw;
}

function writeContext(payload: PhantomWebWalletOnchainSyncContext): void {
  if (!isWebRuntime()) return;
  const serialized = JSON.stringify(payload);
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
  } catch {
    // no-op
  }
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
  } catch {
    // no-op
  }
}

export function clearPhantomWebWalletOnchainSyncContext(): void {
  if (!isWebRuntime()) return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // no-op
  }
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function savePhantomWebWalletOnchainSyncContext(
  context: Omit<PhantomWebWalletOnchainSyncContext, 'createdAt'>
): void {
  if (!isWebRuntime()) return;
  const campaignId = context.campaignId.trim();
  const confirmationCode = context.confirmationCode.trim();
  if (!campaignId || !confirmationCode) return;

  const payload: PhantomWebWalletOnchainSyncContext = {
    campaignId,
    confirmationCode,
    walletAddress: normalizeOptionalString(context.walletAddress),
    eventName: normalizeOptionalString(context.eventName),
    receiptPubkey: normalizeOptionalString(context.receiptPubkey),
    mintAddress: normalizeOptionalString(context.mintAddress),
    auditReceiptId: normalizeOptionalString(context.auditReceiptId),
    auditReceiptHash: normalizeOptionalString(context.auditReceiptHash),
    createdAt: Date.now(),
  };
  writeContext(payload);
}

export function patchPhantomWebWalletOnchainSyncContext(
  patch: Partial<Omit<PhantomWebWalletOnchainSyncContext, 'campaignId' | 'confirmationCode' | 'createdAt'>>
): void {
  if (!isWebRuntime()) return;
  const current = parseContext(readStoredContextRaw());
  if (!current) return;
  const next: PhantomWebWalletOnchainSyncContext = {
    ...current,
    walletAddress: normalizeOptionalString(patch.walletAddress) ?? current.walletAddress,
    eventName: normalizeOptionalString(patch.eventName) ?? current.eventName,
    receiptPubkey: normalizeOptionalString(patch.receiptPubkey) ?? current.receiptPubkey,
    mintAddress: normalizeOptionalString(patch.mintAddress) ?? current.mintAddress,
    auditReceiptId: normalizeOptionalString(patch.auditReceiptId) ?? current.auditReceiptId,
    auditReceiptHash: normalizeOptionalString(patch.auditReceiptHash) ?? current.auditReceiptHash,
  };
  writeContext(next);
}

export function consumePhantomWebWalletOnchainSyncContext(options?: {
  campaignId?: string;
  maxAgeMs?: number;
}): PhantomWebWalletOnchainSyncContext | null {
  if (!isWebRuntime()) return null;
  const parsed = parseContext(readStoredContextRaw());
  clearPhantomWebWalletOnchainSyncContext();
  if (!parsed) return null;
  const campaignId = options?.campaignId?.trim();
  if (campaignId && parsed.campaignId !== campaignId) return null;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (Date.now() - parsed.createdAt > maxAgeMs) return null;
  return parsed;
}
