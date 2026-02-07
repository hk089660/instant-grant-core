/**
 * 学校向けイベント取得 API
 *
 * PoC: adminEventsStore の同期キャッシュを参照。loadEvents() が事前に呼ばれていること。
 * SchoolEventProvider を実装し、schoolClaimClient から利用。
 */

import { getEventsSync } from '../data/adminEventsStore';
import type { SchoolEvent } from '../types/school';
import type { SchoolEventProvider } from './schoolClaimClient';

export type { SchoolEvent } from '../types/school';

const toSchoolEvent = (e: { id: string; title: string; datetime: string; host: string }): SchoolEvent => ({
  id: e.id,
  title: e.title,
  datetime: e.datetime,
  host: e.host,
});

export const schoolEventProvider: SchoolEventProvider = {
  getById(eventId: string): SchoolEvent | null {
    const events = getEventsSync();
    const event = events.find((e) => e.id === eventId);
    return event ? toSchoolEvent(event) : null;
  },
  getAll(): SchoolEvent[] {
    return getEventsSync().map(toSchoolEvent);
  },
};

export function getEventById(eventId: string): SchoolEvent | null {
  return schoolEventProvider.getById(eventId);
}

export function getAllSchoolEvents(): SchoolEvent[] {
  return schoolEventProvider.getAll();
}
