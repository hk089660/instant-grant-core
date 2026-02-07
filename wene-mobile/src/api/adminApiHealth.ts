/**
 * 学校向け API の疎通チェック（管理画面で状態表示用）
 */

import { getSchoolApiBaseUrl } from '../config/api';

const PING_TIMEOUT_MS = 8000;

export interface PingResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * API が有効かつ疎通可能か確認する。
 * - 無効 => { ok: false, error: "disabled" }
 * - 有効 => HEAD /events、失敗時は GET で再試行。8秒でタイムアウト。2xx なら ok: true
 */
export async function pingSchoolApi(): Promise<PingResult> {
  const base = getSchoolApiBaseUrl();
  if (!base) {
    return { ok: false, error: 'disabled' };
  }

  const url = `${base}/events`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const tryFetch = (method: 'HEAD' | 'GET') =>
      fetch(url, {
        method,
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

    let res: Response;
    try {
      res = await tryFetch('HEAD');
    } catch {
      res = await tryFetch('GET');
    }

    clearTimeout(timeoutId);
    const ok = res.status >= 200 && res.status < 300;
    return ok ? { ok: true } : { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e) {
    clearTimeout(timeoutId);
    const message = e instanceof Error ? e.message : String(e);
    const error = e instanceof Error && e.name === 'AbortError' ? 'timeout' : message;
    return { ok: false, error };
  }
}
