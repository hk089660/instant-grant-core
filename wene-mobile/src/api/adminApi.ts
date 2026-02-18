/**
 * Admin 用 API ヘルパー
 * Worker の /v1/school/* エンドポイントを呼び出す
 */

import { httpGet, httpPost } from './http/httpClient';
import type { SchoolEvent } from '../types/school';

function getBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
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
