const SESSION_STORAGE_KEY = 'phantom_web_return_path';
const LOCAL_STORAGE_KEY = 'phantom_web_return_path_shared_v1';
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

type StoredReturnPath = {
  path: string;
  createdAt: number;
};

const isWeb = (): boolean => typeof window !== 'undefined';

const sanitizePath = (value: string | null): string | null => {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('/phantom-callback')) return null;
  return value;
};

const parseStoredReturnPath = (raw: string | null): StoredReturnPath | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredReturnPath>;
    if (!parsed || typeof parsed !== 'object') return null;
    const path = sanitizePath(typeof parsed.path === 'string' ? parsed.path : null);
    if (!path) return null;
    const createdAt =
      typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : Date.now();
    return { path, createdAt };
  } catch {
    const legacyPath = sanitizePath(raw);
    if (!legacyPath) return null;
    return { path: legacyPath, createdAt: Date.now() };
  }
};

const isFresh = (createdAt: number, maxAgeMs: number): boolean => Date.now() - createdAt <= maxAgeMs;

const readStoredReturnPath = (): StoredReturnPath | null => {
  if (!isWeb()) return null;
  let sessionRaw: string | null = null;
  try {
    sessionRaw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    sessionRaw = null;
  }
  const fromSession = parseStoredReturnPath(sessionRaw);
  if (fromSession) return fromSession;

  let localRaw: string | null = null;
  try {
    localRaw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    localRaw = null;
  }
  return parseStoredReturnPath(localRaw);
};

const clearStoredReturnPath = (): void => {
  if (!isWeb()) return;
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
};

/**
 * Web で Phantom 接続前の戻り先を保存する。
 * 例: /wallet, /r/evt-001?code=abc
 */
export const setPhantomWebReturnPath = (path: string): void => {
  if (!isWeb()) return;
  const safePath = sanitizePath(path);
  if (!safePath) return;
  const payload: StoredReturnPath = {
    path: safePath,
    createdAt: Date.now(),
  };
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
};

/**
 * 保存済みの戻り先を1回だけ取得する（取得後に削除）。
 */
export const consumePhantomWebReturnPath = (): string | null => {
  if (!isWeb()) return null;
  const parsed = readStoredReturnPath();
  clearStoredReturnPath();
  if (!parsed) return null;
  if (!isFresh(parsed.createdAt, DEFAULT_MAX_AGE_MS)) return null;
  return parsed.path;
};
