/**
 * 管理者向け API クライアント
 * EXPO_PUBLIC_SCHOOL_API_URL 設定時はこのクライアントで取得。未設定時は呼び出し元でローカルにフォールバック。
 * Web では credentials: "include" で httpOnly cookie セッションを送信。
 * URL: 常に base + path（スラッシュ1つ）。タイムアウト 8s。
 */

import { Platform } from 'react-native';
import type { EventState, Role } from '../types/ui';
import type { AdminEvent } from '../data/adminEventsStore';
import type { SharedParticipationEntry } from '../data/adminMock';
import { getSchoolApiBaseUrl } from '../config/api';

/** サーバー参加記録（GET/POST の共通形） */
export interface ApiParticipation {
  recordId: string;
  eventId: string;
  studentId?: string;
  recordedAt: string;
  source?: 'manual' | 'scan' | 'api';
  grade?: number;
  displayName?: string;
  studentCodeMasked?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

function ensureLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function buildUrl(base: string, path: string): string {
  return `${base}${ensureLeadingSlash(path)}`;
}

export interface ApiCategory {
  id: string;
  label: string;
}

export interface CreateEventBody {
  title: string;
  date: string;
  time: string;
  host: string;
  categoryId?: string;
  category?: string;
  state?: EventState;
  totalCount?: number;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
};

let onUnauthorized: (() => void) | null = null;

/** 401 時に呼ばれるコールバックを登録（Admin layout で /admin/login へリダイレクト用） */
export function setOnUnauthorized(callback: (() => void) | null): void {
  onUnauthorized = callback;
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const base = getSchoolApiBaseUrl();
  if (!base) throw new Error('API_URL_NOT_CONFIGURED');
  const url = buildUrl(base, path);
  if (typeof __DEV__ !== 'undefined' && __DEV__ && (path === '/me' || path.startsWith('/me?'))) {
    console.log('[adminApiClient] GET', url);
  }
  const credentials: RequestCredentials = Platform.OS === 'web' ? 'include' : 'same-origin';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      credentials,
      signal: controller.signal,
    });
    return res;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw new Error('NETWORK');
  } finally {
    clearTimeout(timeoutId);
  }
}

type RequestOptionsInternal = {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
};

async function request<T>(path: string, options: RequestOptionsInternal = {}): Promise<T> {
  const { method = 'GET', body, headers: customHeaders } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };
  const bodyStr: string | undefined = body != null ? JSON.stringify(body) : undefined;
  const res = await apiFetch(path, {
    method,
    headers,
    body: bodyStr,
  });

  if (res.status === 401) {
    const text = await res.text();
    let data: { ok?: boolean; error?: string } = {};
    try {
      data = JSON.parse(text) as { ok?: boolean; error?: string };
    } catch {
      // use as message below
    }
    // 学生参加 /claim の 401 は invalid_token/expired_token。管理者リダイレクトは行わない。
    if (path !== '/claim') onUnauthorized?.();
    // /claim の場合は body を返して呼び出し元で error を扱う
    if (path === '/claim') return { ok: false, error: data.error ?? 'invalid_token' } as T;
    throw new Error((data.error ?? text) || 'Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      message = j.message ?? j.error ?? text;
    } catch {
      // use text as is
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return undefined as unknown as T;
}

/** イベント一覧 */
export async function apiFetchEvents(): Promise<AdminEvent[]> {
  const list = await request<AdminEvent[] | { events: AdminEvent[] }>('/events');
  if (Array.isArray(list)) return list;
  if (list && typeof list === 'object' && 'events' in list && Array.isArray((list as { events: AdminEvent[] }).events)) {
    return (list as { events: AdminEvent[] }).events;
  }
  return [];
}

/** イベント1件 */
export async function apiFetchEvent(eventId: string): Promise<AdminEvent | null> {
  try {
    const data = await request<AdminEvent | { ok: boolean; event: AdminEvent }>(`/events/${encodeURIComponent(eventId)}`);
    if (data && typeof data === 'object' && 'event' in data && (data as { event: AdminEvent }).event) {
      return (data as { event: AdminEvent }).event;
    }
    return data as AdminEvent;
  } catch {
    return null;
  }
}

/** イベント作成 */
export async function apiCreateEvent(body: CreateEventBody): Promise<AdminEvent> {
  const data = await request<AdminEvent | { ok: boolean; event: AdminEvent }>('/events', { method: 'POST', body });
  if (data && typeof data === 'object' && 'event' in data && (data as { event: AdminEvent }).event) {
    return (data as { event: AdminEvent }).event;
  }
  return data as AdminEvent;
}

/** イベント更新 */
export async function apiUpdateEvent(eventId: string, patch: Partial<Omit<AdminEvent, 'id' | 'createdAt'>>): Promise<AdminEvent> {
  const data = await request<AdminEvent | { ok: boolean; event: AdminEvent }>(`/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: patch });
  if (data && typeof data === 'object' && 'event' in data && (data as { event: AdminEvent }).event) {
    return (data as { event: AdminEvent }).event;
  }
  return data as AdminEvent;
}

/** 参加用署名トークン取得（印刷QR用。requireAdmin） */
export async function apiFetchJoinToken(eventId: string, ttlSeconds?: number): Promise<{ token: string; exp: number } | null> {
  try {
    const data = await request<{ ok: boolean; token: string; exp: number }>(`/events/${encodeURIComponent(eventId)}/join-token`, {
      method: 'POST',
      body: ttlSeconds != null ? { ttlSeconds } : {},
    });
    if (data?.ok && data.token) return { token: data.token, exp: data.exp };
  } catch {
    // fallback は呼び出し元で
  }
  return null;
}

/** カテゴリ一覧 */
export async function apiFetchCategories(): Promise<ApiCategory[]> {
  try {
    const list = await request<ApiCategory[] | { categories: ApiCategory[] }>('/categories');
    if (Array.isArray(list)) return list;
    if (list && typeof list === 'object' && 'categories' in list && Array.isArray((list as { categories: ApiCategory[] }).categories)) {
      return (list as { categories: ApiCategory[] }).categories;
    }
  } catch {
    // fallback は呼び出し元で
  }
  return [];
}

/** 参加ログ一覧（eventId 省略で全件） */
export async function apiFetchParticipations(eventId?: string): Promise<ApiParticipation[]> {
  const q = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
  try {
    const data = await request<ApiParticipation[] | { ok: boolean; participations: ApiParticipation[] }>(`/participations${q}`);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && 'participations' in data && Array.isArray((data as { participations: ApiParticipation[] }).participations)) {
      return (data as { participations: ApiParticipation[] }).participations;
    }
  } catch {
    // fallback は呼び出し元で
  }
  return [];
}

/** 参加を送信（利用者側の参加記録）。作成された participation を返す。 */
export async function apiAddParticipation(entry: {
  eventId: string;
  eventName?: string;
  participantId?: string;
}): Promise<ApiParticipation> {
  const body = {
    eventId: entry.eventId,
    studentId: entry.participantId ?? undefined,
    displayName: (entry as { eventName?: string }).eventName ?? '参加',
  };
  const data = await request<ApiParticipation | { ok: boolean; participation: ApiParticipation }>('/participations', { method: 'POST', body });
  if (data && typeof data === 'object' && 'participation' in data && (data as { participation: ApiParticipation }).participation) {
    return (data as { participation: ApiParticipation }).participation;
  }
  return data as ApiParticipation;
}

/** 学校参加券リクエスト（学生参加・requireAdmin 不要） */
export interface ApiClaimRequest {
  eventId: string;
  studentId: string;
  token?: string;
  source?: 'scan' | 'manual' | 'api';
  grade?: number;
  displayName?: string;
  studentCodeMasked?: string;
}

/** 学校参加券レスポンス */
export interface ApiClaimResponse {
  ok: boolean;
  created?: boolean;
  participation?: ApiParticipation;
  error?: string;
}

/** 学校参加券を送信（学生参加。同一 (studentId, eventId) は 200 created:false で冪等） */
export async function apiSubmitClaim(req: ApiClaimRequest): Promise<ApiClaimResponse> {
  return request<ApiClaimResponse>('/claim', { method: 'POST', body: req });
}

// --- Admin session (httpOnly cookie, 8-digit passcode server-side only) ---

export interface ApiLoginResponse {
  ok: boolean;
  role?: Role;
  expiresAt?: string;
  error?: string;
}

/** 管理者ログイン（8桁数字パスコード）。成功時サーバーが httpOnly cookie を設定。パスコードはクライアントに保存しない。 */
export async function apiAdminLogin(passcode: string): Promise<ApiLoginResponse> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: passcode.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as ApiLoginResponse & { ok?: boolean };
  if (res.status === 200 && data.ok) return { ok: true, role: data.role ?? 'admin', expiresAt: data.expiresAt };
  return { ok: false, error: data.error ?? 'invalid_passcode' };
}

/** 管理者ログアウト（cookie 削除） */
export async function apiAdminLogout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
}

export interface ApiMeResponse {
  ok: boolean;
  role?: Role;
  expiresAt?: string;
  error?: string;
}

/** 現在のセッション（ロール）を取得。未ログイン時は 401 または ok: false。 */
export async function apiAdminMe(): Promise<ApiMeResponse> {
  const res = await apiFetch('/me', { method: 'GET', headers: { Accept: 'application/json' } });
  const data = (await res.json().catch(() => ({}))) as ApiMeResponse & { ok?: boolean };
  if (res.ok && data.ok && data.role) return { ok: true, role: data.role };
  if (res.status === 401) return { ok: false, error: 'Unauthorized' };
  return { ok: false, error: data.error ?? 'Failed to get session' };
}
