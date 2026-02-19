/****
 * メモリストレージ（テストで flaky ゼロ）
 * 実証向けに evt-001/002 を固定で持つ
 */

import type { SchoolEvent } from '../../src/types/school';

export interface ClaimRecord {
  eventId: string;
  walletAddress?: string;
  joinedAt: number;
}

const SEED_EVENTS: SchoolEvent[] = [
  {
    id: 'evt-001',
    title: '地域清掃ボランティア',
    datetime: '2026/02/02 09:00-10:30',
    host: '生徒会',
    state: 'published',
  },
  {
    id: 'evt-002',
    title: '進路説明会',
    datetime: '2026/02/10 15:00-16:00',
    host: '進路指導室',
    state: 'published',
  },
];

export interface SchoolStorage {
  getEvents(): SchoolEvent[];
  getEvent(eventId: string): SchoolEvent | null;
  addEvent(event: SchoolEvent): void;
  getClaims(eventId: string): ClaimRecord[];
  addClaim(eventId: string, walletAddress?: string, joinToken?: string): void;
}

export function createMemoryStorage(): SchoolStorage {
  const events = [...SEED_EVENTS];
  const claims: ClaimRecord[] = [];

  return {
    getEvents() {
      return [...events];
    },
    getEvent(eventId: string) {
      return events.find((e) => e.id === eventId) ?? null;
    },
    addEvent(event: SchoolEvent) {
      events.push(event);
    },
    getClaims(eventId: string) {
      return claims.filter((c) => c.eventId === eventId);
    },
    addClaim(eventId: string, walletAddress?: string, _joinToken?: string) {
      claims.push({
        eventId,
        walletAddress,
        joinedAt: Date.now(),
      });
    },
  };
}
