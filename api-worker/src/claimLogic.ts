/**
 * claim のキー設計・正規化・集計ロジック（DO とテストで共有）
 * claimKey = claim:${eventId}:${subject} / prefix = claim:${eventId}:
 */

import type { SchoolClaimResult, SchoolEvent, ClaimBody } from './types';

export const SEED_EVENTS: SchoolEvent[] = [
  { id: 'evt-001', title: '地域清掃ボランティア', datetime: '2026/02/02 09:00-10:30', host: '生徒会', state: 'published' },
  { id: 'evt-002', title: '進路説明会', datetime: '2026/02/10 15:00-16:00', host: '進路指導室', state: 'published' },
];

const CLAIM_PREFIX = 'claim:';

export function claimKey(eventId: string, subject: string): string {
  return `${CLAIM_PREFIX}${eventId}:${subject}`;
}

export function claimPrefix(eventId: string): string {
  return `${CLAIM_PREFIX}${eventId}:`;
}

/**
 * subject 正規化: trim、空なら null（wallet_required 用）
 * 同一 "addr1" / " addr1 " を同じキーにする
 */
export function normalizeSubject(walletAddress?: string, joinToken?: string): string | null {
  const raw = (walletAddress ?? joinToken ?? '').trim();
  if (raw === '') return null;
  return raw.replace(/\s+/g, ' ').trim();
}

export interface IClaimStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  list(prefix: string): Promise<Map<string, unknown>>;
}

export class ClaimStore {
  constructor(private storage: IClaimStorage) {}

  async getClaimedCount(eventId: string): Promise<number> {
    const list = await this.storage.list(claimPrefix(eventId));
    return list.size;
  }

  async hasClaimed(eventId: string, subject: string): Promise<boolean> {
    const v = await this.storage.get(claimKey(eventId, subject));
    return v !== undefined;
  }

  /** 既存の claim レコードから confirmationCode を取得（userId フロー用） */
  async getClaimRecord(eventId: string, subject: string): Promise<{ confirmationCode?: string } | null> {
    const v = await this.storage.get(claimKey(eventId, subject));
    if (v === undefined) return null;
    if (typeof v === 'object' && v !== null && 'code' in v && typeof (v as { code?: string }).code === 'string') {
      return { confirmationCode: (v as { code: string }).code };
    }
    return {};
  }

  async addClaim(eventId: string, subject: string, confirmationCode?: string): Promise<void> {
    const at = Date.now();
    if (confirmationCode) {
      await this.storage.put(claimKey(eventId, subject), { at, code: confirmationCode });
    } else {
      await this.storage.put(claimKey(eventId, subject), at);
    }
  }

  async getEvents(): Promise<(SchoolEvent & { claimedCount: number })[]> {
    const out: (SchoolEvent & { claimedCount: number })[] = [];
    for (const e of SEED_EVENTS) {
      const claimedCount = await this.getClaimedCount(e.id);
      out.push({ ...e, claimedCount });
    }
    return out;
  }

  async getEvent(eventId: string): Promise<(SchoolEvent & { claimedCount: number }) | null> {
    const event = SEED_EVENTS.find((e) => e.id === eventId);
    if (!event) return null;
    const claimedCount = await this.getClaimedCount(eventId);
    return { ...event, claimedCount };
  }

  async submitClaim(body: ClaimBody): Promise<SchoolClaimResult> {
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
    const walletAddress = typeof body?.walletAddress === 'string' ? body.walletAddress : undefined;
    const joinToken = typeof body?.joinToken === 'string' ? body.joinToken : undefined;

    if (!eventId) {
      return { success: false, error: { code: 'invalid', message: 'イベントIDが無効です' } };
    }

    const event = await this.getEvent(eventId);
    if (!event) {
      return { success: false, error: { code: 'not_found', message: 'イベントが見つかりません' } };
    }

    if (event.state && event.state !== 'published') {
      return { success: false, error: { code: 'eligibility', message: 'このイベントは参加できません' } };
    }


    const subject = normalizeSubject(walletAddress, joinToken);
    if (subject === null) {
      return { success: false, error: { code: 'wallet_required', message: 'Phantomに接続してください' } };
    }

    const already = await this.hasClaimed(eventId, subject);
    if (already) {
      return { success: true, eventName: event.title, alreadyJoined: true };
    }

    await this.addClaim(eventId, subject);
    return { success: true, eventName: event.title, alreadyJoined: false };
  }
}
