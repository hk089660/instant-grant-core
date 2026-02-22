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
  const envBase = (
    process.env.EXPO_PUBLIC_SCHOOL_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    ''
  ).trim().replace(/\/$/, '');
  if (envBase) return envBase;
  throw new Error('API base URL is required (set EXPO_PUBLIC_SCHOOL_API_BASE_URL or EXPO_PUBLIC_API_BASE_URL)');
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

export interface InviteCodeRecord {
  code: string;
  adminId: string;
  name: string;
  source: 'invite';
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
  revokedBy?: string | null;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { error?: string; message?: string };
    const msg = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : '';
    return msg ? `${fallback}: ${msg}` : `${fallback} (HTTP ${res.status})`;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

/** 招待コード発行 (Master Only) */
export async function createInviteCode(masterPassword: string, name: string): Promise<InviteCodeRecord> {
  const base = getBaseUrl();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('admin name is required');
  }
  const res = await fetch(`${base}/api/admin/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterPassword}`,
    },
    body: JSON.stringify({ name: trimmedName }),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to create invite code'));
  }
  const json = await res.json() as Partial<InviteCodeRecord> & { code?: string; adminId?: string; createdAt?: string; name?: string };
  if (!json?.code || !json?.adminId) {
    throw new Error('Invalid invite response');
  }
  return {
    code: json.code,
    adminId: json.adminId,
    name: typeof json.name === 'string' && json.name.trim() ? json.name.trim() : trimmedName,
    source: 'invite',
    status: json.status === 'revoked' ? 'revoked' : 'active',
    createdAt: typeof json.createdAt === 'string' ? json.createdAt : new Date().toISOString(),
    revokedAt: json.revokedAt ?? null,
    revokedBy: json.revokedBy ?? null,
  };
}

/** 招待コード一覧取得 (Master Only) */
export async function fetchInviteCodes(masterPassword: string, includeRevoked = true): Promise<InviteCodeRecord[]> {
  const base = getBaseUrl();
  const query = includeRevoked ? '?includeRevoked=1' : '?includeRevoked=0';
  const res = await fetch(`${base}/api/admin/invites${query}`, {
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

/** 招待コードの管理者名変更 (Master Only) */
export async function renameInviteCode(masterPassword: string, params: {
  name: string;
  code?: string;
  adminId?: string;
}): Promise<InviteCodeRecord> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/admin/rename`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterPassword}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to rename invite code'));
  }
  const json = await res.json() as { invite?: InviteCodeRecord };
  if (!json?.invite) {
    throw new Error('Invalid rename response');
  }
  return json.invite;
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

export interface TransferParty {
  type: string;
  id: string;
}

export interface TransferAuditPayload {
  mode: 'onchain' | 'offchain';
  asset: 'ticket_token';
  amount: number | null;
  mint: string | null;
  txSignature: string | null;
  receiptPubkey: string | null;
  sender: TransferParty;
  recipient: TransferParty;
}

export interface TransferLogEntry {
  ts: string;
  event: string;
  eventId: string;
  entryHash: string;
  prevHash: string;
  streamPrevHash: string;
  transfer: TransferAuditPayload;
  pii?: Record<string, string>;
}

export interface AdminTransferLogsResponse {
  roleView: 'admin';
  strictLevel: string;
  checkedAt: string;
  limit: number;
  eventId: string | null;
  items: TransferLogEntry[];
}

export interface MasterTransferLogsResponse {
  roleView: 'master';
  strictLevel: string;
  checkedAt: string;
  limit: number;
  eventId: string | null;
  items: TransferLogEntry[];
}

export interface MasterAdminDisclosureUserClaim {
  ts: string;
  eventId: string;
  eventTitle: string | null;
  transfer: TransferAuditPayload;
  pii?: Record<string, string>;
}

export interface MasterAdminDisclosureUser {
  key: string;
  userId: string | null;
  displayName: string | null;
  walletAddress: string | null;
  joinToken: string | null;
  recipientType: string;
  recipientId: string;
  eventIds: string[];
  claims: MasterAdminDisclosureUserClaim[];
}

export interface MasterAdminDisclosureEvent {
  id: string;
  title: string;
  datetime: string;
  host: string;
  state: string;
  claimedCount: number;
  ownerSource: 'master' | 'invite' | 'demo' | 'inferred';
}

export interface MasterAdminDisclosure {
  adminId: string;
  code: string;
  name: string;
  createdAt: string;
  status: 'active' | 'revoked';
  revokedAt: string | null;
  events: MasterAdminDisclosureEvent[];
  relatedTransferCount: number;
  relatedUsers: MasterAdminDisclosureUser[];
}

export interface MasterAdminDisclosuresResponse {
  checkedAt: string;
  strictLevel: 'master_full';
  includeRevoked: boolean;
  transferLimit: number;
  admins: MasterAdminDisclosure[];
}

export interface MasterSearchResultItem {
  id: string;
  kind: 'admin' | 'event' | 'user' | 'claim';
  title: string;
  subtitle: string;
  detail: string;
}

export interface MasterSearchResponse {
  checkedAt: string;
  strictLevel: 'master_full';
  query: string;
  includeRevoked: boolean;
  transferLimit: number;
  limit: number;
  total: number;
  indexBuiltAt: string | null;
  items: MasterSearchResultItem[];
}

export async function fetchMasterAdminDisclosures(
  masterPassword: string,
  params?: { includeRevoked?: boolean; transferLimit?: number }
): Promise<MasterAdminDisclosuresResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  query.set('includeRevoked', params?.includeRevoked === false ? '0' : '1');
  if (typeof params?.transferLimit === 'number' && Number.isFinite(params.transferLimit)) {
    query.set('transferLimit', String(Math.max(1, Math.floor(params.transferLimit))));
  }
  const res = await fetch(`${base}/api/master/admin-disclosures?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });
  if (!res.ok) {
    return {
      checkedAt: new Date().toISOString(),
      strictLevel: 'master_full',
      includeRevoked: params?.includeRevoked !== false,
      transferLimit: typeof params?.transferLimit === 'number' ? params.transferLimit : 500,
      admins: [],
    };
  }
  return res.json() as Promise<MasterAdminDisclosuresResponse>;
}

export async function fetchMasterSearchResults(
  masterPassword: string,
  params: {
    query: string;
    limit?: number;
    includeRevoked?: boolean;
    transferLimit?: number;
  }
): Promise<MasterSearchResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  query.set('q', params.query.trim());
  query.set('includeRevoked', params.includeRevoked === false ? '0' : '1');
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  if (typeof params.transferLimit === 'number' && Number.isFinite(params.transferLimit)) {
    query.set('transferLimit', String(Math.max(1, Math.floor(params.transferLimit))));
  }
  const res = await fetch(`${base}/api/master/search?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });
  if (!res.ok) {
    return {
      checkedAt: new Date().toISOString(),
      strictLevel: 'master_full',
      query: params.query.trim(),
      includeRevoked: params.includeRevoked !== false,
      transferLimit: typeof params.transferLimit === 'number' ? params.transferLimit : 500,
      limit: typeof params.limit === 'number' ? params.limit : 100,
      total: 0,
      indexBuiltAt: null,
      items: [],
    };
  }
  return res.json() as Promise<MasterSearchResponse>;
}

export async function fetchAdminTransferLogs(params?: {
  eventId?: string;
  limit?: number;
}): Promise<AdminTransferLogsResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  if (params?.eventId?.trim()) query.set('eventId', params.eventId.trim());
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<AdminTransferLogsResponse>(`${base}/api/admin/transfers${suffix}`, { headers });
  });
}

export async function fetchMasterTransferLogs(
  masterPassword: string,
  params?: { eventId?: string; limit?: number }
): Promise<MasterTransferLogsResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  if (params?.eventId?.trim()) query.set('eventId', params.eventId.trim());
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${base}/api/master/transfers${suffix}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });

  if (!res.ok) {
    return {
      roleView: 'master',
      strictLevel: 'master_full',
      checkedAt: new Date().toISOString(),
      limit: typeof params?.limit === 'number' ? params.limit : 50,
      eventId: params?.eventId?.trim() || null,
      items: [],
    };
  }
  return res.json() as Promise<MasterTransferLogsResponse>;
}

export interface RuntimeStatusResponse {
  ready: boolean;
  checkedAt: string;
  checks: {
    adminPasswordConfigured: boolean;
    popEnforced: boolean;
    popSignerConfigured: boolean;
    popSignerPubkey: string | null;
    popSignerError: string | null;
    auditMode: 'off' | 'best_effort' | 'required';
    auditOperationalReady: boolean;
    auditPrimarySinkConfigured: boolean;
    corsOrigin: string | null;
  };
  blockingIssues: string[];
  warnings: string[];
}

/** Runtime readiness status (public operational check) */
export async function fetchRuntimeStatus(): Promise<RuntimeStatusResponse> {
  const base = getBaseUrl();
  return httpGet<RuntimeStatusResponse>(`${base}/v1/school/runtime-status`);
}

export interface PopStatusResponse {
  enforceOnchainPop: boolean;
  signerConfigured: boolean;
  signerPubkey: string | null;
  error: string | null;
}

/** PoP runtime status (public operational check) */
export async function fetchPopStatus(): Promise<PopStatusResponse> {
  const base = getBaseUrl();
  return httpGet<PopStatusResponse>(`${base}/v1/school/pop-status`);
}
