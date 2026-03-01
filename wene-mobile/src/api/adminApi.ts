/**
 * Admin 用 API ヘルパー
 * Worker の /v1/school/* エンドポイントを呼び出す
 */

import { HttpError, httpGet, httpPost } from './http/httpClient';
import type { SchoolEvent } from '../types/school';
import { clearAdminSession, loadAdminSession } from '../lib/adminAuth';
import { clearAdminRuntimeArtifacts } from '../lib/adminRuntimeScope';

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const envBase = (
    process.env.EXPO_PUBLIC_SCHOOL_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    ''
  ).trim().replace(/\/$/, '');
  if (envBase) return envBase;
  throw new Error('API base URL is required (set EXPO_PUBLIC_SCHOOL_API_BASE_URL or EXPO_PUBLIC_API_BASE_URL)');
}

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const session = await loadAdminSession();
  if (!session?.token) {
    throw new HttpError(401, { message: '管理者ログインが必要です' });
  }
  const deriveFallbackOperatorId = (seed: string): string => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const scopedOperatorId =
    (typeof session.adminId === 'string' && session.adminId.trim())
      ? session.adminId.trim()
      : `operator-${deriveFallbackOperatorId(`${session.role}:${session.token}`)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
    'X-Admin-Role': session.role,
    'X-Admin-Id': scopedOperatorId,
  };
  if (session.adminName) {
    headers['X-Admin-Name'] = session.adminName;
  }
  return headers;
}

async function withAdminAuth<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      const currentSession = await loadAdminSession();
      await clearAdminSession();
      await clearAdminRuntimeArtifacts(currentSession);
    }
    throw e;
  }
}

/** イベント一覧取得 */
export async function fetchAdminEvents(): Promise<(SchoolEvent & { claimedCount: number })[]> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    const data = await httpGet<{ items: (SchoolEvent & { claimedCount: number })[] }>(`${base}/v1/school/events?scope=mine`, { headers });
    return data.items;
  });
}

/** イベント詳細取得 */
export async function fetchAdminEvent(eventId: string): Promise<SchoolEvent & { claimedCount: number }> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<SchoolEvent & { claimedCount: number }>(`${base}/v1/school/events/${encodeURIComponent(eventId)}`, { headers });
  });
}

export interface AdminSecurityWarning {
  id: string;
  alertColor: 'red';
  title: string;
  message: string;
  detectedAt: string;
  signals: string[];
  freezeOnProceed: boolean;
}

interface AdminCreateEventSecurityWarningPayload {
  warning?: Partial<AdminSecurityWarning>;
}

function normalizeAdminSecurityWarning(payload: unknown): AdminSecurityWarning | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as AdminCreateEventSecurityWarningPayload;
  const warning = data.warning;
  if (!warning || typeof warning !== 'object') return null;

  const title = typeof warning.title === 'string' && warning.title.trim()
    ? warning.title.trim()
    : '不正操作の疑いを検知しました';
  const message = typeof warning.message === 'string' && warning.message.trim()
    ? warning.message.trim()
    : '続行時にアカウントをフリーズします。';
  const id = typeof warning.id === 'string' && warning.id.trim()
    ? warning.id.trim()
    : `warning-${Date.now().toString(36)}`;
  const detectedAt = typeof warning.detectedAt === 'string' && warning.detectedAt.trim()
    ? warning.detectedAt.trim()
    : new Date().toISOString();
  const signals = Array.isArray(warning.signals)
    ? warning.signals.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    id,
    alertColor: 'red',
    title,
    message,
    detectedAt,
    signals,
    freezeOnProceed: warning.freezeOnProceed !== false,
  };
}

export class AdminSecurityWarningError extends Error {
  readonly warning: AdminSecurityWarning;

  constructor(warning: AdminSecurityWarning) {
    super(warning.message);
    this.name = 'AdminSecurityWarningError';
    this.warning = warning;
  }
}

/** イベント作成 */
export async function createAdminEvent(data: {
  title: string;
  datetime: string;
  host: string;
  state?: 'draft' | 'published';
  solanaMint?: string;
  solanaAuthority?: string;
  solanaGrantId?: string;
  ticketTokenAmount?: number;
  claimIntervalDays?: number;
  maxClaimsPerInterval?: number | null;
}, options?: {
  acknowledgeSecurityWarning?: boolean;
}): Promise<SchoolEvent> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    if (options?.acknowledgeSecurityWarning) {
      headers['X-Admin-Security-Override'] = 'continue';
    }
    try {
      return await httpPost<SchoolEvent>(`${base}/v1/school/events`, data, { headers });
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        const warning = normalizeAdminSecurityWarning(e.body);
        if (warning) {
          throw new AdminSecurityWarningError(warning);
        }
      }
      if (e instanceof HttpError && e.status === 423 && e.body && typeof e.body === 'object') {
        const body = e.body as { message?: unknown; unlockRequired?: unknown; frozenAt?: unknown };
        const msg = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : '管理者アカウントがフリーズされています';
        const frozenAt = typeof body.frozenAt === 'string' && body.frozenAt.trim()
          ? body.frozenAt.trim()
          : '';
        const unlockRequired = body.unlockRequired === true;
        const suffix = unlockRequired
          ? '（運営者の手動ロック解除が必要です）'
          : '';
        throw new Error(frozenAt ? `${msg}${suffix} (凍結開始: ${frozenAt})` : `${msg}${suffix}`);
      }
      throw e;
    }
  });
}

/** イベントを終了（クローズ） */
export async function closeAdminEvent(eventId: string): Promise<SchoolEvent & { claimedCount: number }> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpPost<SchoolEvent & { claimedCount: number }>(
      `${base}/v1/school/events/${encodeURIComponent(eventId)}/close`,
      {},
      { headers }
    );
  });
}

/** 参加者一覧 */
export interface Claimant {
  subject: string;
  displayName: string;
  confirmationCode?: string;
  claimedAt?: string;
}

export interface ClaimantsResponse {
  eventId: string;
  eventTitle: string;
  items: Claimant[];
}

export async function fetchClaimants(eventId: string): Promise<ClaimantsResponse> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<ClaimantsResponse>(`${base}/v1/school/events/${encodeURIComponent(eventId)}/claimants`, { headers });
  });
}

/** 管理者パスワード検証 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const res = await loginAdmin(password);
  return res.success;
}

export type AdminRole = 'master' | 'admin';

export interface AdminLoginInfo {
  adminId?: string;
  name?: string;
  source?: 'master' | 'invite' | 'demo';
  createdAt?: string;
  status?: 'active' | 'revoked';
}

export interface AdminLoginResult {
  success: boolean;
  role?: AdminRole;
  info?: AdminLoginInfo;
}

export async function loginAdmin(password: string): Promise<AdminLoginResult> {
  const base = getBaseUrl();
  try {
    const res = await httpPost<{ ok: boolean; role?: AdminRole; info?: AdminLoginInfo }>(`${base}/api/admin/login`, { password });
    if (res?.ok) {
      return { success: true, role: res.role, info: res.info };
    }
    return { success: false };
  } catch (e) {
    console.warn('loginAdmin failed', e);
    return { success: false };
  }
}

export interface InviteCodeRecord {
  code: string;
  adminId: string;
  name: string;
  source: 'invite';
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
  revokedBy?: string | null;
}

export interface InviteConsensusOperator {
  actorId: string;
  adminId: string;
  role: 'master' | 'admin';
  source: 'master' | 'invite';
  name: string;
}

export interface InviteApprovalRecord extends InviteConsensusOperator {
  approvedAt: string;
}

export interface InviteCodePendingApproval {
  status: 'pending_approval';
  proposalId: string;
  name: string;
  createdAt: string;
  requestedBy?: InviteConsensusOperator;
  approvals: InviteApprovalRecord[];
  approvedCount: number;
  requiredCount: number;
  requiredApprovers: InviteConsensusOperator[];
  missingApprovers: InviteConsensusOperator[];
  unanimousApproved: boolean;
}

export interface InviteCodeRejected {
  status: 'cancelled';
  proposalId: string;
  name: string;
  cancelledAt: string | null;
  cancelledByActorId: string | null;
  reason: string | null;
}

export type CreateInviteCodeResult = InviteCodeRecord | InviteCodePendingApproval;

type InviteCodeRecordPayload = Partial<InviteCodeRecord> & {
  code?: string;
  adminId?: string;
  name?: string;
  source?: string;
  status?: string;
  createdAt?: string;
  revokedAt?: string | null;
  revokedBy?: string | null;
};

type InviteConsensusOperatorPayload = Partial<InviteConsensusOperator> & {
  actorId?: string;
  adminId?: string;
  role?: string;
  source?: string;
  name?: string;
};

type InviteApprovalRecordPayload = Partial<InviteApprovalRecord> & InviteConsensusOperatorPayload & {
  approvedAt?: string;
};

type InviteCodePendingApprovalPayload = Partial<InviteCodePendingApproval> & {
  status?: string;
  proposalId?: string;
  name?: string;
  createdAt?: string;
  requestedBy?: InviteConsensusOperatorPayload;
  approvals?: InviteApprovalRecordPayload[];
  approvedCount?: number;
  requiredCount?: number;
  requiredApprovers?: InviteConsensusOperatorPayload[];
  missingApprovers?: InviteConsensusOperatorPayload[];
  unanimousApproved?: boolean;
};

type InviteCodeRejectedPayload = Partial<InviteCodeRejected> & {
  status?: string;
  proposalId?: string;
  name?: string;
  cancelledAt?: string | null;
  cancelledByActorId?: string | null;
  reason?: string | null;
};

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { error?: string; message?: string };
    const msg = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : '';
    return msg ? `${fallback}: ${msg}` : `${fallback} (HTTP ${res.status})`;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

const MASTER_API_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = MASTER_API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Request timeout (${timeoutMs}ms)`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeInviteCodeRecord(payload: InviteCodeRecordPayload, fallbackName = 'Unknown Admin'): InviteCodeRecord | null {
  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  if (!code) return null;

  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : fallbackName;
  const createdAt =
    typeof payload?.createdAt === 'string' && payload.createdAt.trim()
      ? payload.createdAt
      : new Date().toISOString();
  const revokedAt = typeof payload?.revokedAt === 'string' ? payload.revokedAt : null;
  const adminId =
    typeof payload?.adminId === 'string' && payload.adminId.trim()
      ? payload.adminId.trim()
      : `legacy-${code.slice(0, 8)}`;

  return {
    code,
    adminId,
    name,
    source: 'invite',
    status: payload?.status === 'revoked' || Boolean(revokedAt) ? 'revoked' : 'active',
    createdAt,
    revokedAt,
    revokedBy: typeof payload?.revokedBy === 'string' ? payload.revokedBy : null,
  };
}

function normalizeInviteConsensusOperator(payload: InviteConsensusOperatorPayload | undefined): InviteConsensusOperator | null {
  const actorId = typeof payload?.actorId === 'string' ? payload.actorId.trim() : '';
  const adminId = typeof payload?.adminId === 'string' ? payload.adminId.trim() : '';
  if (!actorId || !adminId) return null;
  const role = payload?.role === 'master' ? 'master' : 'admin';
  const source = payload?.source === 'master' ? 'master' : 'invite';
  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : role === 'master'
        ? 'Master Operator'
        : 'Unknown Admin';
  return { actorId, adminId, role, source, name };
}

function normalizeInviteApprovalRecord(payload: InviteApprovalRecordPayload): InviteApprovalRecord | null {
  const base = normalizeInviteConsensusOperator(payload);
  if (!base) return null;
  const approvedAt =
    typeof payload?.approvedAt === 'string' && payload.approvedAt.trim()
      ? payload.approvedAt
      : new Date().toISOString();
  return { ...base, approvedAt };
}

function normalizeInviteCodePendingApproval(payload: InviteCodePendingApprovalPayload): InviteCodePendingApproval | null {
  if (payload?.status !== 'pending_approval') return null;
  const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId.trim() : '';
  if (!proposalId) return null;
  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : 'Unknown Admin';
  const createdAt =
    typeof payload?.createdAt === 'string' && payload.createdAt.trim()
      ? payload.createdAt
      : new Date().toISOString();
  const requestedBy = normalizeInviteConsensusOperator(payload?.requestedBy);
  const approvalsRaw = Array.isArray(payload?.approvals) ? payload.approvals : [];
  const requiredApproversRaw = Array.isArray(payload?.requiredApprovers) ? payload.requiredApprovers : [];
  const missingApproversRaw = Array.isArray(payload?.missingApprovers) ? payload.missingApprovers : [];
  const approvals = approvalsRaw
    .map((item) => normalizeInviteApprovalRecord(item))
    .filter((item): item is InviteApprovalRecord => item !== null);
  const requiredApprovers = requiredApproversRaw
    .map((item) => normalizeInviteConsensusOperator(item))
    .filter((item): item is InviteConsensusOperator => item !== null);
  const missingApprovers = missingApproversRaw
    .map((item) => normalizeInviteConsensusOperator(item))
    .filter((item): item is InviteConsensusOperator => item !== null);
  const approvedCount = Number.isFinite(payload?.approvedCount) ? Number(payload?.approvedCount) : approvals.length;
  const requiredCount = Number.isFinite(payload?.requiredCount) ? Number(payload?.requiredCount) : requiredApprovers.length;
  return {
    status: 'pending_approval',
    proposalId,
    name,
    createdAt,
    ...(requestedBy ? { requestedBy } : {}),
    approvals,
    approvedCount,
    requiredCount,
    requiredApprovers,
    missingApprovers,
    unanimousApproved: Boolean(payload?.unanimousApproved),
  };
}

function normalizeInviteCodeRejected(payload: InviteCodeRejectedPayload): InviteCodeRejected | null {
  if (payload?.status !== 'cancelled') return null;
  const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId.trim() : '';
  if (!proposalId) return null;
  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : 'Unknown Admin';
  return {
    status: 'cancelled',
    proposalId,
    name,
    cancelledAt: typeof payload?.cancelledAt === 'string' ? payload.cancelledAt : null,
    cancelledByActorId: typeof payload?.cancelledByActorId === 'string' ? payload.cancelledByActorId : null,
    reason: typeof payload?.reason === 'string' ? payload.reason : null,
  };
}

/** 招待コード発行申請（全会一致承認で発行完了） */
export async function createInviteCode(masterPassword: string, name: string): Promise<CreateInviteCodeResult> {
  const base = getBaseUrl();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('admin name is required');
  }
  const res = await fetchWithTimeout(`${base}/api/admin/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterPassword}`,
    },
    body: JSON.stringify({ name: trimmedName }),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to create invite code'));
  }
  const json = await res.json() as InviteCodeRecordPayload & InviteCodePendingApprovalPayload;
  const pending = normalizeInviteCodePendingApproval(json);
  if (pending) {
    return pending;
  }
  const normalized = normalizeInviteCodeRecord(json, trimmedName);
  if (!normalized) {
    throw new Error('Invalid invite response');
  }
  return normalized;
}

export async function fetchPendingInviteApprovals(operatorToken: string): Promise<InviteCodePendingApproval[]> {
  const base = getBaseUrl();
  const res = await fetchWithTimeout(`${base}/api/admin/invite/pending`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${operatorToken}`,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(await readErrorMessage(res, 'Session expired'));
    }
    throw new Error(await readErrorMessage(res, 'Failed to fetch pending invite approvals'));
  }
  const json = await res.json() as { proposals?: InviteCodePendingApprovalPayload[] };
  const proposalsRaw = Array.isArray(json?.proposals) ? json.proposals : [];
  return proposalsRaw
    .map((item) => normalizeInviteCodePendingApproval(item))
    .filter((item): item is InviteCodePendingApproval => item !== null);
}

export async function approveInviteProposal(operatorToken: string, proposalId: string): Promise<CreateInviteCodeResult> {
  const base = getBaseUrl();
  const trimmedProposalId = proposalId.trim();
  if (!trimmedProposalId) {
    throw new Error('proposalId is required');
  }
  const res = await fetchWithTimeout(`${base}/api/admin/invite/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify({ proposalId: trimmedProposalId }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to approve invite proposal'));
  }
  const json = await res.json() as InviteCodeRecordPayload & InviteCodePendingApprovalPayload;
  const pending = normalizeInviteCodePendingApproval(json);
  if (pending) return pending;
  const normalized = normalizeInviteCodeRecord(json);
  if (!normalized) {
    throw new Error('Invalid invite approval response');
  }
  return normalized;
}

export async function rejectInviteProposal(
  operatorToken: string,
  proposalId: string,
  reason: string
): Promise<InviteCodeRejected> {
  const base = getBaseUrl();
  const trimmedProposalId = proposalId.trim();
  const trimmedReason = reason.trim();
  if (!trimmedProposalId) {
    throw new Error('proposalId is required');
  }
  if (!trimmedReason) {
    throw new Error('reason is required');
  }
  const res = await fetchWithTimeout(`${base}/api/admin/invite/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify({ proposalId: trimmedProposalId, reason: trimmedReason }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to reject invite proposal'));
  }
  const json = await res.json() as InviteCodeRejectedPayload;
  const normalized = normalizeInviteCodeRejected(json);
  if (!normalized) {
    throw new Error('Invalid invite rejection response');
  }
  return normalized;
}

/** 招待コード一覧取得 (Master Only) */
export async function fetchInviteCodes(masterPassword: string, includeRevoked = true): Promise<InviteCodeRecord[]> {
  const base = getBaseUrl();
  const query = includeRevoked ? '?includeRevoked=1' : '?includeRevoked=0';
  const res = await fetchWithTimeout(`${base}/api/admin/invites${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(await readErrorMessage(res, 'Session expired'));
    }
    return [];
  }
  const json = await res.json() as { invites?: InviteCodeRecordPayload[] };
  const invitesRaw = Array.isArray(json?.invites) ? json.invites : [];
  return invitesRaw
    .map((item) => normalizeInviteCodeRecord(item))
    .filter((item): item is InviteCodeRecord => item !== null);
}

/** 招待コード無効化 (Master Only) */
export async function revokeInviteCode(masterPassword: string, code: string): Promise<boolean> {
  const base = getBaseUrl();
  const res = await fetchWithTimeout(`${base}/api/admin/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterPassword}`,
    },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(await readErrorMessage(res, 'Session expired'));
    }
    return false;
  }
  const json = await res.json();
  return json.success === true;
}

/** 招待コードの管理者名変更 (Master Only) */
export async function renameInviteCode(masterPassword: string, params: {
  name: string;
  code?: string;
  adminId?: string;
}): Promise<InviteCodeRecord> {
  const base = getBaseUrl();
  const res = await fetchWithTimeout(`${base}/api/admin/rename`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterPassword}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to rename invite code'));
  }
  const json = await res.json() as { invite?: InviteCodeRecordPayload } & InviteCodeRecordPayload;
  const normalized = normalizeInviteCodeRecord(json.invite ?? json, params.name.trim() || 'Unknown Admin');
  if (!normalized) {
    throw new Error('Invalid rename response');
  }
  return normalized;
}

/** Audit Log (Master Only) */
export interface MasterAuditLog {
  ts: string;
  event: string;
  eventId: string;
  actor: { type: string; id: string };
  prev_hash: string;
  stream_prev_hash?: string;
  entry_hash: string;
  data?: any;
}

export async function fetchMasterAuditLogs(masterPassword: string): Promise<MasterAuditLog[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/master/audit-logs`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  return json.logs || [];
}

export interface TransferParty {
  type: string;
  id: string;
}

export interface TransferAuditPayload {
  mode: 'onchain' | 'offchain';
  asset: 'ticket_token';
  amount: number | null;
  mint: string | null;
  txSignature: string | null;
  receiptPubkey: string | null;
  sender: TransferParty;
  recipient: TransferParty;
}

export interface TransferLogEntry {
  ts: string;
  event: string;
  eventId: string;
  entryHash: string;
  prevHash: string;
  streamPrevHash: string;
  transfer: TransferAuditPayload;
  pii?: Record<string, string>;
}

export interface AdminTransferLogsResponse {
  roleView: 'admin';
  strictLevel: string;
  checkedAt: string;
  limit: number;
  eventId: string | null;
  items: TransferLogEntry[];
}

export interface MasterTransferLogsResponse {
  roleView: 'master';
  strictLevel: string;
  checkedAt: string;
  limit: number;
  eventId: string | null;
  items: TransferLogEntry[];
}

export interface MasterAdminDisclosureUserClaim {
  ts: string;
  eventId: string;
  eventTitle: string | null;
  transfer: TransferAuditPayload;
  pii?: Record<string, string>;
}

export interface MasterAdminDisclosureUser {
  key: string;
  userId: string | null;
  displayName: string | null;
  walletAddress: string | null;
  joinToken: string | null;
  recipientType: string;
  recipientId: string;
  eventIds: string[];
  claims: MasterAdminDisclosureUserClaim[];
}

export interface MasterAdminDisclosureEvent {
  id: string;
  title: string;
  datetime: string;
  host: string;
  state: string;
  claimedCount: number;
  ownerSource: 'master' | 'invite' | 'demo' | 'inferred';
}

export interface MasterAdminDisclosure {
  adminId: string;
  code: string;
  name: string;
  createdAt: string;
  status: 'active' | 'revoked';
  revokedAt: string | null;
  events: MasterAdminDisclosureEvent[];
  relatedTransferCount: number;
  relatedUsers: MasterAdminDisclosureUser[];
}

export interface MasterAdminDisclosuresResponse {
  checkedAt: string;
  strictLevel: 'master_full';
  includeRevoked: boolean;
  transferLimit: number;
  admins: MasterAdminDisclosure[];
}

export interface MasterSearchResultItem {
  id: string;
  kind: 'admin' | 'event' | 'user' | 'claim';
  title: string;
  subtitle: string;
  detail: string;
}

export interface MasterSearchResponse {
  checkedAt: string;
  strictLevel: 'master_full';
  query: string;
  includeRevoked: boolean;
  transferLimit: number;
  limit: number;
  total: number;
  indexBuiltAt: string | null;
  items: MasterSearchResultItem[];
}

export async function fetchMasterAdminDisclosures(
  masterPassword: string,
  params?: { includeRevoked?: boolean; transferLimit?: number }
): Promise<MasterAdminDisclosuresResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  query.set('includeRevoked', params?.includeRevoked === false ? '0' : '1');
  if (typeof params?.transferLimit === 'number' && Number.isFinite(params.transferLimit)) {
    query.set('transferLimit', String(Math.max(1, Math.floor(params.transferLimit))));
  }
  const res = await fetch(`${base}/api/master/admin-disclosures?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });
  if (!res.ok) {
    return {
      checkedAt: new Date().toISOString(),
      strictLevel: 'master_full',
      includeRevoked: params?.includeRevoked !== false,
      transferLimit: typeof params?.transferLimit === 'number' ? params.transferLimit : 500,
      admins: [],
    };
  }
  return res.json() as Promise<MasterAdminDisclosuresResponse>;
}

export async function fetchMasterSearchResults(
  masterPassword: string,
  params: {
    query: string;
    limit?: number;
    includeRevoked?: boolean;
    transferLimit?: number;
  }
): Promise<MasterSearchResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  query.set('q', params.query.trim());
  query.set('includeRevoked', params.includeRevoked === false ? '0' : '1');
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  if (typeof params.transferLimit === 'number' && Number.isFinite(params.transferLimit)) {
    query.set('transferLimit', String(Math.max(1, Math.floor(params.transferLimit))));
  }
  const res = await fetch(`${base}/api/master/search?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });
  if (!res.ok) {
    return {
      checkedAt: new Date().toISOString(),
      strictLevel: 'master_full',
      query: params.query.trim(),
      includeRevoked: params.includeRevoked !== false,
      transferLimit: typeof params.transferLimit === 'number' ? params.transferLimit : 500,
      limit: typeof params.limit === 'number' ? params.limit : 100,
      total: 0,
      indexBuiltAt: null,
      items: [],
    };
  }
  return res.json() as Promise<MasterSearchResponse>;
}

export async function fetchAdminTransferLogs(params?: {
  eventId?: string;
  limit?: number;
}): Promise<AdminTransferLogsResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  if (params?.eventId?.trim()) query.set('eventId', params.eventId.trim());
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<AdminTransferLogsResponse>(`${base}/api/admin/transfers${suffix}`, { headers });
  });
}

export async function fetchMasterTransferLogs(
  masterPassword: string,
  params?: { eventId?: string; limit?: number }
): Promise<MasterTransferLogsResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  if (params?.eventId?.trim()) query.set('eventId', params.eventId.trim());
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${base}/api/master/transfers${suffix}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${masterPassword}`,
    },
  });

  if (!res.ok) {
    return {
      roleView: 'master',
      strictLevel: 'master_full',
      checkedAt: new Date().toISOString(),
      limit: typeof params?.limit === 'number' ? params.limit : 50,
      eventId: params?.eventId?.trim() || null,
      items: [],
    };
  }
  return res.json() as Promise<MasterTransferLogsResponse>;
}

export interface RuntimeStatusResponse {
  ready: boolean;
  checkedAt: string;
  checks: {
    adminPasswordConfigured: boolean;
    popEnforced: boolean;
    popSignerConfigured: boolean;
    popSignerPubkey: string | null;
    popSignerError: string | null;
    auditMode: 'off' | 'best_effort' | 'required';
    auditOperationalReady: boolean;
    auditPrimarySinkConfigured: boolean;
    corsOrigin: string | null;
  };
  blockingIssues: string[];
  warnings: string[];
}

/** Runtime readiness status (public operational check) */
export async function fetchRuntimeStatus(): Promise<RuntimeStatusResponse> {
  const base = getBaseUrl();
  return httpGet<RuntimeStatusResponse>(`${base}/v1/school/runtime-status`);
}

export interface PopStatusResponse {
  enforceOnchainPop: boolean;
  signerConfigured: boolean;
  signerPubkey: string | null;
  error: string | null;
}

/** PoP runtime status (public operational check) */
export async function fetchPopStatus(): Promise<PopStatusResponse> {
  const base = getBaseUrl();
  return httpGet<PopStatusResponse>(`${base}/v1/school/pop-status`);
}

export interface AdminSecurityViewer {
  actorId: string;
  role: 'admin' | 'master' | 'unknown';
  adminId?: string;
  name?: string;
}

export interface AdminFrozenAccount {
  actorId: string;
  frozenAt: string | null;
  reason: string | null;
  warningId: string | null;
  frozenByActorId: string | null;
}

export interface AdminRevokedAccount {
  actorId: string;
  revokedAt: string | null;
  reason: string | null;
  revokedByActorId: string | null;
  reportId: string | null;
}

export interface AdminPendingWarning {
  actorId: string;
  warningId: string | null;
  issuedAt: string | null;
  signals: string[];
}

export interface AdminSecurityFreezeStatusResponse {
  checkedAt: string;
  viewer: AdminSecurityViewer;
  frozenCount: number;
  revokedCount?: number;
  warningCount: number;
  operatorCommunityCount?: number;
  operatorRevokedCount?: number;
  governancePendingCount?: number;
  items: AdminFrozenAccount[];
  revokedItems?: AdminRevokedAccount[];
  pendingWarnings: AdminPendingWarning[];
  operatorItems?: Array<{
    actorId: string;
    role: 'admin' | 'master' | 'unknown';
    name: string | null;
    revokedAt: string | null;
    revokedReason: string | null;
    revokedReportId: string | null;
  }>;
}

export interface AdminReportObligationItem {
  reportId: string;
  type: 'freeze' | 'revoke_access' | 'operator_revoke' | 'user_freeze' | 'user_delete';
  status: 'required' | 'resolved';
  targetActorId: string;
  actionByActorId: string;
  reason: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedByActorId?: string;
  logEntryId: string;
}

export interface AdminReportObligationsResponse {
  checkedAt: string;
  viewer: AdminSecurityViewer;
  limit: number;
  total: number;
  requiredCount: number;
  resolvedCount: number;
  items: AdminReportObligationItem[];
}

export interface AdminSecurityLogEntry {
  id: string;
  ts: string;
  category: 'audit' | 'execution';
  action:
  | 'event_create_attempt'
  | 'event_create_success'
  | 'event_close_success'
  | 'security_warning_detected'
  | 'freeze_enforced'
  | 'freeze_blocked_operation'
  | 'unlock_executed'
  | 'access_revoked'
  | 'revoke_blocked_operation'
  | 'access_restored'
  | 'operator_access_revoked'
  | 'operator_access_restored'
  | 'user_frozen'
  | 'user_unfrozen'
  | 'user_deleted'
  | 'user_restored'
  | 'governance_proposal_created'
  | 'governance_proposal_approved'
  | 'governance_proposal_executed';
  actor: AdminSecurityViewer;
  targetActorId?: string;
  prevHash: string;
  entryHash: string;
  details?: Record<string, unknown>;
}

export interface AdminSecurityLogsResponse {
  checkedAt: string;
  viewer: AdminSecurityViewer;
  roleView: 'operator';
  limit: number;
  total: number;
  chainLastHash: string;
  items: AdminSecurityLogEntry[];
}

export interface UnlockFrozenAdminResponse {
  success: true;
  targetActorId: string;
  unlockedAt: string;
}

export interface RevokeAdminAccessResponse {
  success: true;
  targetActorId: string;
  revokedAt: string;
  reason: string;
  reportId: string;
}

export interface RestoreAdminAccessResponse {
  success: true;
  targetActorId: string;
  restoredAt: string;
}

export async function fetchAdminSecurityFreezeStatus(): Promise<AdminSecurityFreezeStatusResponse> {
  const base = getBaseUrl();
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<AdminSecurityFreezeStatusResponse>(`${base}/v1/school/admin/security/freeze-status`, { headers });
  });
}

export async function fetchAdminSecurityLogs(params?: {
  limit?: number;
  category?: 'audit' | 'execution';
}): Promise<AdminSecurityLogsResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  if (params?.category) {
    query.set('category', params.category);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<AdminSecurityLogsResponse>(`${base}/v1/school/admin/security/logs${suffix}`, { headers });
  });
}

export async function fetchAdminReportObligations(params?: {
  limit?: number;
  status?: 'required' | 'resolved';
}): Promise<AdminReportObligationsResponse> {
  const base = getBaseUrl();
  const query = new URLSearchParams();
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(params.limit))));
  }
  if (params?.status) {
    query.set('status', params.status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpGet<AdminReportObligationsResponse>(`${base}/v1/school/admin/security/report-obligations${suffix}`, { headers });
  });
}

export async function unlockFrozenAdmin(targetActorId: string): Promise<UnlockFrozenAdminResponse> {
  const base = getBaseUrl();
  const trimmed = targetActorId.trim();
  if (!trimmed) {
    throw new Error('targetActorId is required');
  }
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpPost<UnlockFrozenAdminResponse>(
      `${base}/v1/school/admin/security/unlock`,
      { targetActorId: trimmed },
      { headers }
    );
  });
}

export async function revokeAdminAccess(targetActorId: string, reason?: string): Promise<RevokeAdminAccessResponse> {
  const base = getBaseUrl();
  const trimmed = targetActorId.trim();
  if (!trimmed) {
    throw new Error('targetActorId is required');
  }
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpPost<RevokeAdminAccessResponse>(
      `${base}/v1/school/admin/security/revoke-access`,
      { targetActorId: trimmed, reason: typeof reason === 'string' ? reason : undefined },
      { headers }
    );
  });
}

export async function restoreAdminAccess(targetActorId: string): Promise<RestoreAdminAccessResponse> {
  const base = getBaseUrl();
  const trimmed = targetActorId.trim();
  if (!trimmed) {
    throw new Error('targetActorId is required');
  }
  return withAdminAuth(async () => {
    const headers = await getAdminAuthHeaders();
    return httpPost<RestoreAdminAccessResponse>(
      `${base}/v1/school/admin/security/restore-access`,
      { targetActorId: trimmed },
      { headers }
    );
  });
}
