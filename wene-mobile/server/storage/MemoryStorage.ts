/****
 * メモリストレージ（テストで flaky ゼロ）
 * 実証向けに evt-001/002 を固定で持つ
 */

import type { SchoolEvent } from '../../src/types/school';

export interface UserRecord {
  id: string;
  displayName: string;
  pinHash: string;
}

export interface ClaimRecord {
  eventId: string;
  walletAddress?: string; // 旧来の互換性のため残す
  joinToken?: string;
  userId?: string;
  confirmationCode?: string;
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

  // Claims
  getClaims(eventId: string): ClaimRecord[];
  addClaim(eventId: string, walletAddress?: string, joinToken?: string): void;

  // User & User Claims
  addUser(user: UserRecord): void;
  getUser(userId: string): UserRecord | null;
  addUserClaim(eventId: string, userId: string, confirmationCode: string): void;
  hasClaimed(eventId: string, userId: string, claimIntervalDays?: number, maxClaimsPerInterval?: number | null): boolean;
  getUserClaims(userId: string): ClaimRecord[];
}

export function createMemoryStorage(): SchoolStorage {
  const events = [...SEED_EVENTS];
  const claims: ClaimRecord[] = [];
  const users: UserRecord[] = [];

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
    addClaim(eventId: string, walletAddress?: string, joinToken?: string) {
      claims.push({
        eventId,
        walletAddress,
        joinToken,
        joinedAt: Date.now(),
      });
    },

    // User related implementation
    addUser(user: UserRecord) {
      users.push(user);
    },
    getUser(userId: string) {
      return users.find((u) => u.id === userId) ?? null;
    },
    addUserClaim(eventId: string, userId: string, confirmationCode: string) {
      claims.push({
        eventId,
        userId,
        confirmationCode,
        joinedAt: Date.now(),
      });
    },
    hasClaimed(eventId: string, userId: string, claimIntervalDays: number = 30, maxClaimsPerInterval: number | null = 1): boolean {
      if (maxClaimsPerInterval === null) {
        return false;
      }
      const intervalMs = Math.max(1, claimIntervalDays) * 24 * 60 * 60 * 1000;
      const windowStart = Date.now() - intervalMs;
      const inWindow = claims.filter(
        (c) =>
          c.eventId === eventId &&
          c.userId === userId &&
          c.joinedAt >= windowStart
      );
      return inWindow.length >= Math.max(1, maxClaimsPerInterval);
    },
    getUserClaims(userId: string): ClaimRecord[] {
      return claims.filter((c) => c.userId === userId);
    },
  };
}
