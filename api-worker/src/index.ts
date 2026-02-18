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
  SCHOOL_STORE: DurableObjectNamespace;
  AUDIT_LOGS: R2Bucket;
  AUDIT_INDEX: KVNamespace;
};

const DEFAULT_CORS = 'https://your-pages.pages.dev';

function addCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
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
    origin: (_, c) => c.env?.CORS_ORIGIN ?? DEFAULT_CORS,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);

async function forwardToDo(c: any): Promise<Response> {
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  const id = c.env.SCHOOL_STORE.idFromName('default');
  const stub = c.env.SCHOOL_STORE.get(id);
  const res = await stub.fetch(c.req.raw);
  const origin = c.env?.CORS_ORIGIN ?? DEFAULT_CORS;
  return addCorsHeaders(res, origin);
}

app.all('/v1/school/*', forwardToDo);
app.all('/api/*', forwardToDo);

// 監査ログは DO 転送の外で処理
app.route('/', auditRouter);

app.get('/', (c) => c.json({ status: 'ok', service: 'we-ne-school-api' }));
app.get('/health', (c) => c.json({ ok: true }));

export { SchoolStore };

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
