export type AuditActor = { type: string; id: string };

export type AuditLogRequest = {
  event: string;
  eventId: string;
  actor: AuditActor;
  data?: Record<string, unknown>;
};

export type AuditEvent = {
  ts: string;
  event: string;
  eventId: string;
  actor: AuditActor;
  data: Record<string, unknown>;
  prev_hash: string;
  stream_prev_hash?: string;
  entry_hash: string;
};
