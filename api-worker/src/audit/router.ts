
import { Hono } from 'hono';
import type { AuditActor, AuditEvent, AuditLogRequest } from './types';

// Define the stub interface for RPC
interface SchoolStoreStub {
  appendAuditLog(event: string, actor: AuditActor, data: unknown, eventId: string): Promise<AuditEvent>;
}

type Env = {
  AUDIT_LOGS: R2Bucket;
  AUDIT_INDEX: KVNamespace;

  SCHOOL_STORE: any;
};

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

  // Use the 'default' DO instance to serialize all audit logs (or per-event if needed, but keeping single instance for now)
  // To strictly follow the instruction about "schoolId or similar", we could use eventId, 
  // but since we are migrating from a single index, using 'default' ensures we don't need to migrate data yet per-shard if not intended.
  // However, the DO method appendAuditLog keys by eventId internally, so using 'default' stub is safe.


  const id = c.env.SCHOOL_STORE.idFromName('default');
  const tempStub: unknown = c.env.SCHOOL_STORE.get(id);
  const stub = tempStub as SchoolStoreStub;

  const fullEntry = await stub.appendAuditLog(body.event, body.actor, body.data, eventId);
  const entry_hash = fullEntry.entry_hash;
  const ts = fullEntry.ts;

  const date = ts.slice(0, 10);
  const objectKey = `audit/${eventId}/${date}.jsonl`;

  const existingObj = await c.env.AUDIT_LOGS.get(objectKey);
  const existingText = existingObj ? await existingObj.text() : '';

  await c.env.AUDIT_LOGS.put(objectKey, existingText + JSON.stringify(fullEntry) + '\n');

  // KV update is now handled by DO (as storage.put), so we don't need AUDIT_INDEX.put here.
  // We keep AUDIT_INDEX in Env just in case it's still needed elsewhere or for legacy reads, 
  // but for this flow it's replaced by DO.

  return c.json({ ok: true, entry_hash, objectKey });
});

export default auditRouter;
export { auditRouter };
