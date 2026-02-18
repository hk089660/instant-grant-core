

import type { ClaimBody, RegisterBody, UserClaimBody, UserClaimResponse, SchoolClaimResult } from './types';
import { ClaimStore, SEED_EVENTS, type IClaimStorage } from './claimLogic';
import type { AuditActor, AuditEvent } from './audit/types';
import { canonicalize, sha256Hex } from './audit/hash';

const USER_PREFIX = 'user:';

function userKey(userId: string): string {
  return USER_PREFIX + userId;
}

async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function genConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export interface Env {
  CORS_ORIGIN?: string;
}

function doStorageAdapter(ctx: DurableObjectState): IClaimStorage {
  return {
    async get(key: string) {
      return ctx.storage.get(key);
    },
    async put(key: string, value: unknown) {
      await ctx.storage.put(key, value);
    },
    async list(prefix: string) {
      return ctx.storage.list({ prefix }) as Promise<Map<string, unknown>>;
    },
  };
}


export class SchoolStore implements DurableObject {
  private store: ClaimStore;

  constructor(private ctx: DurableObjectState, _env: Env) {
    this.store = new ClaimStore(doStorageAdapter(ctx));
  }


  private locks = new Map<string, Promise<void>>();

  async appendAuditLog(event: string, actor: AuditActor, data: unknown, eventId: string): Promise<AuditEvent> {
    // Serialize execution per eventId using a promise chain (mutex)
    const currentLock = this.locks.get(eventId) || Promise.resolve();

    const task = currentLock.then(async () => {
      const ts = new Date().toISOString();
      // Use eventId to namespace the hash chain
      const lastHashKey = `audit:lastHash:${eventId}`;
      const prevHash = (await this.ctx.storage.get<string>(lastHashKey)) ?? 'GENESIS';

      const baseEntry = {
        ts,
        event,
        eventId,
        actor,
        data: (data as Record<string, unknown>) ?? {},
        prev_hash: prevHash,
      };

      const entry_hash = await sha256Hex(canonicalize(baseEntry));
      const fullEntry: AuditEvent = { ...baseEntry, entry_hash };

      // Atomically update the hash chain
      await this.ctx.storage.put(lastHashKey, entry_hash);

      return fullEntry;
    });

    // Update lock for next caller, robust against failures
    this.locks.set(eventId, task.then(() => { }, () => { }));

    return task;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/v1/school/events' && request.method === 'GET') {
      const items = await this.store.getEvents();
      return Response.json({ items, nextCursor: undefined });
    }

    const eventIdMatch = path.match(/^\/v1\/school\/events\/([^/]+)$/);
    if (eventIdMatch && request.method === 'GET') {
      const eventId = eventIdMatch[1];
      const event = await this.store.getEvent(eventId);
      if (!event) {
        return Response.json(
          { success: false, error: { code: 'not_found', message: 'イベントが見つかりません' } } as SchoolClaimResult,
          { status: 404 }
        );
      }
      return Response.json(event);
    }

    if (path === '/v1/school/claims' && request.method === 'POST') {
      let body: ClaimBody;
      try {
        body = (await request.json()) as ClaimBody;
      } catch {
        return Response.json({
          success: false,
          error: { code: 'invalid', message: 'イベントIDが無効です' },
        } as SchoolClaimResult);
      }
      const result = await this.store.submitClaim(body);
      return Response.json(result);
    }

    // POST /api/auth/verify
    if (path === '/api/auth/verify' && request.method === 'POST') {
      let body: { userId?: string; pin?: string };
      try {
        body = (await request.json()) as { userId?: string; pin?: string };
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
      const pin = typeof body?.pin === 'string' ? body.pin : '';
      if (!userId || !pin) {
        return Response.json({ error: 'missing params' }, { status: 400 });
      }
      const userRaw = await this.ctx.storage.get(userKey(userId));
      if (!userRaw || typeof userRaw !== 'object' || !('pinHash' in userRaw)) {
        return Response.json({ error: 'invalid pin' }, { status: 401 });
      }
      const pinHash = await hashPin(pin);
      if ((userRaw as { pinHash: string }).pinHash !== pinHash) {
        return Response.json({ error: 'invalid pin' }, { status: 401 });
      }
      return Response.json({ ok: true });
    }

    // POST /api/users/register
    if (path === '/api/users/register' && request.method === 'POST') {
      let body: RegisterBody;
      try {
        body = (await request.json()) as RegisterBody;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 32) : '';
      const pin = typeof body?.pin === 'string' ? body.pin : '';
      if (!displayName || displayName.length < 1) {
        return Response.json({ error: 'displayName required (1-32)' }, { status: 400 });
      }
      if (!/^\d{4,6}$/.test(pin)) {
        return Response.json({ error: 'pin must be 4-6 digits' }, { status: 400 });
      }
      const userId = crypto.randomUUID();
      const pinHash = await hashPin(pin);
      await this.ctx.storage.put(userKey(userId), { pinHash, displayName });
      return Response.json({ userId });
    }

    // POST /api/events/:eventId/claim (userId + pin)
    const claimMatch = path.match(/^\/api\/events\/([^/]+)\/claim$/);
    if (claimMatch && request.method === 'POST') {
      const eventId = claimMatch[1].trim();
      let body: UserClaimBody;
      try {
        body = (await request.json()) as UserClaimBody;
      } catch {
        return Response.json({ error: 'missing params' }, { status: 400 });
      }
      const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
      const pin = typeof body?.pin === 'string' ? body.pin : '';
      if (!userId || !pin) {
        return Response.json({ error: 'missing params' }, { status: 400 });
      }
      const userRaw = await this.ctx.storage.get(userKey(userId));
      if (!userRaw || typeof userRaw !== 'object' || !('pinHash' in userRaw)) {
        return Response.json({ error: 'invalid pin' }, { status: 401 });
      }
      const pinHash = await hashPin(pin);
      if ((userRaw as { pinHash: string }).pinHash !== pinHash) {
        return Response.json({ error: 'invalid pin' }, { status: 401 });
      }
      const event = SEED_EVENTS.find((e) => e.id === eventId);
      if (!event) {
        return Response.json({ error: 'event not found' }, { status: 404 });
      }
      if (event.state && event.state !== 'published') {
        return Response.json({ error: 'event not available' }, { status: 400 });
      }
      const already = await this.store.hasClaimed(eventId, userId);
      if (already) {
        const rec = await this.store.getClaimRecord(eventId, userId);
        const confirmationCode = rec?.confirmationCode ?? genConfirmationCode();
        return Response.json({ status: 'already', confirmationCode } as UserClaimResponse);
      }
      const confirmationCode = genConfirmationCode();
      await this.store.addClaim(eventId, userId, confirmationCode);
      return Response.json({ status: 'created', confirmationCode } as UserClaimResponse);
    }

    return new Response('Not Found', { status: 404 });
  }
}
