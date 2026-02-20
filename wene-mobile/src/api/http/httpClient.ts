/**
 * fetch ラッパー: timeout, JSON parse, エラー時は SchoolClaimResult に寄せる
 */

import type { SchoolClaimResult } from '../../types/school';

const DEFAULT_TIMEOUT_MS = 15000;

export async function httpGet<T>(
  url: string,
  options?: { timeoutMs?: number; headers?: Record<string, string> }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      }
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new HttpError(res.status, errBody);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new HttpError(0, { message: msg });
  }
}

export async function httpPost<T>(
  url: string,
  body: unknown,
  options?: { timeoutMs?: number; headers?: Record<string, string> }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options?.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpError(res.status, data);
    }
    return data as T;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new HttpError(0, { message: msg });
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(typeof body === 'object' && body !== null && 'message' in body ? String((body as { message: string }).message) : `HTTP ${status}`);
  }
}

/** ネットワークエラー等を SchoolClaimResult の retryable に変換 */
export function toSchoolClaimResult(err: unknown): SchoolClaimResult {
  if (err instanceof HttpError && err.body && typeof err.body === 'object' && 'success' in err.body && (err.body as SchoolClaimResult).success === false) {
    const failure = err.body as SchoolClaimResult;
    if ('error' in failure && failure.error && typeof failure.error === 'object' && 'code' in failure.error) {
      return failure;
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    success: false,
    error: { code: 'retryable', message: message || '接続できませんでした。しばらくしてから再試行してください。' },
  };
}
