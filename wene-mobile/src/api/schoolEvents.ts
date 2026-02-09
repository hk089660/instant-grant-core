/**
 * 学校向けイベント取得 API
 *
 * PoC: mock データ。将来は server API に差し替え。
 * SchoolEventProvider を実装し、schoolClaimClient から利用。
 */

import { mockEvents } from '../data/adminMock';
import type { SchoolEvent } from '../types/school';
import type { SchoolEventProvider } from './schoolClaimClient';

export type { SchoolEvent } from '../types/school';

const toSchoolEvent = (e: (typeof mockEvents)[0]): SchoolEvent => ({
  id: e.id,
  title: e.title,
  datetime: e.datetime,
  host: e.host,
  state: e.state,
});

export const schoolEventProvider: SchoolEventProvider = {
  getById(eventId: string): SchoolEvent | null {
    const event = mockEvents.find((e) => e.id === eventId);
    return event ? toSchoolEvent(event) : null;
  },
  getAll(): SchoolEvent[] {
    return mockEvents.map(toSchoolEvent);
  },
};

export function getEventById(eventId: string): SchoolEvent | null {
  return schoolEventProvider.getById(eventId);
}

export function getAllSchoolEvents(): SchoolEvent[] {
  return schoolEventProvider.getAll();
}
