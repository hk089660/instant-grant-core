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
const EVENT_PREFIX = 'event:';

const DEFAULT_CLAIM_INTERVAL_DAYS = 30;
const DEFAULT_MAX_CLAIMS_PER_INTERVAL = 1;
const MAX_STORED_CLAIM_HISTORY = 500;

interface ClaimHistoryEntry {
  at: number;
  code?: string;
}

interface ClaimPolicy {
  claimIntervalDays: number;
  maxClaimsPerInterval: number | null;
}

interface ClaimAllowance {
  allowed: boolean;
  latestConfirmationCode?: string;
  nextAvailableAt?: number;
}

export function claimKey(eventId: string, subject: string): string {
  return `${CLAIM_PREFIX}${eventId}:${subject}`;
}

export function claimPrefix(eventId: string): string {
  return `${CLAIM_PREFIX}${eventId}:`;
}

export function eventKey(eventId: string): string {
  return `${EVENT_PREFIX}${eventId}`;
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

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const v = Math.floor(value);
    return v > 0 ? v : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const v = Number.parseInt(value.trim(), 10);
    return v > 0 ? v : null;
  }
  return null;
}

function parseClaimHistory(raw: unknown): ClaimHistoryEntry[] {
  if (raw === undefined || raw === null) return [];

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return [{ at: Math.floor(raw) }];
  }

  if (!raw || typeof raw !== 'object') return [];

  const obj = raw as {
    at?: unknown;
    code?: unknown;
    history?: unknown;
  };

  const out: ClaimHistoryEntry[] = [];

  if (Array.isArray(obj.history)) {
    for (const item of obj.history) {
      if (!item || typeof item !== 'object') continue;
      const it = item as { at?: unknown; code?: unknown };
      const at = parsePositiveInt(it.at);
      if (!at) continue;
      const code = typeof it.code === 'string' && it.code.trim() ? it.code.trim() : undefined;
      out.push({ at, code });
    }
  }

  // 旧形式 { at, code } 互換
  if (out.length === 0) {
    const at = parsePositiveInt(obj.at);
    if (at) {
      const code = typeof obj.code === 'string' && obj.code.trim() ? obj.code.trim() : undefined;
      out.push({ at, code });
    }
  }

  out.sort((a, b) => a.at - b.at);
  return out;
}

function serializeClaimHistory(entries: ClaimHistoryEntry[]): unknown {
  if (entries.length === 0) return undefined;

  const latest = entries[entries.length - 1];
  if (entries.length === 1 && !latest.code) {
    return latest.at;
  }
  return {
    at: latest.at,
    code: latest.code,
    history: entries,
  };
}

function resolveClaimPolicy(event?: SchoolEvent | null): ClaimPolicy {
  const intervalDays = parsePositiveInt(event?.claimIntervalDays) ?? DEFAULT_CLAIM_INTERVAL_DAYS;

  // null なら無制限
  if (event?.maxClaimsPerInterval === null) {
    return {
      claimIntervalDays: intervalDays,
      maxClaimsPerInterval: null,
    };
  }

  const maxClaims = parsePositiveInt(event?.maxClaimsPerInterval) ?? DEFAULT_MAX_CLAIMS_PER_INTERVAL;
  return {
    claimIntervalDays: intervalDays,
    maxClaimsPerInterval: maxClaims,
  };
}

export class ClaimStore {
  constructor(private storage: IClaimStorage) { }

  async getClaimedCount(eventId: string): Promise<number> {
    const list = await this.storage.list(claimPrefix(eventId));
    return list.size;
  }

  private async getClaimHistory(eventId: string, subject: string): Promise<ClaimHistoryEntry[]> {
    const raw = await this.storage.get(claimKey(eventId, subject));
    return parseClaimHistory(raw);
  }

  private async checkClaimAllowance(
    eventId: string,
    subject: string,
    event?: SchoolEvent | null,
    now: number = Date.now()
  ): Promise<ClaimAllowance> {
    const history = await this.getClaimHistory(eventId, subject);
    if (history.length === 0) return { allowed: true };

    const latest = history[history.length - 1];
    const policy = resolveClaimPolicy(event);
    if (policy.maxClaimsPerInterval === null) {
      return { allowed: true, latestConfirmationCode: latest.code };
    }

    const windowMs = policy.claimIntervalDays * 24 * 60 * 60 * 1000;
    const windowStart = now - windowMs;
    const inWindow = history.filter((entry) => entry.at >= windowStart);
    if (inWindow.length < policy.maxClaimsPerInterval) {
      return { allowed: true, latestConfirmationCode: latest.code };
    }

    const thresholdIndex = inWindow.length - policy.maxClaimsPerInterval;
    const thresholdEntry = inWindow[Math.max(0, thresholdIndex)];
    const nextAvailableAt = thresholdEntry
      ? thresholdEntry.at + windowMs
      : undefined;

    return {
      allowed: false,
      latestConfirmationCode: latest.code,
      nextAvailableAt,
    };
  }

  /**
   * 現在のポリシーで追加受給できない場合 true。
   * event が無い場合は「1回でも受給履歴があれば true（旧仕様互換）」で判定。
   */
  async hasClaimed(eventId: string, subject: string, event?: SchoolEvent | null): Promise<boolean> {
    if (!event) {
      const v = await this.storage.get(claimKey(eventId, subject));
      return v !== undefined;
    }
    const allowance = await this.checkClaimAllowance(eventId, subject, event);
    return !allowance.allowed;
  }

  /** 既存の claim レコードから最新 confirmationCode を取得（userId フロー用） */
  async getClaimRecord(eventId: string, subject: string): Promise<{ confirmationCode?: string } | null> {
    const history = await this.getClaimHistory(eventId, subject);
    if (history.length === 0) return null;
    const latest = history[history.length - 1];
    return { confirmationCode: latest.code };
  }

  async addClaim(eventId: string, subject: string, confirmationCode?: string): Promise<void> {
    const history = await this.getClaimHistory(eventId, subject);
    history.push({
      at: Date.now(),
      code: confirmationCode,
    });
    history.sort((a, b) => a.at - b.at);
    const trimmed =
      history.length > MAX_STORED_CLAIM_HISTORY
        ? history.slice(history.length - MAX_STORED_CLAIM_HISTORY)
        : history;
    const serialized = serializeClaimHistory(trimmed);
    if (serialized !== undefined) {
      await this.storage.put(claimKey(eventId, subject), serialized);
    }
  }

  /** イベント別の参加者一覧を取得 */
  async getClaimants(eventId: string): Promise<Array<{ subject: string; claimedAt: number; confirmationCode?: string }>> {
    const prefix = claimPrefix(eventId);
    const map = await this.storage.list(prefix);
    const out: Array<{ subject: string; claimedAt: number; confirmationCode?: string }> = [];
    map.forEach((value, key) => {
      const subject = key.slice(prefix.length);
      const history = parseClaimHistory(value);
      if (history.length === 0) {
        out.push({ subject, claimedAt: 0 });
        return;
      }
      const latest = history[history.length - 1];
      out.push({ subject, claimedAt: latest.at, confirmationCode: latest.code });
    });
    out.sort((a, b) => a.claimedAt - b.claimedAt);
    return out;
  }

  /** 動的に作成されたイベントを取得 */
  private async getStoredEvents(): Promise<SchoolEvent[]> {
    const map = await this.storage.list(EVENT_PREFIX);
    const events: SchoolEvent[] = [];
    map.forEach((value) => {
      if (value && typeof value === 'object' && 'id' in (value as any)) {
        const base = value as SchoolEvent;
        const policy = resolveClaimPolicy(base);
        events.push({
          ...base,
          claimIntervalDays: policy.claimIntervalDays,
          maxClaimsPerInterval: policy.maxClaimsPerInterval,
        });
      }
    });
    return events;
  }

  /** SEED + 動的イベントを統合 */
  async getEvents(): Promise<(SchoolEvent & { claimedCount: number })[]> {
    const stored = await this.getStoredEvents();
    const all = [...SEED_EVENTS, ...stored];
    const out: (SchoolEvent & { claimedCount: number })[] = [];
    for (const e of all) {
      const claimedCount = await this.getClaimedCount(e.id);
      const policy = resolveClaimPolicy(e);
      out.push({
        ...e,
        claimIntervalDays: policy.claimIntervalDays,
        maxClaimsPerInterval: policy.maxClaimsPerInterval,
        claimedCount,
      });
    }
    return out;
  }

  async getEvent(eventId: string): Promise<(SchoolEvent & { claimedCount: number }) | null> {
    // まず SEED から
    let event = SEED_EVENTS.find((e) => e.id === eventId) ?? null;
    // なければ動的イベントから
    if (!event) {
      const stored = await this.storage.get(eventKey(eventId));
      if (stored && typeof stored === 'object' && 'id' in (stored as any)) {
        event = stored as SchoolEvent;
      }
    }
    if (!event) return null;
    const claimedCount = await this.getClaimedCount(eventId);
    const policy = resolveClaimPolicy(event);
    return {
      ...event,
      claimIntervalDays: policy.claimIntervalDays,
      maxClaimsPerInterval: policy.maxClaimsPerInterval,
      claimedCount,
    };
  }

  /** イベント作成（admin 用） */
  async createEvent(data: {
    title: string;
    datetime: string;
    host: string;
    state?: SchoolEvent['state'];
    solanaMint?: string;
    solanaAuthority?: string;
    solanaGrantId?: string;
    ticketTokenAmount?: number;
    claimIntervalDays?: number;
    maxClaimsPerInterval?: number | null;
  }): Promise<SchoolEvent> {
    const id = `evt-${Date.now().toString(36)}`;
    const policy = resolveClaimPolicy({
      claimIntervalDays: data.claimIntervalDays,
      maxClaimsPerInterval: data.maxClaimsPerInterval,
    } as SchoolEvent);

    const event: SchoolEvent = {
      id,
      title: data.title,
      datetime: data.datetime,
      host: data.host,
      state: data.state ?? 'published',
      solanaMint: data.solanaMint,
      solanaAuthority: data.solanaAuthority,
      solanaGrantId: data.solanaGrantId,
      ticketTokenAmount: data.ticketTokenAmount,
      claimIntervalDays: policy.claimIntervalDays,
      maxClaimsPerInterval: policy.maxClaimsPerInterval,
    };
    await this.storage.put(eventKey(id), event);
    return event;
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

    const allowance = await this.checkClaimAllowance(eventId, subject, event);
    if (!allowance.allowed) {
      return { success: true, eventName: event.title, alreadyJoined: true };
    }

    await this.addClaim(eventId, subject);
    return { success: true, eventName: event.title, alreadyJoined: false };
  }
}
