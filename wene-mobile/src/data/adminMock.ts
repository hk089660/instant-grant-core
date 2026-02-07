import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Role, EventState } from '../types/ui';
import { getEventsSync } from './adminEventsStore';
import { getAdminRole, setAdminRole, loadAdminRole } from './adminRoleStore';
import { isSchoolApiEnabled } from '../config/api';
import {
  apiFetchParticipations,
  apiAddParticipation as apiAddParticipationCall,
  apiFetchCategories,
} from '../api/adminApiClient';
import type { ApiCategory, ApiParticipation } from '../api/adminApiClient';

export { loadAdminRole };

const PARTICIPATIONS_STORAGE_KEY = 'wene:admin_participations';

async function getParticipationStorage(): Promise<{ getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> }> {
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

/** 利用者参加を管理者に反映する共有ログ（永続化: 再起動・リロード後も保持） */
export interface SharedParticipationEntry {
  eventId: string;
  eventName: string;
  id: string;
  display: string;
  code: string;
  time: string;
}
const sharedParticipationLog: SharedParticipationEntry[] = [];

/** API から取得した参加ログのキャッシュ（API 有効時のみ使用） */
let apiParticipationsCache: SharedParticipationEntry[] = [];

function formatRecordedAt(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
  } catch {
    return iso;
  }
}

function mapApiParticipationToEntry(p: ApiParticipation): SharedParticipationEntry {
  const events = getEventsSync();
  const eventName = events.find((e) => e.id === p.eventId)?.title ?? '';
  return {
    eventId: p.eventId,
    eventName,
    id: p.recordId,
    display: p.displayName ?? '参加',
    code: p.studentCodeMasked ?? '',
    time: formatRecordedAt(p.recordedAt),
  };
}

function saveParticipationLog(): void {
  getParticipationStorage()
    .then((s) => s.setItem(PARTICIPATIONS_STORAGE_KEY, JSON.stringify(sharedParticipationLog)))
    .catch(() => {});
}

/**
 * 参加ログを読み込む。API 有効時は API から取得し、未設定時はストレージから。起動時に1回呼ぶ。
 */
export async function loadSharedParticipations(): Promise<void> {
  if (isSchoolApiEnabled()) {
    try {
      const list = await apiFetchParticipations();
      apiParticipationsCache = Array.isArray(list) ? list.map(mapApiParticipationToEntry) : [];
    } catch {
      apiParticipationsCache = [];
    }
  }
  try {
    const storage = await getParticipationStorage();
    const value = await storage.getItem(PARTICIPATIONS_STORAGE_KEY);
    const parsed = value ? (JSON.parse(value) as SharedParticipationEntry[]) : [];
    if (Array.isArray(parsed)) {
      sharedParticipationLog.length = 0;
      sharedParticipationLog.push(...parsed);
    }
  } catch {
    // 読み込み失敗時は既存のメモリのまま
  }
}

export async function addSharedParticipationAsync(entry: {
  eventId: string;
  eventName: string;
  participantId?: string;
}): Promise<void> {
  if (isSchoolApiEnabled()) {
    try {
      const created = await apiAddParticipationCall({ ...entry, eventName: entry.eventName });
      apiParticipationsCache.push(mapApiParticipationToEntry(created));
      return;
    } catch {
      // API 失敗時はローカルにフォールバック
    }
  }
  const now = new Date();
  const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  sharedParticipationLog.push({
    eventId: entry.eventId,
    eventName: entry.eventName,
    id: entry.participantId ?? `p-${Date.now()}`,
    display: '参加',
    code: `#${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    time: timeStr,
  });
  saveParticipationLog();
}

/** 参加を記録（API 有効時は非同期で送信。従来の同期呼び出し互換のため fire-and-forget） */
export function addSharedParticipation(entry: {
  eventId: string;
  eventName: string;
  participantId?: string;
}): void {
  addSharedParticipationAsync(entry).catch(() => {});
}

export function getSharedParticipations(): SharedParticipationEntry[] {
  if (isSchoolApiEnabled()) return [...apiParticipationsCache];
  return [...sharedParticipationLog];
}

export function getSharedParticipationsByEventId(eventId: string): SharedParticipationEntry[] {
  const source = isSchoolApiEnabled() ? apiParticipationsCache : sharedParticipationLog;
  return source.filter((e) => e.eventId === eventId);
}

/**
 * 管理者表示用: リアルタイム参加数
 * = モックの rtCount（初期値）+ このセッションで利用者が参加した数（QR・リンク参加・一覧参加のいずれも addSharedParticipation 経由で集計）
 */
export function getDisplayRtCount(eventId: string): number {
  const events = getEventsSync();
  const event = events.find((e) => e.id === eventId);
  const base = event?.rtCount ?? 0;
  return base + getSharedParticipationsByEventId(eventId).length;
}

export const getMockAdminRole = (): Role => getAdminRole();
export const setMockAdminRole = (role: Role): void => setAdminRole(role);

const DEFAULT_CATEGORIES: ApiCategory[] = [
  { id: 'all', label: 'すべて' },
  { id: 'volunteer', label: 'ボランティア' },
  { id: 'school', label: '学校行事' },
  { id: 'other', label: '未分類' },
];

/** API から取得したカテゴリのキャッシュ */
let categoriesCache: ApiCategory[] | null = null;

/** カテゴリ一覧を API から読み込む。起動時または API 有効時に呼ぶ。 */
export async function loadCategories(): Promise<void> {
  if (!isSchoolApiEnabled()) return;
  try {
    const list = await apiFetchCategories();
    categoriesCache = Array.isArray(list) && list.length > 0 ? list : DEFAULT_CATEGORIES;
  } catch {
    categoriesCache = DEFAULT_CATEGORIES;
  }
}

/** カテゴリ一覧（API 有効時は API 取得分、否则はデフォルト） */
export function getCategories(): ApiCategory[] {
  if (isSchoolApiEnabled() && categoriesCache && categoriesCache.length > 0) {
    return [...categoriesCache];
  }
  return [...DEFAULT_CATEGORIES];
}

/** 互換のため従来の名前でも export */
export const mockCategories = DEFAULT_CATEGORIES;

export const mockEvents: Array<{
  id: string;
  title: string;
  datetime: string;
  host: string;
  state: EventState;
  rtCount: number;
  totalCount: number;
}> = [
  {
    id: 'evt-001',
    title: '地域清掃ボランティア',
    datetime: '2026/02/02 09:00-10:30',
    host: '生徒会',
    state: 'published',
    rtCount: 23,
    totalCount: 58,
  },
  {
    id: 'evt-002',
    title: '進路説明会',
    datetime: '2026/02/10 15:00-16:00',
    host: '進路指導室',
    state: 'draft',
    rtCount: 8,
    totalCount: 8,
  },
  {
    id: 'evt-003',
    title: '体育祭',
    datetime: '2026/02/15 09:00-15:00',
    host: '体育委員会',
    state: 'published',
    rtCount: 0,
    totalCount: 120,
  },
];

export const mockParticipants = [
  { id: 'stu-081', display: '参加者A', code: '#A7F3', time: '10:02' },
  { id: 'stu-142', display: '参加者B', code: '#B112', time: '10:05' },
  { id: 'stu-203', display: '匿名', code: '#C821', time: '10:07' },
];

export const mockParticipantLogs = [
  {
    id: 'stu-081',
    display: '参加者A',
    event: '地域清掃ボランティア',
    code: '#A7F3',
    time: '2026/02/02 10:02',
  },
  {
    id: 'stu-142',
    display: '参加者B',
    event: '進路説明会',
    code: '#B112',
    time: '2026/02/10 15:05',
  },
];
