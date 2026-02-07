/**
 * 管理者用イベントストア（可変 + 永続化）
 * EXPO_PUBLIC_SCHOOL_API_URL 設定時は API を優先し、結果をローカルにマージ。
 * 未設定時は Web: localStorage / Native: AsyncStorage のみ。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventState } from '../types/ui';
import { getSchoolApiBaseUrl } from '../config/api';
import { apiFetchEvents, apiCreateEvent, apiUpdateEvent } from '../api/adminApiClient';

const STORAGE_KEY = 'wene:admin_events';

export interface AdminEvent {
  id: string;
  title: string;
  datetime: string;
  host: string;
  state: EventState;
  rtCount: number;
  totalCount: number;
  createdAt: string;
  updatedAt: string;
}

function toStored(e: AdminEvent | (AdminEvent & { createdAt?: string; updatedAt?: string })): AdminEvent {
  return {
    id: e.id,
    title: e.title,
    datetime: e.datetime,
    host: e.host,
    state: e.state,
    rtCount: e.rtCount ?? 0,
    totalCount: e.totalCount ?? 0,
    createdAt: e.createdAt ?? new Date().toISOString(),
    updatedAt: e.updatedAt ?? new Date().toISOString(),
  };
}

let cache: AdminEvent[] | null = null;

async function getStorage(): Promise<{ getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> }> {
  try {
    return AsyncStorage;
  } catch {
    if (typeof localStorage !== 'undefined') {
      return {
        getItem: (k) => Promise.resolve(localStorage.getItem(k)),
        setItem: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
      };
    }
    throw new Error('No storage available');
  }
}

async function loadFromStorage(): Promise<AdminEvent[]> {
  const storage = await getStorage();
  const value = await storage.getItem(STORAGE_KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as AdminEvent[];
    return Array.isArray(parsed) ? parsed.map(toStored) : [];
  } catch {
    return [];
  }
}

async function saveToStorage(events: AdminEvent[]): Promise<void> {
  const storage = await getStorage();
  await storage.setItem(STORAGE_KEY, JSON.stringify(events));
}

/** 初回用 seed（adminMock の固定イベントと同一内容） */
const SEED_EVENTS: AdminEvent[] = [
  { id: 'evt-001', title: '地域清掃ボランティア', datetime: '2026/02/02 09:00-10:30', host: '生徒会', state: 'published' as EventState, rtCount: 23, totalCount: 58, createdAt: '', updatedAt: '' },
  { id: 'evt-002', title: '進路説明会', datetime: '2026/02/10 15:00-16:00', host: '進路指導室', state: 'draft' as EventState, rtCount: 8, totalCount: 8, createdAt: '', updatedAt: '' },
  { id: 'evt-003', title: '体育祭', datetime: '2026/02/15 09:00-15:00', host: '体育委員会', state: 'published' as EventState, rtCount: 0, totalCount: 120, createdAt: '', updatedAt: '' },
].map((e) => toStored({ ...e, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

/**
 * ストレージから読み込み、API 有効時は API から取得してマージ。キャッシュを更新。
 */
export async function loadEvents(): Promise<AdminEvent[]> {
  if (getSchoolApiBaseUrl()) {
    try {
      const fromApi = await apiFetchEvents();
      const normalized = fromApi.map((e) => toStored(e));
      cache = normalized;
      return normalized;
    } catch {
      // API 失敗時はローカルにフォールバック
    }
  }
  let events = await loadFromStorage();
  if (events.length === 0) {
    events = SEED_EVENTS.map(toStored);
    await saveToStorage(events);
  }
  cache = events;
  return events;
}

/**
 * イベント一覧を返す（loadEvents でキャッシュ済みならそれを返す）
 */
export async function listEvents(): Promise<AdminEvent[]> {
  if (cache) return [...cache];
  return loadEvents();
}

/**
 * 同期的に現在のキャッシュを返す（loadEvents が一度でも呼ばれていること）
 * getDisplayRtCount / schoolEvents 互換用。
 */
export function getEventsSync(): AdminEvent[] {
  return cache ? [...cache] : [];
}

/**
 * イベント作成（API 有効時は API に送信し、成功時にローカルにマージ）
 */
export async function createEvent(input: {
  title: string;
  date: string;
  time: string;
  host: string;
  categoryId?: string;
  state?: EventState;
  totalCount?: number;
}): Promise<AdminEvent> {
  if (getSchoolApiBaseUrl()) {
    try {
      const created = await apiCreateEvent({
        ...input,
        category: input.categoryId ?? '',
      });
      const event = toStored(created);
      const prev = cache ?? [];
      cache = [event, ...prev];
      return event;
    } catch (e) {
      throw e;
    }
  }
  const now = new Date().toISOString();
  const eventId = `evt-${Date.now().toString(36)}`;
  const datetime = `${input.date} ${input.time}`;
  const event: AdminEvent = {
    id: eventId,
    title: input.title.trim(),
    datetime,
    host: (input.host || '').trim() || '未設定',
    state: input.state ?? 'draft',
    rtCount: 0,
    totalCount: input.totalCount ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  const events = await listEvents();
  events.push(event);
  await saveToStorage(events);
  cache = events;
  return event;
}

/**
 * イベント更新（API 有効時は API に送信し、成功時にローカルを更新）
 */
export async function updateEvent(eventId: string, patch: Partial<Omit<AdminEvent, 'id' | 'createdAt'>>): Promise<AdminEvent | null> {
  if (getSchoolApiBaseUrl()) {
    try {
      const updated = await apiUpdateEvent(eventId, patch);
      const event = toStored(updated);
      const prev = cache ?? [];
      const idx = prev.findIndex((e) => e.id === eventId);
      if (idx >= 0) {
        cache = [...prev.slice(0, idx), event, ...prev.slice(idx + 1)];
        return event;
      }
      cache = [event, ...prev];
      return event;
    } catch (e) {
      throw e;
    }
  }
  const events = await listEvents();
  const idx = events.findIndex((e) => e.id === eventId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  events[idx] = toStored({
    ...events[idx],
    ...patch,
    updatedAt: now,
  });
  await saveToStorage(events);
  cache = events;
  return events[idx];
}

/**
 * ID で取得（非同期）
 */
export async function getEventByIdAsync(eventId: string): Promise<AdminEvent | null> {
  const events = await listEvents();
  return events.find((e) => e.id === eventId) ?? null;
}

/**
 * 同期的に ID で取得（loadEvents 済みであること）
 */
export function getEventByIdSync(eventId: string): AdminEvent | null {
  if (!cache) return null;
  return cache.find((e) => e.id === eventId) ?? null;
}
