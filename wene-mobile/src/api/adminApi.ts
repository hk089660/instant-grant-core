/**
 * Admin 用 API ヘルパー
 * Worker の /v1/school/* エンドポイントを呼び出す
 */

import { httpGet, httpPost } from './http/httpClient';
import type { SchoolEvent } from '../types/school';

function getBaseUrl(): string {
    const envBase = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
    if (envBase) return envBase;
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return '';
}

/** イベント一覧取得 */
export async function fetchAdminEvents(): Promise<(SchoolEvent & { claimedCount: number })[]> {
    const base = getBaseUrl();
    const data = await httpGet<{ items: (SchoolEvent & { claimedCount: number })[] }>(`${base}/v1/school/events`);
    return data.items;
}

/** イベント詳細取得 */
export async function fetchAdminEvent(eventId: string): Promise<SchoolEvent & { claimedCount: number }> {
    const base = getBaseUrl();
    return httpGet<SchoolEvent & { claimedCount: number }>(`${base}/v1/school/events/${encodeURIComponent(eventId)}`);
}

/** イベント作成 */
export async function createAdminEvent(data: {
    title: string;
    datetime: string;
    host: string;
    state?: 'draft' | 'published';
}): Promise<SchoolEvent> {
    const base = getBaseUrl();
    return httpPost<SchoolEvent>(`${base}/v1/school/events`, data);
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
    return httpGet<ClaimantsResponse>(`${base}/v1/school/events/${encodeURIComponent(eventId)}/claimants`);
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
    // Headers must include Authorization: Bearer <masterPassword>
    // However, existing httpClient might not support custom headers easily without modification.
    // For now, let's assume direct fetch or modifying httpClient if needed.
    // Given the constraints, I will use fetch directly here to allow custom headers easily.

    const res = await fetch(`${base}/api/admin/invite`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${masterPassword}`
        },
        body: JSON.stringify({ name })
    });

    if (!res.ok) {
        throw new Error('Failed to create invite code');
    }
    return res.json();
}


/** 招待コード無効化 (Master Only) */
export async function revokeInviteCode(masterPassword: string, code: string): Promise<boolean> {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/admin/revoke`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${masterPassword}`
        },
        body: JSON.stringify({ code })
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
    entry_hash: string;
    data?: any;
}

export async function fetchMasterAuditLogs(masterPassword: string): Promise<MasterAuditLog[]> {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/master/audit-logs`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${masterPassword}`
        }
    });

    if (!res.ok) return [];
    const json = await res.json();
    return json.logs || [];
}

