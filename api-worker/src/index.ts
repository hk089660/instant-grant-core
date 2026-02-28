/**
 * 学校PoC API - Cloudflare Workers (Hono)
 * /v1/school/* と /api/* は Durable Object (SchoolStore) に転送
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SchoolStore } from './storeDO';
import auditRouter from './audit/router';

type Bindings = {
  CORS_ORIGIN?: string;
  ADMIN_PASSWORD?: string;
  AUDIT_LOG_WRITE_TOKEN?: string;
  SCHOOL_STORE: DurableObjectNamespace;
  AUDIT_LOGS?: R2Bucket;
  AUDIT_INDEX?: KVNamespace;
  AUDIT_IMMUTABLE_MODE?: string;
  AUDIT_IMMUTABLE_INGEST_URL?: string;
  AUDIT_IMMUTABLE_INGEST_TOKEN?: string;
  AUDIT_IMMUTABLE_FETCH_TIMEOUT_MS?: string;
  SECURITY_RATE_LIMIT_ENABLED?: string;
  SECURITY_RATE_LIMIT_READ_PER_MINUTE?: string;
  SECURITY_RATE_LIMIT_MUTATION_PER_MINUTE?: string;
  SECURITY_RATE_LIMIT_AUTH_PER_10_MINUTES?: string;
  SECURITY_RATE_LIMIT_ADMIN_LOGIN_PER_10_MINUTES?: string;
  SECURITY_RATE_LIMIT_VERIFY_PER_MINUTE?: string;
  SECURITY_RATE_LIMIT_GLOBAL_PER_MINUTE?: string;
  SECURITY_RATE_LIMIT_BLOCK_SECONDS?: string;
  SECURITY_MAX_REQUEST_BODY_BYTES?: string;
  SECURITY_ADMIN_EVENT_ISSUE_LIMIT_PER_DAY?: string;
  SECURITY_ADMIN_INVITE_ISSUE_LIMIT_PER_DAY?: string;
  COST_OF_FORGERY_ENABLED?: string;
  COST_OF_FORGERY_FAIL_CLOSED?: string;
  COST_OF_FORGERY_BASE_URL?: string;
  COST_OF_FORGERY_VERIFY_PATH?: string;
  COST_OF_FORGERY_API_KEY?: string;
  COST_OF_FORGERY_TIMEOUT_MS?: string;
  COST_OF_FORGERY_MIN_SCORE?: string;
  COST_OF_FORGERY_MIN_SCORE_SCHOOL_INTERNAL?: string;
  COST_OF_FORGERY_MIN_SCORE_PUBLIC?: string;
  COST_OF_FORGERY_ENFORCE_ON_REGISTER?: string;
  COST_OF_FORGERY_ENFORCE_ON_CLAIM?: string;
  COST_OF_FORGERY_FAIL_CLOSED_REGISTER?: string;
  COST_OF_FORGERY_FAIL_CLOSED_CLAIM?: string;
  COST_OF_FORGERY_CACHE_TTL_SECONDS?: string;
  COST_OF_FORGERY_REMEDIATION_OVERRIDE_TTL_MINUTES?: string;
  AUDIT_RANDOM_ANCHOR_ENABLED?: string;
  AUDIT_RANDOM_ANCHOR_PERIOD_MINUTES?: string;
};

type CronController = {
  scheduledTime: number;
  cron: string;
};

const DEFAULT_CORS = 'https://instant-grant-core.dev';

function addCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, X-Cost-Of-Forgery-Token'
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: (origin) => {
      // 開発環境とプレビュー、本番ドメインを許可
      return origin.endsWith('.pages.dev') || origin.includes('localhost') ? origin : (DEFAULT_CORS);
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Cost-Of-Forgery-Token'],
  })
);

async function forwardToDo(c: any): Promise<Response> {
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  const id = c.env.SCHOOL_STORE.idFromName('default');
  const stub = c.env.SCHOOL_STORE.get(id);
  const res = await stub.fetch(c.req.raw);
  const origin = c.req.header('origin');
  const allowedOrigin = (origin?.endsWith('.pages.dev') || origin?.includes('localhost')) ? origin : (c.env?.CORS_ORIGIN ?? DEFAULT_CORS);
  return addCorsHeaders(res, allowedOrigin);
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

async function triggerRandomPeriodicAnchor(
  env: Bindings,
  scheduledTime: number,
  cron: string
): Promise<void> {
  if (!parseBooleanEnv(env.AUDIT_RANDOM_ANCHOR_ENABLED, true)) return;
  const id = env.SCHOOL_STORE.idFromName('default');
  const stub = env.SCHOOL_STORE.get(id);
  const res = await stub.fetch(new Request('https://internal/_internal/audit/random-anchor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scheduledTime, cron }),
  }));
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[random-anchor] scheduled trigger failed', { status: res.status, cron, detail });
  }
}

app.all('/v1/school/*', forwardToDo);
app.all('/api/*', forwardToDo);
app.all('/metadata/*', forwardToDo);

// 監査ログは DO 転送の外で処理
app.route('/', auditRouter);

app.get('/', (c) => c.json({ status: 'ok', service: 'instant-grant-core' }));
app.get('/health', (c) => c.json({ ok: true }));

export { SchoolStore };

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  scheduled(controller: CronController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(triggerRandomPeriodicAnchor(env, controller.scheduledTime, controller.cron));
  },
};
