
import type { ClaimBody, RegisterBody, UserClaimBody, UserClaimResponse, SchoolClaimResult } from './types';
import { ClaimStore, type IClaimStorage } from './claimLogic';
import type { AuditActor, AuditEvent } from './audit/types';
import { canonicalize, sha256Hex } from './audit/hash';

const USER_PREFIX = 'user:';

function userKey(userId: string): string {
  return USER_PREFIX + userId;
}

function adminCodeKey(code: string): string {
  return 'admin_code:' + code;
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
  ADMIN_PASSWORD?: string;
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

  constructor(private ctx: DurableObjectState, private env: Env) {
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

      // Store history for Master Dashboard
      // Key format: audit_history:<timestamp>:<hash> to allow reverse chronological listing
      const historyKey = `audit_history:${ts}:${entry_hash}`;
      await this.ctx.storage.put(historyKey, fullEntry);

      return fullEntry;
    });

    // Update lock for next caller, robust against failures
    this.locks.set(eventId, task.then(() => { }, () => { }));

    return task;
  }

  async getAuditLogs(): Promise<AuditEvent[]> {
    // List latest 50 logs (reverse order)
    const result = await this.ctx.storage.list({ prefix: 'audit_history:', limit: 50, reverse: true });
    return Array.from(result.values()) as AuditEvent[];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // GET /api/master/audit-logs (Master Password required)
    if (path === '/api/master/audit-logs' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      const masterPassword = this.env.ADMIN_PASSWORD;
      if (!masterPassword || authHeader !== `Bearer ${masterPassword}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const logs = await this.getAuditLogs();
      return Response.json({ logs });
    }

    // POST /api/admin/invite (Master Password required)
    if (path === '/api/admin/invite' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const masterPassword = this.env.ADMIN_PASSWORD;
      if (!masterPassword || authHeader !== `Bearer ${masterPassword}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      let body: { name?: string };
      try {
        body = (await request.json()) as any;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : 'Unknown Admin';

      // Generate secure random code
      const code = crypto.randomUUID().replace(/-/g, '');
      await this.ctx.storage.put(adminCodeKey(code), {
        name,
        createdAt: new Date().toISOString(),
      });

      return Response.json({ code, name });
    }

    // GET /api/admin/invites (Master Password required)
    if (path === '/api/admin/invites' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      const masterPassword = this.env.ADMIN_PASSWORD;
      if (!masterPassword || authHeader !== `Bearer ${masterPassword}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const result = await this.ctx.storage.list({ prefix: 'admin_code:' });
      const invites = Array.from(result.entries()).map(([k, v]) => {
        const code = k.replace('admin_code:', '');
        return { code, ...(v as any) };
      });
      invites.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return Response.json({ invites });
    }

    // POST /api/admin/revoke (Master Password required)
    if (path === '/api/admin/revoke' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const masterPassword = this.env.ADMIN_PASSWORD;
      if (!masterPassword || authHeader !== `Bearer ${masterPassword}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      let body: { code?: string };
      try {
        body = (await request.json()) as any;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      if (typeof body?.code !== 'string') {
        return Response.json({ error: 'code required' }, { status: 400 });
      }
      const deleted = await this.ctx.storage.delete(adminCodeKey(body.code));
      return Response.json({ success: deleted });
    }

    // POST /api/admin/login
    if (path === '/api/admin/login' && request.method === 'POST') {
      let body: { password?: string };
      try {
        body = (await request.json()) as { password?: string };
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }

      const password = typeof body?.password === 'string' ? body.password : '';
      const masterPassword = this.env.ADMIN_PASSWORD;

      if (!masterPassword) {
        return Response.json({ error: 'server configuration error' }, { status: 500 });
      }

      // 1. Check Master Password
      if (password === masterPassword) {
        return Response.json({ ok: true, role: 'master' });
      }

      // 2. Check Issued Admin Codes
      const adminData = await this.ctx.storage.get(adminCodeKey(password));
      if (adminData) {
        return Response.json({ ok: true, role: 'admin', info: adminData });
      }

      return Response.json({ error: 'invalid password' }, { status: 401 });
    }

    if (path === '/v1/school/events' && request.method === 'GET') {
      const items = await this.store.getEvents();
      return Response.json({ items, nextCursor: undefined });
    }

    // POST /v1/school/events — イベント新規作成（admin用）
    if (path === '/v1/school/events' && request.method === 'POST') {
      let body: { title?: string; datetime?: string; host?: string; state?: 'draft' | 'published'; solanaMint?: string; solanaAuthority?: string; solanaGrantId?: string };
      try {
        body = (await request.json()) as any;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const datetime = typeof body?.datetime === 'string' ? body.datetime.trim() : '';
      const host = typeof body?.host === 'string' ? body.host.trim() : '';
      if (!title || !datetime || !host) {
        return Response.json({ error: 'title, datetime, host are required' }, { status: 400 });
      }
      const event = await this.store.createEvent({
        title, datetime, host, state: body.state,
        solanaMint: body.solanaMint,
        solanaAuthority: body.solanaAuthority,
        solanaGrantId: body.solanaGrantId
      });
      // Audit Log
      await this.appendAuditLog('EVENT_CREATE', { type: 'admin', id: 'admin' }, { title, datetime, host, eventId: event.id, solanaMint: body.solanaMint }, event.id);
      return Response.json(event, { status: 201 });
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

    // GET /v1/school/events/:eventId/claimants — 参加者一覧
    const claimantsMatch = path.match(/^\/v1\/school\/events\/([^/]+)\/claimants$/);
    if (claimantsMatch && request.method === 'GET') {
      const eventId = claimantsMatch[1];
      const event = await this.store.getEvent(eventId);
      if (!event) {
        return Response.json({ error: 'event not found' }, { status: 404 });
      }
      const claimants = await this.store.getClaimants(eventId);
      // subject が user ID の場合 displayName を引く
      const items = await Promise.all(claimants.map(async (c) => {
        let displayName: string | undefined;
        const userRaw = await this.ctx.storage.get(userKey(c.subject));
        if (userRaw && typeof userRaw === 'object' && 'displayName' in userRaw) {
          displayName = (userRaw as { displayName: string }).displayName;
        }
        return {
          subject: c.subject,
          displayName: displayName ?? '-',
          confirmationCode: c.confirmationCode,
          claimedAt: c.claimedAt ? new Date(c.claimedAt).toISOString() : undefined,
        };
      }));
      return Response.json({ eventId, eventTitle: event.title, items });
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

      // Audit Log
      if (result.success && !result.alreadyJoined) {
        await this.appendAuditLog('WALLET_CLAIM', { type: 'wallet', id: body.walletAddress || body.joinToken || 'unknown' }, body, body.eventId || 'unknown');
      }
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
        return Response.json({ message: 'User not found', code: 'user_not_found' }, { status: 401 });
      }
      const pinHash = await hashPin(pin);
      if ((userRaw as { pinHash: string }).pinHash !== pinHash) {
        return Response.json({ message: 'Invalid PIN', code: 'invalid_pin' }, { status: 401 });
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

      // Audit Log
      await this.appendAuditLog('USER_REGISTER', { type: 'user', id: userId }, { displayName }, 'system');

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
        return Response.json({ message: 'User not found', code: 'user_not_found' }, { status: 401 });
      }
      const pinHash = await hashPin(pin);
      if ((userRaw as { pinHash: string }).pinHash !== pinHash) {
        return Response.json({ message: 'Invalid PIN', code: 'invalid_pin' }, { status: 401 });
      }
      const event = await this.store.getEvent(eventId);
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

      // Audit Log
      await this.appendAuditLog('USER_CLAIM', { type: 'user', id: userId }, { eventId, status: 'created', confirmationCode }, eventId);

      return Response.json({ status: 'created', confirmationCode } as UserClaimResponse);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': this.env.CORS_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  }
}
