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

function resolveApiMode(): 'http' {
  const apiMode = (process.env.EXPO_PUBLIC_API_MODE ?? 'http').trim().toLowerCase();
  if (apiMode && apiMode !== 'http') {
    console.warn(`[createSchoolDeps] EXPO_PUBLIC_API_MODE="${apiMode}" is unsupported. Falling back to "http".`);
  }
  return 'http';
}

function resolveBaseUrl(): string {
  // Web: _redirects で /v1/* → Workers プロキシされるため同一オリジンを最優先
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  // Native: 環境変数で指定された Workers URL へ直接アクセス
  const envBase = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (envBase) return envBase;
  throw new Error('EXPO_PUBLIC_API_BASE_URL is required for native builds');
}

export function createSchoolDeps(): SchoolDeps {
  // Default mode is always "http" in production-safe configuration.
  resolveApiMode();
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
