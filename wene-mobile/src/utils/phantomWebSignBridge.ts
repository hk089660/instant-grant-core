import { Transaction } from '@solana/web3.js';

const STORAGE_KEY = 'phantom_web_sign_result_v1';
const EVENT_NAME = 'phantom-web-sign-result';
const MESSAGE_TYPE = 'PHANTOM_WEB_SIGN_RESULT_V1';

type StoredResult =
  | { status: 'ok'; txBase64: string; ts: number }
  | { status: 'error'; error: string; ts: number };

export type PhantomWebSignResult =
  | { ok: true; tx: Transaction; ts: number }
  | { ok: false; error: string; ts: number };

const isWeb = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function nowTs(): number {
  return Date.now();
}

function serializeTx(tx: Transaction): string {
  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return Buffer.from(serialized).toString('base64');
}

function deserializeTx(base64: string): Transaction {
  const bytes = Buffer.from(base64, 'base64');
  return Transaction.from(bytes);
}

function parseStored(raw: string | null): StoredResult | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredResult>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.status === 'ok' && typeof parsed.txBase64 === 'string') {
      return {
        status: 'ok',
        txBase64: parsed.txBase64,
        ts: typeof parsed.ts === 'number' ? parsed.ts : nowTs(),
      };
    }
    if (parsed.status === 'error' && typeof parsed.error === 'string') {
      return {
        status: 'error',
        error: parsed.error,
        ts: typeof parsed.ts === 'number' ? parsed.ts : nowTs(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function toRuntimeResult(stored: StoredResult): PhantomWebSignResult {
  if (stored.status === 'ok') {
    return { ok: true, tx: deserializeTx(stored.txBase64), ts: stored.ts };
  }
  return { ok: false, error: stored.error, ts: stored.ts };
}

function writeStored(stored: StoredResult): void {
  if (!isWeb()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new Event(EVENT_NAME));
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: MESSAGE_TYPE }, window.location.origin);
    }
  } catch {
    // no-op
  }
}

export function clearPhantomWebSignResult(): void {
  if (!isWeb()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function publishPhantomWebSignSuccess(tx: Transaction): void {
  writeStored({
    status: 'ok',
    txBase64: serializeTx(tx),
    ts: nowTs(),
  });
}

export function publishPhantomWebSignError(error: string): void {
  writeStored({
    status: 'error',
    error: error || 'Phantom署名に失敗しました',
    ts: nowTs(),
  });
}

export function consumePhantomWebSignResult(): PhantomWebSignResult | null {
  if (!isWeb()) return null;
  let stored: StoredResult | null = null;
  try {
    stored = parseStored(window.localStorage.getItem(STORAGE_KEY));
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (!stored) return null;
  try {
    return toRuntimeResult(stored);
  } catch {
    return { ok: false, error: '署名結果の復元に失敗しました', ts: nowTs() };
  }
}

export function subscribePhantomWebSignResult(
  handler: (result: PhantomWebSignResult) => void
): () => void {
  if (!isWeb()) return () => {};

  const dispatchIfAny = () => {
    const result = consumePhantomWebSignResult();
    if (result) handler(result);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    dispatchIfAny();
  };

  const onCustom = () => {
    dispatchIfAny();
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string } | null;
    if (!data || data.type !== MESSAGE_TYPE) return;
    dispatchIfAny();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, onCustom as EventListener);
  window.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, onCustom as EventListener);
    window.removeEventListener('message', onMessage);
  };
}
