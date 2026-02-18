/**
 * 依存注入ファクトリ
 * 常に HTTP 実装を使用する。screens/hooks は deps 経由のみ使用する。
 */

import type { SchoolClaimClient, SchoolEventProvider } from './schoolClaimClient';
import { createHttpSchoolEventProvider } from './http/HttpSchoolEventProvider';
import { createHttpSchoolClaimClient } from './http/HttpSchoolClaimClient';

export interface SchoolDeps {
  eventProvider: SchoolEventProvider;
  claimClient: SchoolClaimClient;
}

let cached: SchoolDeps | null = null;

function resolveBaseUrl(): string {
  // Web: _redirects で /v1/* → Workers プロキシされるため同一オリジンを使用
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  // Native: 環境変数から取得
  const envBase = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (envBase) return envBase;
  throw new Error('EXPO_PUBLIC_API_BASE_URL is required for native builds');
}

export function createSchoolDeps(): SchoolDeps {
  const baseUrl = resolveBaseUrl();
  return {
    eventProvider: createHttpSchoolEventProvider({ baseUrl }),
    claimClient: createHttpSchoolClaimClient({ baseUrl }),
  };
}

export function getSchoolDeps(): SchoolDeps {
  if (!cached) cached = createSchoolDeps();
  return cached;
}

export function resetSchoolDeps(): void {
  cached = null;
}
