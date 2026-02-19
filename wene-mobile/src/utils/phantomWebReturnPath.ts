const STORAGE_KEY = 'phantom_web_return_path';

const isWeb = (): boolean => typeof window !== 'undefined';

const sanitizePath = (value: string | null): string | null => {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('/phantom-callback')) return null;
  return value;
};

/**
 * Web で Phantom 接続前の戻り先を保存する。
 * 例: /wallet, /r/evt-001?code=abc
 */
export const setPhantomWebReturnPath = (path: string): void => {
  if (!isWeb()) return;
  const safePath = sanitizePath(path);
  if (!safePath) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, safePath);
  } catch {
    // no-op
  }
};

/**
 * 保存済みの戻り先を1回だけ取得する（取得後に削除）。
 */
export const consumePhantomWebReturnPath = (): string | null => {
  if (!isWeb()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return sanitizePath(raw);
  } catch {
    return null;
  }
};
