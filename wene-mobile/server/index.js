/**
 * School Admin API (MVP)
 * - 8-digit numeric passcode (server env SCHOOL_ADMIN_PASSCODE only, never in client)
 * - POST /school/auth/login  -> Set-Cookie (HttpOnly, 8h)
 * - POST /school/auth/logout -> clear cookie
 * - GET  /school/me          -> { ok, role, expiresAt }
 * - All admin data routes require session (requireAdmin)
 * CORS: SCHOOL_ADMIN_WEB_ORIGIN, credentials: true
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const crypto = require('crypto');
const { loadEvents, saveEvents, loadParticipations, saveParticipations, ensureDir, DATA_DIR } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;
const SCHOOL_BASE = '/school';

const PASSCODE = process.env.SCHOOL_ADMIN_PASSCODE ?? '';
const PASS_RE = /^[0-9]{8}$/;
const COOKIE_NAME = 'school_admin_session';
const TTL_MS = 8 * 60 * 60 * 1000; // 8h
const MAX_AGE_SEC = 8 * 60 * 60; // 28800

const raw = process.env.SCHOOL_ADMIN_WEB_ORIGIN ?? 'http://localhost:8081';
const ALLOWED_ORIGINS = raw.split(',').map((s) => s.trim()).filter(Boolean);
if (ALLOWED_ORIGINS.length === 0) ALLOWED_ORIGINS.push('http://localhost:8081');

// Join token (signed + exp). Server-only secret; do NOT put in EXPO_PUBLIC_*.
const JOIN_TOKEN_SECRET = process.env.SCHOOL_JOIN_TOKEN_SECRET ?? '';
const REQUIRE_JOIN_TOKEN = process.env.SCHOOL_REQUIRE_JOIN_TOKEN === '1';
const JOIN_TOKEN_TTL_SEC = Math.max(60, parseInt(process.env.SCHOOL_JOIN_TOKEN_TTL_SECONDS || '28800', 10) || 28800);

// --- Join token (HMAC) helpers ---
function base64urlEncode(bufOrStr) {
  const buf = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - String(str).replace(/-/g, '+').replace(/_/g, '/').length % 4) % 4);
  return Buffer.from(padded, 'base64');
}

function joinTokenSign(payloadB64) {
  if (!JOIN_TOKEN_SECRET) return '';
  const hmac = crypto.createHmac('sha256', JOIN_TOKEN_SECRET);
  hmac.update(payloadB64);
  return base64urlEncode(hmac.digest());
}

function joinTokenVerify(token) {
  if (!token || typeof token !== 'string') return { valid: false, error: 'invalid_token' };
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, error: 'invalid_token' };
  const [payloadB64, sigB64] = parts;
  const expectedSig = joinTokenSign(payloadB64);
  if (!expectedSig) return { valid: false, error: 'invalid_token' };
  try {
    const receivedBuf = base64urlDecode(sigB64);
    const expectedBuf = base64urlDecode(expectedSig);
    if (receivedBuf.length !== expectedBuf.length) return { valid: false, error: 'invalid_token' };
    if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) return { valid: false, error: 'invalid_token' };
  } catch {
    return { valid: false, error: 'invalid_token' };
  }
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return { valid: false, error: 'invalid_token' };
  }
  if (!payload || typeof payload.eventId !== 'string' || typeof payload.exp !== 'number') {
    return { valid: false, error: 'invalid_token' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) return { valid: false, error: 'expired_token' };
  return { valid: true, payload };
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser (curl, Postman)
  return ALLOWED_ORIGINS.includes(origin);
}

// in-memory sessions: token -> expiresAt (timestamp)
const sessions = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const loginAttempts = new Map();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= rec.resetAt) {
    rec = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    loginAttempts.set(ip, rec);
    return true;
  }
  rec.count++;
  return rec.count <= RATE_LIMIT_MAX;
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

const isSecure = process.env.NODE_ENV === 'production';

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    path: SCHOOL_BASE,
    maxAge: TTL_MS,
  });
}

function clearSessionCookie(res) {
  res.cookie(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    path: SCHOOL_BASE,
    maxAge: 0,
  });
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false });
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ ok: false });
  }
  req.adminRole = 'admin';
  req.sessionExpiresAt = exp;
  next();
}

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error('CORS_NOT_ALLOWED'), false);
    },
    allowedHeaders: ['Content-Type', 'Accept'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  })
);
app.use(express.json());
app.use(cookieParser());

const schoolRouter = express.Router({ mergeParams: true });

// POST /school/auth/login — 8-digit numeric passcode only
schoolRouter.post('/auth/login', (req, res) => {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: 'invalid_passcode' });
  }
  const passcode = String(req.body?.passcode ?? '').trim();
  if (!PASS_RE.test(passcode)) {
    return res.status(401).json({ ok: false, error: 'invalid_passcode' });
  }
  if (passcode !== PASSCODE) {
    return res.status(401).json({ ok: false, error: 'invalid_passcode' });
  }
  const token = newToken();
  const exp = Date.now() + TTL_MS;
  sessions.set(token, exp);
  setSessionCookie(res, token);
  res.status(200).json({ ok: true, role: 'admin', expiresAt: new Date(exp).toISOString() });
});

// POST /school/auth/logout
schoolRouter.post('/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

// GET /school/me
schoolRouter.get('/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const exp = token ? sessions.get(token) : undefined;
  if (!exp || exp < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ ok: false });
  }
  res.status(200).json({ ok: true, role: 'admin', expiresAt: new Date(exp).toISOString() });
});

// --- Events (in-memory, load/save from disk) ---
const STATUS_ALLOWED = ['draft', 'active', 'closed'];
const STATE_MAP = { draft: 'draft', active: 'published', closed: 'ended' };
const STATE_TO_STATUS = { draft: 'draft', published: 'active', ended: 'closed' };

ensureDir(DATA_DIR);
const loadedEventList = loadEvents();
const events = new Map(loadedEventList.map((e) => [e.id, e]));

function seedEvents() {
  if (events.size > 0) return;
  const now = new Date().toISOString();
  [
    { id: 'evt-001', title: '地域清掃ボランティア', datetime: '2026/02/02 09:00-10:30', host: '生徒会', status: 'active', rtCount: 23, totalCount: 58, createdAt: now, updatedAt: now },
    { id: 'evt-002', title: '進路説明会', datetime: '2026/02/10 15:00-16:00', host: '進路指導室', status: 'draft', rtCount: 8, totalCount: 8, createdAt: now, updatedAt: now },
    { id: 'evt-003', title: '体育祭', datetime: '2026/02/15 09:00-15:00', host: '体育委員会', status: 'active', rtCount: 0, totalCount: 120, createdAt: now, updatedAt: now },
  ].forEach((e) => events.set(e.id, { ...e }));
}
seedEvents();
if (events.size > 0 && loadedEventList.length === 0) {
  saveEvents(Array.from(events.values())).catch((err) => {
    if (process.env.NODE_ENV !== 'production') console.error('[storage] initial save events', err);
  });
}

function toClientEvent(e) {
  if (!e) return null;
  const status = e.status || (e.state === 'published' || e.state === 'ended' ? (e.state === 'ended' ? 'closed' : 'active') : 'draft');
  return {
    id: e.id,
    title: e.title,
    datetime: e.datetime || '',
    host: e.host || '',
    state: STATE_MAP[status] || e.state || 'draft',
    rtCount: e.rtCount ?? 0,
    totalCount: e.totalCount ?? 0,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// GET /school/events
schoolRouter.get('/events', requireAdmin, (req, res) => {
  const list = Array.from(events.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.status(200).json({ ok: true, events: list.map(toClientEvent) });
});

// POST /school/events
schoolRouter.post('/events', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return res.status(400).json({ ok: false, error: 'title required' });

  const rawStatus = body.status || body.state || 'draft';
  const status = STATUS_ALLOWED.includes(rawStatus) ? rawStatus : STATE_TO_STATUS[rawStatus] || 'draft';
  const now = new Date().toISOString();
  const id = 'evt-' + Date.now().toString(36);
  let datetime = typeof body.datetime === 'string' ? body.datetime.trim() : '';
  if (!datetime && body.date && body.time) datetime = [String(body.date).trim(), String(body.time).trim()].join(' ');
  const event = {
    id,
    title,
    datetime: datetime || '',
    host: typeof body.host === 'string' ? body.host.trim() : '',
    category: typeof body.category === 'string' ? body.category.trim() : '',
    status,
    rtCount: 0,
    totalCount: Number(body.totalCount) || 0,
    createdAt: now,
    updatedAt: now,
  };
  events.set(id, event);
  if (process.env.NODE_ENV !== 'production') console.log('[events] created', id, title);
  try {
    await saveEvents(Array.from(events.values()));
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[storage] save events', err);
    return res.status(500).json({ ok: false, error: 'save_failed' });
  }
  res.status(201).json({ ok: true, event: toClientEvent(event) });
});

// GET /school/events/:id
schoolRouter.get('/events/:id', requireAdmin, (req, res) => {
  const event = events.get(req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
  res.status(200).json({ ok: true, event: toClientEvent(event) });
});

// PATCH /school/events/:id
schoolRouter.patch('/events/:id', requireAdmin, async (req, res) => {
  const event = events.get(req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
  const patch = req.body || {};
  const allowed = ['title', 'datetime', 'host', 'category', 'status', 'state', 'totalCount'];
  const now = new Date().toISOString();
  allowed.forEach((key) => {
    if (patch[key] !== undefined) {
      if (key === 'status') event.status = STATUS_ALLOWED.includes(patch[key]) ? patch[key] : event.status;
      else if (key === 'state') event.status = STATE_TO_STATUS[patch[key]] || event.status;
      else if (key === 'title') event.title = typeof patch[key] === 'string' ? patch[key].trim() : event.title;
      else if (key === 'datetime') event.datetime = String(patch[key]);
      else if (key === 'host') event.host = String(patch[key]);
      else if (key === 'category') event.category = String(patch[key]);
      else if (key === 'totalCount') event.totalCount = Number(patch[key]) || 0;
    }
  });
  event.updatedAt = now;
  if (process.env.NODE_ENV !== 'production') console.log('[events] updated', event.id);
  try {
    await saveEvents(Array.from(events.values()));
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[storage] save events', err);
    return res.status(500).json({ ok: false, error: 'save_failed' });
  }
  res.status(200).json({ ok: true, event: toClientEvent(event) });
});

// POST /school/events/:id/join-token — mint signed join token (requireAdmin)
schoolRouter.post('/events/:id/join-token', requireAdmin, (req, res) => {
  const event = events.get(req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!JOIN_TOKEN_SECRET) return res.status(503).json({ ok: false, error: 'join_token_not_configured' });
  const ttlSec = Math.min(86400 * 7, Math.max(60, parseInt(req.body?.ttlSeconds, 10) || JOIN_TOKEN_TTL_SEC));
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + ttlSec;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = { eventId: event.id, exp, nonce };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sigB64 = joinTokenSign(payloadB64);
  const token = `${payloadB64}.${sigB64}`;
  res.status(200).json({ ok: true, token, exp });
});

// --- Participations (in-memory, load/save from disk) ---
// Participation = { recordId, eventId, studentId?, recordedAt, source?, grade?, displayName?, studentCodeMasked? }
const participations = loadParticipations();
const SOURCES = ['manual', 'scan', 'api'];

function newRecordId(eventId) {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `rec-${eventId}-${ts}-${rand}`;
}

function pairKey(studentId, eventId) {
  return `${String(studentId).trim()}::${String(eventId).trim()}`;
}

// POST /school/claim — student join (NO requireAdmin). Idempotent by (studentId, eventId). Optional token verification.
schoolRouter.post('/claim', async (req, res) => {
  const body = req.body || {};
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
  if (!eventId || !studentId) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (REQUIRE_JOIN_TOKEN && !token) {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  if (token) {
    const v = joinTokenVerify(token);
    if (!v.valid) {
      return res.status(401).json({ ok: false, error: v.error });
    }
    if (v.payload.eventId !== eventId) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }
  }
  const grade = body.grade != null ? Number(body.grade) : undefined;
  if (grade != null && (Number.isNaN(grade) || grade < 1 || grade > 12)) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }
  const key = pairKey(studentId, eventId);
  const existing = participations.find((p) => p.studentId === studentId && p.eventId === eventId);
  if (existing) {
    if (process.env.NODE_ENV !== 'production') console.log('[claim] existing', key, 'created:false');
    return res.status(200).json({ ok: true, created: false, participation: existing });
  }
  const recordedAt = new Date().toISOString();
  const recordId = newRecordId(eventId);
  const source = SOURCES.includes(body.source) ? body.source : 'scan';
  const participation = {
    recordId,
    eventId,
    studentId,
    recordedAt,
    source,
    grade: grade != null ? grade : undefined,
    displayName: typeof body.displayName === 'string' ? body.displayName.trim() : undefined,
    studentCodeMasked: typeof body.studentCodeMasked === 'string' ? body.studentCodeMasked.trim() : undefined,
  };
  participations.push(participation);
  if (process.env.NODE_ENV !== 'production') console.log('[claim] created', key, 'created:true');
  try {
    await saveParticipations(participations);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[storage] save participations', err);
    return res.status(500).json({ ok: false, error: 'save_failed' });
  }
  res.status(201).json({ ok: true, created: true, participation });
});

// GET /school/participations?eventId=...
schoolRouter.get('/participations', requireAdmin, (req, res) => {
  const eventId = typeof req.query.eventId === 'string' ? req.query.eventId.trim() : '';
  let list = participations;
  if (eventId) list = participations.filter((p) => p.eventId === eventId);
  list = [...list].sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));
  res.status(200).json({ ok: true, participations: list });
});

// POST /school/participations
schoolRouter.post('/participations', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });

  const grade = body.grade != null ? Number(body.grade) : undefined;
  if (grade != null && (Number.isNaN(grade) || grade < 1 || grade > 12)) {
    return res.status(400).json({ ok: false, error: 'grade must be 1..12' });
  }

  const recordedAt = typeof body.recordedAt === 'string' && body.recordedAt.trim()
    ? body.recordedAt.trim()
    : new Date().toISOString();
  const recordId = newRecordId(eventId);
  const participation = {
    recordId,
    eventId,
    studentId: typeof body.studentId === 'string' ? body.studentId.trim() : undefined,
    recordedAt,
    source: SOURCES.includes(body.source) ? body.source : undefined,
    grade: grade != null ? grade : undefined,
    displayName: typeof body.displayName === 'string' ? body.displayName.trim() : undefined,
    studentCodeMasked: typeof body.studentCodeMasked === 'string' ? body.studentCodeMasked.trim() : undefined,
  };
  participations.push(participation);
  if (process.env.NODE_ENV !== 'production') console.log('[participations] created', recordId, eventId);
  try {
    await saveParticipations(participations);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[storage] save participations', err);
    return res.status(500).json({ ok: false, error: 'save_failed' });
  }
  res.status(201).json({ ok: true, participation });
});

app.use(SCHOOL_BASE, schoolRouter);

app.listen(PORT, () => {
  console.log(`School API at http://localhost:${PORT}${SCHOOL_BASE}`);
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`Data dir: ${DATA_DIR}`);
});
