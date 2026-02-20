/**
 * Admin 用 API ヘルパー
 * Worker の /v1/school/* エンドポイントを呼び出す
 */

import { HttpError, httpGet, httpPost } from './http/httpClient';
import type { SchoolEvent } from '../types/school';
import { clearAdminSession, getAdminToken } from '../lib/adminAuth';

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const envBase = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (envBase) return envBase;
  throw new Error('EXPO_PUBLIC_API_BASE_URL is required for native builds');
}

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAdminToken();
  if (!token) {
    throw new HttpError(401, { message: '管理者ログインが必要です' });
  }
  return { Authorization: `Bearer ${token}` };
}

async function withAdminAuth<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      await clearAdminSession();
    }
    throw e;
  }
}

/** イベント一覧取得 */
export async function fetchAdminEvents(): Promise<(SchoolEvent & { claimedCount: number })[]> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    const data = await httpGet<{ items: (SchoolEvent & { claimedCount: number })[] }>(`${base}/v1/school/events`, { headers });
    return data.items;
  });
}

/** イベント詳細取得 */
export async function fetchAdminEvent(eventId: string): Promise<SchoolEvent & { claimedCount: number }> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<SchoolEvent & { claimedCount: number }>(`${base}/v1/school/events/${encodeURIComponent(eventId)}`, { headers });
  });
}

/** イベント作成 */
export async function createAdminEvent(data: {
  title: string;
  datetime: string;
  host: string;
  state?: 'draft' | 'published';
  solanaMint?: string;
  solanaAuthority?: string;
  solanaGrantId?: string;
  ticketTokenAmount?: number;
  claimIntervalDays?: number;
  maxClaimsPerInterval?: number | null;
}): Promise<SchoolEvent> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpPost<SchoolEvent>(`${base}/v1/school/events`, data, { headers });
  });
}

/** 参加者一覧 */
export interface Claimant {
  subject: string;
  displayName: string;
  confirmationCode?: string;
  claimedAt?: string;
}

export interface ClaimantsResponse {
  eventId: string;
  eventTitle: string;
  items: Claimant[];
}

export async function fetchClaimants(eventId: string): Promise<ClaimantsResponse> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<ClaimantsResponse>(`${base}/v1/school/events/${encodeURIComponent(eventId)}/claimants`, { headers });
  });
}

/** 管理者パスワード検証 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const res = await loginAdmin(password);
  return res.success;
}

export type AdminRole = 'master' | 'admin';

export interface AdminLoginResult {
  success: boolean;
  role?: AdminRole;
  info?: any;
}

export async function loginAdmin(password: string): Promise<AdminLoginResult> {
  const base = getBaseUrl();
  try {
    const res = await httpPost<{ ok: boolean; role?: AdminRole; info?: any }>(`${base}/api/admin/login`, { password });
    if (res?.ok) {
      return { success: true, role: res.role, info: res.info };
    }
    return { success: false };
  } catch (e) {
    console.warn('loginAdmin failed', e);
    return { success: false };
  }
}

/** 招待コード発行 (Master Only) */
export async function createInviteCode(masterPassword: string, name: string): Promise<{ code: string; name: string }> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/admin/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterPassword}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    throw new Error('Failed to create invite code');
  }
  return res.json();
}

/** 招待コード一覧取得 (Master Only) */
export async function fetchInviteCodes(masterPassword: string): Promise<{ code: string; name: string; createdAt: string }[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/admin/invites`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  return json.invites || [];
}

/** 招待コード無効化 (Master Only) */
export async function revokeInviteCode(masterPassword: string, code: string): Promise<boolean> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/admin/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterPassword}`,
    },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) return false;
  const json = await res.json();
  return json.success === true;
}

/** Audit Log (Master Only) */
export interface MasterAuditLog {
  ts: string;
  event: string;
  eventId: string;
  actor: { type: string; id: string };
  prev_hash: string;
  stream_prev_hash?: string;
  entry_hash: string;
  data?: any;
}

export async function fetchMasterAuditLogs(masterPassword: string): Promise<MasterAuditLog[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/master/audit-logs`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  return json.logs || [];
}
