
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

const AUDIT_MAX_DEPTH = 4;
const AUDIT_MAX_ARRAY = 20;
const AUDIT_MAX_KEYS = 50;
const AUDIT_MAX_STRING = 160;
const MINT_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_IMAGE_URL = 'https://instant-grant-core.pages.dev/ticket-token.png';

function buildTokenSymbol(title: string): string {
  const cleaned = title.replace(/\s+/g, '').slice(0, 10).toUpperCase();
  return cleaned || 'TICKET';
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

  private isApiPath(path: string): boolean {
    return path.startsWith('/api/') || path.startsWith('/v1/school/');
  }

  private routeTemplate(path: string): string {
    if (/^\/v1\/school\/events\/[^/]+\/claimants$/.test(path)) return '/v1/school/events/:eventId/claimants';
    if (/^\/v1\/school\/events\/[^/]+$/.test(path)) return '/v1/school/events/:eventId';
    if (/^\/api\/events\/[^/]+\/claim$/.test(path)) return '/api/events/:eventId/claim';
    return path;
  }

  private eventIdForAudit(path: string, body: unknown): string {
    const schoolEventPath = path.match(/^\/v1\/school\/events\/([^/]+)/);
    if (schoolEventPath?.[1]) return schoolEventPath[1];

    const userEventPath = path.match(/^\/api\/events\/([^/]+)\/claim$/);
    if (userEventPath?.[1]) return userEventPath[1];

    if (body && typeof body === 'object' && 'eventId' in body) {
      const raw = (body as { eventId?: unknown }).eventId;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
    }

    return 'system';
  }

  private maskActorId(id: string): string {
    const trimmed = id.trim();
    if (!trimmed) return 'unknown';
    if (trimmed.length <= 8) return trimmed;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  private actorForAudit(path: string, request: Request, body: unknown): AuditActor {
    if (path.startsWith('/api/admin/') || path.startsWith('/api/master/')) {
      const hasAuth = Boolean(request.headers.get('Authorization'));
      return { type: 'operator', id: hasAuth ? 'authenticated' : 'anonymous' };
    }

    if (path === '/v1/school/claims') {
      const payload = body as { walletAddress?: unknown; joinToken?: unknown } | undefined;
      const wallet = typeof payload?.walletAddress === 'string' ? payload.walletAddress : '';
      const joinToken = typeof payload?.joinToken === 'string' ? payload.joinToken : '';
      const subject = wallet || joinToken;
      return { type: 'wallet', id: this.maskActorId(subject || 'unknown') };
    }

    if (path === '/api/users/register' || path === '/api/auth/verify' || /^\/api\/events\/[^/]+\/claim$/.test(path)) {
      const payload = body as { userId?: unknown } | undefined;
      const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : '';
      return { type: 'user', id: userId || 'anonymous' };
    }

    if (path.startsWith('/v1/school/')) {
      return { type: 'school', id: 'public-api' };
    }

    return { type: 'system', id: 'api' };
  }

  private isSensitiveKey(key: string): boolean {
    const lowered = key.toLowerCase();
    return (
      lowered.includes('password') ||
      lowered.includes('pin') ||
      lowered.includes('token') ||
      lowered.includes('authorization') ||
      lowered.includes('secret') ||
      lowered.includes('private') ||
      lowered === 'code' ||
      lowered.endsWith('_code')
    );
  }

  private sanitizeAuditValue(value: unknown, depth = 0): unknown {
    if (depth > AUDIT_MAX_DEPTH) return '[TRUNCATED_DEPTH]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (value.length > AUDIT_MAX_STRING) return `${value.slice(0, AUDIT_MAX_STRING)}...`;
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.slice(0, AUDIT_MAX_ARRAY).map((item) => this.sanitizeAuditValue(item, depth + 1));
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const keys = Object.keys(obj).slice(0, AUDIT_MAX_KEYS);
      for (const key of keys) {
        if (this.isSensitiveKey(key)) {
          out[key] = '[REDACTED]';
          continue;
        }
        out[key] = this.sanitizeAuditValue(obj[key], depth + 1);
      }
      return out;
    }
    return String(value);
  }

  private async requestBodyForAudit(request: Request): Promise<unknown> {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return undefined;

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) return undefined;

    try {
      return await request.clone().json();
    } catch {
      return { parseError: 'invalid_json' };
    }
  }

  private apiAuditEventName(method: string, route: string): string {
    const token = route
      .replace(/^\/+/, '')
      .replace(/[:]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return `API_${method.toUpperCase()}_${token || 'ROOT'}`;
  }

  private async appendApiAuditTrail(
    request: Request,
    url: URL,
    path: string,
    response: Response,
    requestBody: unknown,
    startedAt: number,
    errorMessage?: string
  ): Promise<void> {
    if (!this.isApiPath(path) || request.method.toUpperCase() === 'OPTIONS') return;

    const route = this.routeTemplate(path);
    const event = this.apiAuditEventName(request.method, route);
    const actor = this.actorForAudit(path, request, requestBody);
    const eventId = this.eventIdForAudit(path, requestBody);

    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) query[k] = v;
    const hasQuery = Object.keys(query).length > 0;

    const data: Record<string, unknown> = {
      route,
      method: request.method.toUpperCase(),
      status: response.status,
      statusClass: response.status >= 500 ? '5xx' : response.status >= 400 ? '4xx' : response.status >= 300 ? '3xx' : '2xx',
      durationMs: Date.now() - startedAt,
      hasAuthorization: Boolean(request.headers.get('Authorization')),
      origin: request.headers.get('origin') ?? '',
      requestBody: this.sanitizeAuditValue(requestBody),
      ...(hasQuery ? { query: this.sanitizeAuditValue(query) } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };

    try {
      await this.appendAuditLog(event, actor, data, eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[audit] failed to append API audit trail', { event, path, message });
    }
  }

  private async handleRequest(request: Request, path: string): Promise<Response> {

    const metadataMatch = path.match(/^\/metadata\/([^/]+)\.json$/);
    if (metadataMatch && request.method === 'GET') {
      const mint = metadataMatch[1]?.trim() ?? '';
      if (!MINT_BASE58_RE.test(mint)) {
        return Response.json({ error: 'invalid mint' }, { status: 400 });
      }

      const events = await this.store.getEvents();
      const linked = events.find((event) => event.solanaMint === mint);

      const title = linked?.title?.trim() || `We-ne Ticket ${mint.slice(0, 6)}`;
      const symbol = buildTokenSymbol(linked?.title?.trim() || '');
      const description = linked
        ? `${linked.title} の参加券トークン`
        : 'we-ne participation ticket token';

      const metadata = {
        name: title,
        symbol,
        description,
        image: TOKEN_IMAGE_URL,
        external_url: 'https://instant-grant-core.pages.dev/',
        attributes: [
          { trait_type: 'mint', value: mint },
          { trait_type: 'event_id', value: linked?.id ?? 'unknown' },
          { trait_type: 'host', value: linked?.host ?? 'unknown' },
          { trait_type: 'datetime', value: linked?.datetime ?? 'unknown' },
          { trait_type: 'claim_interval_days', value: linked?.claimIntervalDays ?? 30 },
          {
            trait_type: 'max_claims_per_interval',
            value: linked?.maxClaimsPerInterval === null
              ? 'unlimited'
              : (linked?.maxClaimsPerInterval ?? 1),
          },
        ],
        properties: {
          category: 'image',
          files: [{ uri: TOKEN_IMAGE_URL, type: 'image/png' }],
        },
      };

      return new Response(JSON.stringify(metadata), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }

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
      let body: {
        title?: string;
        datetime?: string;
        host?: string;
        state?: 'draft' | 'published';
        solanaMint?: string;
        solanaAuthority?: string;
        solanaGrantId?: string;
        ticketTokenAmount?: number | string;
        claimIntervalDays?: number | string;
        maxClaimsPerInterval?: number | string | null;
      };
      try {
        body = (await request.json()) as any;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400 });
      }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const datetime = typeof body?.datetime === 'string' ? body.datetime.trim() : '';
      const host = typeof body?.host === 'string' ? body.host.trim() : '';
      const rawTokenAmount = body?.ticketTokenAmount;
      const ticketTokenAmount =
        typeof rawTokenAmount === 'number' && Number.isFinite(rawTokenAmount)
          ? Math.floor(rawTokenAmount)
          : typeof rawTokenAmount === 'string' && /^\d+$/.test(rawTokenAmount.trim())
            ? Number.parseInt(rawTokenAmount.trim(), 10)
            : NaN;
      const rawClaimIntervalDays = body?.claimIntervalDays;
      const claimIntervalDays =
        typeof rawClaimIntervalDays === 'number' && Number.isFinite(rawClaimIntervalDays)
          ? Math.floor(rawClaimIntervalDays)
          : typeof rawClaimIntervalDays === 'string' && /^\d+$/.test(rawClaimIntervalDays.trim())
            ? Number.parseInt(rawClaimIntervalDays.trim(), 10)
            : 30;
      const rawMaxClaimsPerInterval = body?.maxClaimsPerInterval;
      const maxClaimsPerInterval =
        rawMaxClaimsPerInterval === null || rawMaxClaimsPerInterval === 'unlimited'
          ? null
          : typeof rawMaxClaimsPerInterval === 'number' && Number.isFinite(rawMaxClaimsPerInterval)
            ? Math.floor(rawMaxClaimsPerInterval)
            : typeof rawMaxClaimsPerInterval === 'string' && /^\d+$/.test(rawMaxClaimsPerInterval.trim())
              ? Number.parseInt(rawMaxClaimsPerInterval.trim(), 10)
              : 1;

      if (!title || !datetime || !host) {
        return Response.json({ error: 'title, datetime, host are required' }, { status: 400 });
      }
      if (!Number.isInteger(ticketTokenAmount) || ticketTokenAmount <= 0) {
        return Response.json({ error: 'ticketTokenAmount must be a positive integer' }, { status: 400 });
      }
      if (!Number.isInteger(claimIntervalDays) || claimIntervalDays <= 0) {
        return Response.json({ error: 'claimIntervalDays must be a positive integer' }, { status: 400 });
      }
      if (maxClaimsPerInterval !== null && (!Number.isInteger(maxClaimsPerInterval) || maxClaimsPerInterval <= 0)) {
        return Response.json({ error: 'maxClaimsPerInterval must be null or a positive integer' }, { status: 400 });
      }
      const event = await this.store.createEvent({
        title, datetime, host, state: body.state,
        solanaMint: body.solanaMint,
        solanaAuthority: body.solanaAuthority,
        solanaGrantId: body.solanaGrantId,
        ticketTokenAmount,
        claimIntervalDays,
        maxClaimsPerInterval,
      });
      // Audit Log
      await this.appendAuditLog(
        'EVENT_CREATE',
        { type: 'admin', id: 'admin' },
        {
          title,
          datetime,
          host,
          eventId: event.id,
          solanaMint: body.solanaMint,
          ticketTokenAmount,
          claimIntervalDays,
          maxClaimsPerInterval,
        },
        event.id
      );
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
      const already = await this.store.hasClaimed(eventId, userId, event);
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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const startedAt = Date.now();
    const requestBody = await this.requestBodyForAudit(request);

    let response: Response;
    let errorMessage: string | undefined;

    try {
      response = await this.handleRequest(request, path);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      response = Response.json({ error: 'internal server error' }, { status: 500 });
    }

    await this.appendApiAuditTrail(request, url, path, response, requestBody, startedAt, errorMessage);
    return response;
  }
}
