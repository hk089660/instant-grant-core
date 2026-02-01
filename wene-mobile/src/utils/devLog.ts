/**
 * DEV 専用ログ。本番ビルドでは no-op（SECURITY_REVIEW H1: 本番ログ漏洩防止）
 */
const isDev =
  typeof __DEV__ !== 'undefined' && __DEV__;

export function devLog(...args: unknown[]): void {
  if (isDev) {
    console.log(...args);
  }
}

export function devWarn(...args: unknown[]): void {
  if (isDev) {
    console.warn(...args);
  }
}

export function devError(...args: unknown[]): void {
  if (isDev) {
    console.error(...args);
  }
}
