import { Hono } from 'hono';
import { canonicalize, sha256Hex } from './hash';
import type { AuditEvent, AuditLogRequest } from './types';

type Env = { AUDIT_LOGS: R2Bucket; AUDIT_INDEX: KVNamespace };

const auditRouter = new Hono<{ Bindings: Env }>();

function badRequest(message: string) {
  return { ok: false as const, error: message };
}

// index.ts が '/' に mount してる想定
auditRouter.post('/v1/audit/log', async (c) => {
  let body: AuditLogRequest;
  try {
    body = await c.req.json<AuditLogRequest>();
  } catch {
    return c.json(badRequest('invalid json'), 400);
  }

  if (!body?.event || typeof body.event !== 'string') return c.json(badRequest('event is required'), 400);
  if (!body?.eventId || typeof body.eventId !== 'string') return c.json(badRequest('eventId is required'), 400);
  if (!body?.actor || typeof body.actor.type !== 'string' || typeof body.actor.id !== 'string') {
    return c.json(badRequest('actor.type and actor.id are required'), 400);
  }

  const eventId = body.eventId;
  const lastHashKey = `audit:lastHash:${eventId}`;
  const prevHash = (await c.env.AUDIT_INDEX.get(lastHashKey)) ?? 'GENESIS';
  const ts = new Date().toISOString();

  const baseEntry = {
    ts,
    event: body.event,
    eventId,
    actor: body.actor,
    data: body.data ?? {},
    prev_hash: prevHash,
  };

  const entry_hash = await sha256Hex(canonicalize(baseEntry));
  const fullEntry: AuditEvent = { ...baseEntry, entry_hash };

  const date = ts.slice(0, 10);
  const objectKey = `audit/${eventId}/${date}.jsonl`;

  const existingObj = await c.env.AUDIT_LOGS.get(objectKey);
  const existingText = existingObj ? await existingObj.text() : '';

  await c.env.AUDIT_LOGS.put(objectKey, existingText + JSON.stringify(fullEntry) + '\n');
  await c.env.AUDIT_INDEX.put(lastHashKey, entry_hash);

  return c.json({ ok: true, entry_hash, objectKey });
});

export default auditRouter;
export { auditRouter };
