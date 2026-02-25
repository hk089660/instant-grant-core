/**
 * 利用者識別用 localStorage キーとユーティリティ
 * 同一端末 = 同一 subject のため Web では localStorage に永続化
 */

export const USER_ID_KEY = 'we_ne_user_id';
export const DISPLAY_NAME_KEY = 'we_ne_display_name';
export const SESSION_TOKEN_KEY = 'we_ne_session_token';

export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(USER_ID_KEY);
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USER_ID_KEY, userId.trim());
  } catch {
    // ignore
  }
}

export function getDisplayName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(DISPLAY_NAME_KEY);
    const normalized = typeof v === 'string' ? v.trim() : '';
    return normalized || null;
  } catch {
    return null;
  }
}

export function setDisplayName(displayName: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISPLAY_NAME_KEY, displayName.trim());
  } catch {
    // ignore
  }
}

export function clearDisplayName(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DISPLAY_NAME_KEY);
  } catch {
    // ignore
  }
}

export function clearUser(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(USER_ID_KEY);
    window.localStorage.removeItem(DISPLAY_NAME_KEY);
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // ignore
  }
}
