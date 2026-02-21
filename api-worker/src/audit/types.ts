export type AuditActor = { type: string; id: string };

export type AuditImmutableMode = 'off' | 'best_effort' | 'required';

export type AuditImmutableSink = {
  sink: 'r2_entry' | 'r2_stream' | 'kv_index' | 'immutable_ingest';
  ref: string;
  at: string;
};

export type AuditImmutableReceipt = {
  mode: AuditImmutableMode;
  payload_hash: string;
  sinks: AuditImmutableSink[];
  warnings?: string[];
};

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
  immutable?: AuditImmutableReceipt;
};
