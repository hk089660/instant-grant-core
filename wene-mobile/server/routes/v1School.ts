/**
 * v1 学校API（GET events, GET events/:id, POST claims）
 * レスポンスは SchoolClaimResult / SchoolEvent 型に 100% 一致
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import type { SchoolEvent, SchoolClaimResult } from '../../src/types/school';
import type { ClaimRecord, SchoolStorage } from '../storage/MemoryStorage';
import type { SharedSecurityState, UserModerationState } from '../security/sharedSecurityState';

export interface V1SchoolDeps {
  storage: SchoolStorage;
  sharedSecurity: SharedSecurityState;
}

interface AdminSecurityWarning {
  id: string;
  alertColor: 'red';
  title: string;
  message: string;
  detectedAt: string;
  signals: string[];
  freezeOnProceed: boolean;
}

interface AdminSecurityState {
  issueAttemptTimestamps: number[];
  pendingWarning?: {
    id: string;
    issuedAt: number;
    signals: string[];
  };
  frozen?: {
    frozenAt: number;
    reason: string;
    warningId?: string;
    frozenByActorId?: string;
    reportId?: string;
  };
  revokedAccess?: {
    revokedAt: number;
    reason: string;
    revokedByActorId?: string;
    reportId?: string;
  };
}

type AdminRole = 'admin' | 'master' | 'unknown';

interface AdminActor {
  actorId: string;
  role: AdminRole;
  adminId?: string;
  name?: string;
}

type AdminSecurityLogCategory = 'audit' | 'execution';

type AdminSecurityLogAction =
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

interface AdminSecurityLogEntry {
  id: string;
  ts: string;
  category: AdminSecurityLogCategory;
  action: AdminSecurityLogAction;
  actor: AdminActor;
  targetActorId?: string;
  prevHash: string;
  entryHash: string;
  details?: Record<string, unknown>;
}

type ReportObligationType = 'freeze' | 'revoke_access' | 'operator_revoke' | 'user_freeze' | 'user_delete';
type ReportObligationStatus = 'required' | 'resolved';

interface ReportObligationItem {
  reportId: string;
  type: ReportObligationType;
  status: ReportObligationStatus;
  targetActorId: string;
  actionByActorId: string;
  reason: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedByActorId?: string;
  logEntryId: string;
}

interface CreateEventBody {
  title?: string;
  datetime?: string;
  host?: string;
  state?: 'draft' | 'published';
  riskProfile?: 'school_internal' | 'public';
  solanaMint?: string;
  solanaAuthority?: string;
  solanaGrantId?: string;
  ticketTokenAmount?: number | string;
  claimIntervalDays?: number | string;
  maxClaimsPerInterval?: number | string | null | 'unlimited';
}

type GovernanceActionType =
  | 'unlock_admin'
  | 'revoke_admin_access'
  | 'restore_admin_access'
  | 'revoke_operator'
  | 'restore_operator'
  | 'freeze_user'
  | 'unfreeze_user'
  | 'delete_user'
  | 'restore_user';

type GovernanceProposalStatus = 'pending' | 'executed';

interface GovernanceProposalApproval {
  actorId: string;
  approvedAt: string;
}

interface GovernanceProposal {
  proposalId: string;
  actionType: GovernanceActionType;
  targetId: string;
  reason: string;
  createdAt: string;
  requestedByActorId: string;
  requiredApproverIds: string[];
  approvals: GovernanceProposalApproval[];
  status: GovernanceProposalStatus;
  executedAt?: string;
  executedByActorId?: string;
}

const ADMIN_ISSUE_BURST_WINDOW_MS = 60_000;
const ADMIN_ISSUE_BURST_THRESHOLD = 3;
const ADMIN_WARNING_TTL_MS = 120_000;
const SECURITY_LOG_LIMIT_DEFAULT = 100;
const SECURITY_LOG_LIMIT_MAX = 500;
const REPORT_OBLIGATION_LIMIT_DEFAULT = 100;
const REPORT_OBLIGATION_LIMIT_MAX = 500;
const GOVERNANCE_REASON_MAX_LENGTH = 300;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasProvidedValue(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) return undefined;
    const parsed = Number.parseInt(normalized, 10);
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function resolveEvent(storage: SchoolStorage, res: Response, eventId: string): SchoolEvent | null {
  const event = storage.getEvent(eventId);
  if (!event) {
    res.status(404).json({ code: 'not_found', message: 'イベントが見つかりません' });
    return null;
  }
  return event;
}

function deriveLegacyConfirmationCode(claim: ClaimRecord): string {
  const source = [
    claim.eventId,
    claim.userId ?? '',
    claim.walletAddress ?? '',
    claim.joinToken ?? '',
    String(claim.joinedAt),
  ].join(':');
  return createHash('sha256').update(source).digest('hex').slice(0, 6).toUpperCase();
}

function toClaimantItem(storage: SchoolStorage, claim: ClaimRecord) {
  let displayName = '匿名';
  let subject = claim.walletAddress ?? 'anonymous';

  if (claim.userId) {
    const user = storage.getUser(claim.userId);
    if (user) {
      displayName = user.displayName;
      subject = user.id;
    }
  } else if (claim.walletAddress) {
    displayName = claim.walletAddress.slice(0, 8) + '…';
  }

  const confirmationCode = normalizeText(claim.confirmationCode) || deriveLegacyConfirmationCode(claim);

  return {
    subject,
    displayName,
    confirmationCode,
    claimedAt: new Date(claim.joinedAt).toISOString(),
  };
}

function getAdminRole(req: Request): AdminRole {
  const raw = normalizeText(req.header('x-admin-role')).toLowerCase();
  if (raw === 'master') return 'master';
  if (raw === 'admin') return 'admin';
  return 'unknown';
}

function getAdminActor(req: Request): AdminActor {
  const rawAdminId = normalizeText(req.header('x-admin-id'));
  const role = getAdminRole(req);
  const name = normalizeText(req.header('x-admin-name')) || undefined;

  if (rawAdminId) {
    return {
      actorId: `admin:${rawAdminId.toLowerCase()}`,
      role,
      adminId: rawAdminId.toLowerCase(),
      name,
    };
  }
  const rawAuth = normalizeText(req.header('authorization'));
  if (rawAuth) {
    const token = rawAuth.toLowerCase().startsWith('bearer ') ? rawAuth.slice(7).trim() : rawAuth;
    if (token) {
      return {
        actorId: `token:${createHash('sha256').update(token).digest('hex').slice(0, 16)}`,
        role,
        name,
      };
    }
  }
  const forwardedFor = normalizeText(req.header('x-forwarded-for')).split(',')[0]?.trim() ?? '';
  const sourceIp = forwardedFor || normalizeText(req.ip) || 'unknown';
  return {
    actorId: `ip:${sourceIp}`,
    role,
    name,
  };
}

function collectSuspiciousSignals(req: Request, title: string, host: string, state: AdminSecurityState, now: number): string[] {
  const signals: string[] = [];
  const joinedText = `${title} ${host}`.toLowerCase();
  if (/\b(bot|auto|script|spam|mass)\b/.test(joinedText)) {
    signals.push('suspicious_keyword');
  }

  const userAgent = normalizeText(req.header('user-agent')).toLowerCase();
  if (/(bot|crawler|spider|curl|wget|python|scrapy|headless)/.test(userAgent)) {
    signals.push('bot_like_user_agent');
  }

  state.issueAttemptTimestamps = state.issueAttemptTimestamps.filter((ts) => now - ts <= ADMIN_ISSUE_BURST_WINDOW_MS);
  state.issueAttemptTimestamps.push(now);
  if (state.issueAttemptTimestamps.length >= ADMIN_ISSUE_BURST_THRESHOLD) {
    signals.push('rapid_issue_attempts');
  }

  return Array.from(new Set(signals));
}

function buildAdminSecurityWarning(actorId: string, signals: string[], now: number): AdminSecurityWarning {
  const id = `warn-${createHash('sha256').update(`${actorId}:${now}:${signals.join('|')}`).digest('hex').slice(0, 10)}`;
  return {
    id,
    alertColor: 'red',
    title: '不正発行またはBot操作の疑いを検知しました',
    message: 'このまま続行すると、管理者アカウントはリアルタイム凍結され、運営者の手動ロック解除が必要になります。',
    detectedAt: new Date(now).toISOString(),
    signals,
    freezeOnProceed: true,
  };
}

function normalizeUserKey(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function buildGovernanceProposalId(
  actionType: GovernanceActionType,
  targetId: string,
  actorId: string,
  nowIso: string,
  seed: number
): string {
  return `gov-${createHash('sha256')
    .update(`${actionType}:${targetId}:${actorId}:${nowIso}:${seed}`)
    .digest('hex')
    .slice(0, 12)}`;
}

function respondFrozen(
  res: Response,
  frozen: AdminSecurityState['frozen'],
  message?: string
): void {
  const frozenAt = frozen ? new Date(frozen.frozenAt).toISOString() : new Date().toISOString();
  res.status(423).json({
    code: 'account_frozen',
    alertColor: 'red',
    unlockRequired: true,
    message: message ?? 'この管理者アカウントは現在フリーズ中です。運営者によるロック解除が必要です。',
    frozenAt,
    reason: frozen?.reason ?? 'manual_unlock_required',
    warningId: frozen?.warningId ?? null,
  });
}

function respondAccessRevoked(
  res: Response,
  revokedAccess: AdminSecurityState['revokedAccess'],
  message?: string
): void {
  const revokedAt = revokedAccess ? new Date(revokedAccess.revokedAt).toISOString() : new Date().toISOString();
  res.status(403).json({
    code: 'access_revoked',
    alertColor: 'red',
    unlockRequired: true,
    message: message ?? 'この管理者アカウントの運営者権限は剥奪されています。運営者による復旧が必要です。',
    revokedAt,
    reason: revokedAccess?.reason ?? 'manual_restore_required',
  });
}

export function createV1SchoolRouter(deps: V1SchoolDeps): Router {
  const router = Router();
  const { storage, sharedSecurity } = deps;
  const adminSecurityStates = new Map<string, AdminSecurityState>();
  const securityLogs: AdminSecurityLogEntry[] = [];
  const reportObligations: ReportObligationItem[] = [];
  const reportObligationIndex = new Map<string, ReportObligationItem>();
  const operatorCommunity = new Map<string, AdminActor>();
  const governanceProposalIndex = new Map<string, GovernanceProposal>();
  const revokedOperatorStates = new Map<string, {
    revokedAt: number;
    reason: string;
    revokedByActorId?: string;
    reportId?: string;
  }>();
  const userModeration = sharedSecurity.userModeration;
  let securityLogLastHash = '0'.repeat(64);

  const appendSecurityLog = (
    category: AdminSecurityLogCategory,
    action: AdminSecurityLogAction,
    actor: AdminActor,
    params?: {
      targetActorId?: string;
      details?: Record<string, unknown>;
      now?: number;
    }
  ): AdminSecurityLogEntry => {
    const now = params?.now ?? Date.now();
    const ts = new Date(now).toISOString();
    const id = `log-${createHash('sha256').update(`${ts}:${action}:${actor.actorId}:${securityLogs.length}`).digest('hex').slice(0, 12)}`;
    const payload = JSON.stringify({
      id,
      ts,
      category,
      action,
      actor,
      targetActorId: params?.targetActorId ?? null,
      details: params?.details ?? null,
      prevHash: securityLogLastHash,
    });
    const entryHash = createHash('sha256').update(payload).digest('hex');
    const entry: AdminSecurityLogEntry = {
      id,
      ts,
      category,
      action,
      actor,
      targetActorId: params?.targetActorId,
      details: params?.details,
      prevHash: securityLogLastHash,
      entryHash,
    };
    securityLogs.push(entry);
    securityLogLastHash = entryHash;
    return entry;
  };

  const getAdminSecurityState = (actorId: string): AdminSecurityState => {
    const existing = adminSecurityStates.get(actorId);
    if (existing) return existing;
    const created: AdminSecurityState = {
      issueAttemptTimestamps: [],
    };
    adminSecurityStates.set(actorId, created);
    return created;
  };

  const createReportObligation = (params: {
    type: ReportObligationType;
    targetActorId: string;
    actionByActorId: string;
    reason: string;
    logEntryId: string;
    now?: number;
  }): ReportObligationItem => {
    const now = params.now ?? Date.now();
    const createdAt = new Date(now).toISOString();
    const reportId = `report-${createHash('sha256').update(`${params.type}:${params.targetActorId}:${createdAt}:${params.logEntryId}:${reportObligations.length}`).digest('hex').slice(0, 12)}`;
    const item: ReportObligationItem = {
      reportId,
      type: params.type,
      status: 'required',
      targetActorId: params.targetActorId,
      actionByActorId: params.actionByActorId,
      reason: params.reason,
      createdAt,
      logEntryId: params.logEntryId,
    };
    reportObligations.push(item);
    reportObligationIndex.set(reportId, item);
    return item;
  };

  const resolveReportObligation = (reportId: string, resolvedByActorId: string, now = Date.now()): ReportObligationItem | null => {
    const item = reportObligationIndex.get(reportId);
    if (!item) return null;
    if (item.status === 'resolved') return item;
    item.status = 'resolved';
    item.resolvedAt = new Date(now).toISOString();
    item.resolvedByActorId = resolvedByActorId;
    return item;
  };

  const registerOperatorCommunityActor = (actor: AdminActor): void => {
    if (actor.role !== 'master') return;
    operatorCommunity.set(actor.actorId, actor);
  };

  const getActiveOperatorCommunityIds = (requester: AdminActor): string[] => {
    registerOperatorCommunityActor(requester);
    const ids = new Set<string>();
    for (const actorId of operatorCommunity.keys()) {
      if (revokedOperatorStates.has(actorId)) continue;
      ids.add(actorId);
    }
    ids.add(requester.actorId);
    return Array.from(ids).sort();
  };

  const governanceProposalView = (proposal: GovernanceProposal) => {
    const approvedIds = new Set(proposal.approvals.map((item) => item.actorId));
    const missingApprovers = proposal.requiredApproverIds.filter((actorId) => !approvedIds.has(actorId));
    return {
      proposalId: proposal.proposalId,
      actionType: proposal.actionType,
      targetId: proposal.targetId,
      reason: proposal.reason,
      status: proposal.status,
      createdAt: proposal.createdAt,
      requestedByActorId: proposal.requestedByActorId,
      approvedCount: proposal.approvals.length,
      requiredCount: proposal.requiredApproverIds.length,
      requiredApproverIds: proposal.requiredApproverIds,
      approvals: proposal.approvals,
      missingApprovers,
      unanimousApproved: missingApprovers.length === 0,
      executedAt: proposal.executedAt ?? null,
      executedByActorId: proposal.executedByActorId ?? null,
    };
  };

  const parseGovernanceReason = (raw: unknown, fallback: string): string => {
    const reason = normalizeText(raw) || fallback;
    return reason.slice(0, GOVERNANCE_REASON_MAX_LENGTH);
  };

  const processGovernanceAction = (
    params: {
      actor: AdminActor;
      actionType: GovernanceActionType;
      targetId: string;
      reason: string;
      proposalIdInput?: unknown;
      requiredApproverIds?: string[];
      execute: () => Record<string, unknown>;
    }
  ): { status: number; body: Record<string, unknown> } => {
    const proposalIdInput = normalizeText(params.proposalIdInput);
    const nowIso = new Date().toISOString();
    const requiredApproverIdsInput = params.requiredApproverIds
      ? Array.from(new Set(
        params.requiredApproverIds
          .map((item) => normalizeText(item))
          .filter((item) => item.length > 0)
      )).sort()
      : [];

    let proposal: GovernanceProposal | undefined;
    if (proposalIdInput) {
      proposal = governanceProposalIndex.get(proposalIdInput);
      if (!proposal) {
        return { status: 404, body: { code: 'not_found', message: '指定された合議提案が見つかりません' } };
      }
      if (proposal.actionType !== params.actionType || proposal.targetId !== params.targetId) {
        return { status: 409, body: { code: 'proposal_mismatch', message: '提案と操作内容が一致しません' } };
      }
      if (proposal.status === 'executed') {
        return {
          status: 200,
          body: {
            success: true,
            alreadyExecuted: true,
            consensus: governanceProposalView(proposal),
          },
        };
      }
    } else {
      const pendingCandidates = Array.from(governanceProposalIndex.values())
        .filter((candidate) => (
          candidate.status === 'pending' &&
          candidate.actionType === params.actionType &&
          candidate.targetId === params.targetId
        ))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (pendingCandidates.length > 0) {
        if (requiredApproverIdsInput.length > 0) {
          proposal = pendingCandidates.find((candidate) => (
            candidate.requiredApproverIds.length === requiredApproverIdsInput.length &&
            candidate.requiredApproverIds.every((actorId, index) => actorId === requiredApproverIdsInput[index])
          ));
        } else {
          proposal = pendingCandidates[0];
        }
      }
      if (!proposal) {
        const requiredApproverIds = requiredApproverIdsInput.length > 0
          ? requiredApproverIdsInput
          : getActiveOperatorCommunityIds(params.actor);
        proposal = {
          proposalId: buildGovernanceProposalId(
            params.actionType,
            params.targetId,
            params.actor.actorId,
            nowIso,
            governanceProposalIndex.size
          ),
          actionType: params.actionType,
          targetId: params.targetId,
          reason: params.reason,
          createdAt: nowIso,
          requestedByActorId: params.actor.actorId,
          requiredApproverIds,
          approvals: [],
          status: 'pending',
        };
        governanceProposalIndex.set(proposal.proposalId, proposal);
        appendSecurityLog('audit', 'governance_proposal_created', params.actor, {
          targetActorId: params.targetId,
          details: {
            proposalId: proposal.proposalId,
            actionType: proposal.actionType,
            requiredApproverIds: proposal.requiredApproverIds,
            reason: proposal.reason,
          },
        });
      }
    }

    if (!proposal.requiredApproverIds.includes(params.actor.actorId)) {
      return {
        status: 403,
        body: {
          code: 'forbidden',
          message: 'この運営者は当該提案の合議メンバーではありません',
          proposalId: proposal.proposalId,
        },
      };
    }
    if (!proposal.approvals.some((item) => item.actorId === params.actor.actorId)) {
      proposal.approvals.push({
        actorId: params.actor.actorId,
        approvedAt: nowIso,
      });
      appendSecurityLog('audit', 'governance_proposal_approved', params.actor, {
        targetActorId: params.targetId,
        details: {
          proposalId: proposal.proposalId,
          actionType: proposal.actionType,
          approvedCount: proposal.approvals.length,
          requiredCount: proposal.requiredApproverIds.length,
        },
      });
    }

    const approvedIds = new Set(proposal.approvals.map((item) => item.actorId));
    const unanimous = proposal.requiredApproverIds.every((item) => approvedIds.has(item));
    if (!unanimous) {
      return {
        status: 202,
        body: {
          success: false,
          status: 'pending_consensus',
          consensus: governanceProposalView(proposal),
        },
      };
    }

    const result = params.execute();
    proposal.status = 'executed';
    proposal.executedAt = new Date().toISOString();
    proposal.executedByActorId = params.actor.actorId;
    appendSecurityLog('audit', 'governance_proposal_executed', params.actor, {
      targetActorId: params.targetId,
      details: {
        proposalId: proposal.proposalId,
        actionType: proposal.actionType,
      },
    });
    return {
      status: 200,
      body: {
        success: true,
        ...result,
        consensus: governanceProposalView(proposal),
      },
    };
  };

  const ensureOperatorContext = (req: Request, res: Response): AdminActor | null => {
    const actor = getAdminActor(req);
    const auth = normalizeText(req.header('authorization'));
    if (!auth) {
      res.status(401).json({ code: 'unauthorized', message: '運営者ログインが必要です' });
      return null;
    }
    if (actor.role === 'unknown') {
      res.status(403).json({ code: 'forbidden', message: '運営者ロールが必要です' });
      return null;
    }
    if (!actor.adminId) {
      res.status(403).json({
        code: 'operator_account_required',
        message: '運営者アカウントIDが必要です。共有アカウントではなく分離アカウントで操作してください。',
      });
      return null;
    }
    if (actor.role === 'master') {
      registerOperatorCommunityActor(actor);
      const revoked = revokedOperatorStates.get(actor.actorId);
      if (revoked) {
        res.status(403).json({
          code: 'operator_revoked',
          message: 'この運営者アカウントは運営者コミュニティによって権限剥奪されています',
          revokedAt: new Date(revoked.revokedAt).toISOString(),
          reason: revoked.reason,
          unlockRequired: true,
        });
        return null;
      }
    }
    return actor;
  };

  const ensureGovernanceOperatorContext = (req: Request, res: Response): AdminActor | null => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return null;
    if (actor.role !== 'master') {
      res.status(403).json({
        code: 'operator_consensus_required',
        message: '重たい権限は運営者コミュニティ（master）での全会一致が必要です',
      });
      return null;
    }
    return actor;
  };

  const enforceAdminFreeze = (
    req: Request,
    res: Response,
    operation: 'event_create' | 'event_close'
  ): { actor: AdminActor; state: AdminSecurityState; now: number } | null => {
    const actor = getAdminActor(req);
    const state = getAdminSecurityState(actor.actorId);
    const now = Date.now();
    if (state.revokedAccess) {
      appendSecurityLog('audit', 'revoke_blocked_operation', actor, {
        targetActorId: actor.actorId,
        now,
        details: {
          operation,
          reason: state.revokedAccess.reason,
          reportId: state.revokedAccess.reportId ?? null,
        },
      });
      respondAccessRevoked(res, state.revokedAccess);
      return null;
    }
    if (state.frozen) {
      appendSecurityLog('audit', 'freeze_blocked_operation', actor, {
        targetActorId: actor.actorId,
        now,
        details: {
          operation,
          reason: state.frozen.reason,
          warningId: state.frozen.warningId ?? null,
        },
      });
      respondFrozen(res, state.frozen);
      return null;
    }
    if (state.pendingWarning && now - state.pendingWarning.issuedAt > ADMIN_WARNING_TTL_MS) {
      state.pendingWarning = undefined;
    }
    return { actor, state, now };
  };

  const parseLogLimit = (raw: unknown): number => {
    const parsed = parsePositiveInteger(raw);
    if (!parsed) return SECURITY_LOG_LIMIT_DEFAULT;
    return Math.min(SECURITY_LOG_LIMIT_MAX, parsed);
  };

  const parseReportLimit = (raw: unknown): number => {
    const parsed = parsePositiveInteger(raw);
    if (!parsed) return REPORT_OBLIGATION_LIMIT_DEFAULT;
    return Math.min(REPORT_OBLIGATION_LIMIT_MAX, parsed);
  };

  // GET /v1/school/events
  router.get('/events', (_req: Request, res: Response) => {
    const items = storage.getEvents();
    res.json({ items, nextCursor: undefined });
  });

  // POST /v1/school/events — イベント新規作成（admin用）
  router.post('/events', (req: Request, res: Response) => {
    const adminContext = enforceAdminFreeze(req, res, 'event_create');
    if (!adminContext) return;

    const { actor, state: adminState, now } = adminContext;
    appendSecurityLog('execution', 'event_create_attempt', actor, {
      now,
    });
    const body = (req.body ?? {}) as CreateEventBody;
    const title = normalizeText(body.title);
    const datetime = normalizeText(body.datetime);
    const host = normalizeText(body.host);
    const ticketTokenAmount = parsePositiveInteger(body.ticketTokenAmount);
    const parsedClaimIntervalDays = parsePositiveInteger(body.claimIntervalDays);
    const claimIntervalDays = parsedClaimIntervalDays ?? 30;

    const rawMaxClaimsPerInterval = body.maxClaimsPerInterval;
    let maxClaimsPerInterval: number | null = 1;
    if (rawMaxClaimsPerInterval === null || normalizeText(rawMaxClaimsPerInterval).toLowerCase() === 'unlimited') {
      maxClaimsPerInterval = null;
    } else {
      const parsedMax = parsePositiveInteger(rawMaxClaimsPerInterval);
      if (hasProvidedValue(rawMaxClaimsPerInterval) && parsedMax === undefined) {
        res.status(400).json({ error: 'maxClaimsPerInterval must be null, "unlimited", or a positive integer' });
        return;
      }
      maxClaimsPerInterval = parsedMax ?? 1;
    }

    if (!title || !datetime || !host) {
      res.status(400).json({ error: 'title, datetime, host are required' });
      return;
    }
    if (hasProvidedValue(body.ticketTokenAmount) && ticketTokenAmount === undefined) {
      res.status(400).json({ error: 'ticketTokenAmount must be a positive integer if provided' });
      return;
    }
    if (hasProvidedValue(body.claimIntervalDays) && parsedClaimIntervalDays === undefined) {
      res.status(400).json({ error: 'claimIntervalDays must be a positive integer' });
      return;
    }

    const overrideRequested = normalizeText(req.header('x-admin-security-override')).toLowerCase() === 'continue';
    const hasActiveWarning = Boolean(
      adminState.pendingWarning &&
      now - adminState.pendingWarning.issuedAt <= ADMIN_WARNING_TTL_MS
    );
    if (overrideRequested && hasActiveWarning) {
      const warningId = adminState.pendingWarning?.id;
      adminState.pendingWarning = undefined;
      adminState.frozen = {
        frozenAt: now,
        reason: 'proceeded_after_security_warning',
        warningId,
        frozenByActorId: actor.actorId,
      };
      const freezeLog = appendSecurityLog('audit', 'freeze_enforced', actor, {
        now,
        targetActorId: actor.actorId,
        details: {
          reason: adminState.frozen.reason,
          warningId: adminState.frozen.warningId ?? null,
          mode: 'manual_unlock_required',
        },
      });
      const report = createReportObligation({
        type: 'freeze',
        targetActorId: actor.actorId,
        actionByActorId: actor.actorId,
        reason: adminState.frozen.reason,
        logEntryId: freezeLog.id,
        now,
      });
      adminState.frozen.reportId = report.reportId;
      respondFrozen(
        res,
        adminState.frozen,
        '不正発行/Bot警告後に継続操作が行われたため、管理者アカウントをリアルタイム凍結しました。解除は運営者の手動操作が必要です。'
      );
      return;
    }

    const signals = collectSuspiciousSignals(req, title, host, adminState, now);
    if (signals.length > 0) {
      const warning = buildAdminSecurityWarning(actor.actorId, signals, now);
      adminState.pendingWarning = {
        id: warning.id,
        issuedAt: now,
        signals,
      };
      appendSecurityLog('audit', 'security_warning_detected', actor, {
        now,
        targetActorId: actor.actorId,
        details: {
          warningId: warning.id,
          signals,
          freezeOnProceed: true,
        },
      });
      res.status(409).json({
        code: 'security_warning',
        message: warning.message,
        warning,
      });
      return;
    }

    const state = body.state === 'draft' ? 'draft' : 'published';
    const riskProfile = body.riskProfile === 'public' ? 'public' : 'school_internal';
    const id = `evt-${Date.now().toString(36)}`;
    const event: SchoolEvent = {
      id,
      title,
      datetime,
      host,
      state,
      riskProfile,
      solanaMint: body.solanaMint,
      solanaAuthority: body.solanaAuthority,
      solanaGrantId: body.solanaGrantId,
      ticketTokenAmount,
      claimIntervalDays,
      maxClaimsPerInterval,
    };
    storage.addEvent(event);
    appendSecurityLog('execution', 'event_create_success', actor, {
      targetActorId: actor.actorId,
      details: {
        eventId: id,
        title,
      },
      now,
    });
    res.status(201).json(event);
  });

  // GET /v1/school/events/:eventId
  router.get('/events/:eventId', (req: Request, res: Response) => {
    const event = resolveEvent(storage, res, req.params.eventId);
    if (!event) return;
    res.json(event);
  });

  // GET /v1/school/admin/security/freeze-status
  router.get('/admin/security/freeze-status', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const frozenItems = Array.from(adminSecurityStates.entries())
      .filter(([, state]) => Boolean(state.frozen))
      .map(([actorId, state]) => ({
        actorId,
        frozenAt: state.frozen ? new Date(state.frozen.frozenAt).toISOString() : null,
        reason: state.frozen?.reason ?? null,
        warningId: state.frozen?.warningId ?? null,
        frozenByActorId: state.frozen?.frozenByActorId ?? null,
      }))
      .sort((a, b) => {
        const ta = a.frozenAt ? new Date(a.frozenAt).getTime() : 0;
        const tb = b.frozenAt ? new Date(b.frozenAt).getTime() : 0;
        return tb - ta;
      });

    const pendingWarnings = Array.from(adminSecurityStates.entries())
      .filter(([, state]) => Boolean(state.pendingWarning))
      .map(([actorId, state]) => ({
        actorId,
        warningId: state.pendingWarning?.id ?? null,
        issuedAt: state.pendingWarning ? new Date(state.pendingWarning.issuedAt).toISOString() : null,
        signals: state.pendingWarning?.signals ?? [],
      }));
    const revokedItems = Array.from(adminSecurityStates.entries())
      .filter(([, state]) => Boolean(state.revokedAccess))
      .map(([actorId, state]) => ({
        actorId,
        revokedAt: state.revokedAccess ? new Date(state.revokedAccess.revokedAt).toISOString() : null,
        reason: state.revokedAccess?.reason ?? null,
        revokedByActorId: state.revokedAccess?.revokedByActorId ?? null,
        reportId: state.revokedAccess?.reportId ?? null,
      }))
      .sort((a, b) => {
        const ta = a.revokedAt ? new Date(a.revokedAt).getTime() : 0;
        const tb = b.revokedAt ? new Date(b.revokedAt).getTime() : 0;
        return tb - ta;
      });
    const operatorItems = Array.from(operatorCommunity.values())
      .map((operator) => {
        const revoked = revokedOperatorStates.get(operator.actorId);
        return {
          actorId: operator.actorId,
          role: operator.role,
          name: operator.name ?? null,
          revokedAt: revoked ? new Date(revoked.revokedAt).toISOString() : null,
          revokedReason: revoked?.reason ?? null,
          revokedReportId: revoked?.reportId ?? null,
        };
      })
      .sort((a, b) => a.actorId.localeCompare(b.actorId));
    const governancePendingCount = Array.from(governanceProposalIndex.values())
      .filter((proposal) => proposal.status === 'pending')
      .length;

    res.json({
      checkedAt: new Date().toISOString(),
      viewer: actor,
      frozenCount: frozenItems.length,
      revokedCount: revokedItems.length,
      warningCount: pendingWarnings.length,
      operatorCommunityCount: operatorItems.length,
      operatorRevokedCount: operatorItems.filter((item) => Boolean(item.revokedAt)).length,
      governancePendingCount,
      items: frozenItems,
      revokedItems,
      pendingWarnings,
      operatorItems,
    });
  });

  // GET /v1/school/admin/security/report-obligations
  router.get('/admin/security/report-obligations', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const limit = parseReportLimit(req.query.limit);
    const statusRaw = normalizeText(req.query.status).toLowerCase();
    const statusFilter: ReportObligationStatus | null =
      statusRaw === 'required' || statusRaw === 'resolved' ? statusRaw : null;

    const filtered = statusFilter
      ? reportObligations.filter((item) => item.status === statusFilter)
      : reportObligations;
    const items = filtered
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
    const requiredCount = reportObligations.filter((item) => item.status === 'required').length;
    const resolvedCount = reportObligations.filter((item) => item.status === 'resolved').length;

    res.json({
      checkedAt: new Date().toISOString(),
      viewer: actor,
      limit,
      total: reportObligations.length,
      requiredCount,
      resolvedCount,
      items,
    });
  });

  // GET /v1/school/admin/security/logs
  router.get('/admin/security/logs', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const limit = parseLogLimit(req.query.limit);
    const categoryRaw = normalizeText(req.query.category).toLowerCase();
    const categoryFilter: AdminSecurityLogCategory | null =
      categoryRaw === 'audit' || categoryRaw === 'execution' ? categoryRaw : null;
    const filtered = categoryFilter
      ? securityLogs.filter((entry) => entry.category === categoryFilter)
      : securityLogs;
    const items = filtered.slice(-limit).reverse();

    res.json({
      checkedAt: new Date().toISOString(),
      viewer: actor,
      roleView: 'operator',
      limit,
      total: filtered.length,
      chainLastHash: securityLogLastHash,
      items,
    });
  });

  // GET /v1/school/admin/security/governance/proposals
  router.get('/admin/security/governance/proposals', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const limit = parseLogLimit(req.query.limit);
    const items = Array.from(governanceProposalIndex.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map((item) => governanceProposalView(item));

    res.json({
      checkedAt: new Date().toISOString(),
      viewer: actor,
      total: governanceProposalIndex.size,
      limit,
      items,
    });
  });

  // POST /v1/school/admin/security/unlock
  router.post('/admin/security/unlock', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetActorId?: unknown; proposalId?: unknown };
    const targetActorId = normalizeText(body.targetActorId);
    if (!targetActorId) {
      res.status(400).json({ code: 'invalid', message: 'targetActorId is required' });
      return;
    }
    const targetState = adminSecurityStates.get(targetActorId);
    if (!targetState || !targetState.frozen) {
      res.status(404).json({ code: 'not_found', message: '指定された凍結アカウントが見つかりません' });
      return;
    }

    const reason = parseGovernanceReason(targetState.frozen.reason, 'manual_unlock_required');
    const result = processGovernanceAction({
      actor,
      actionType: 'unlock_admin',
      targetId: targetActorId,
      reason,
      proposalIdInput: body.proposalId,
      execute: () => {
        const previous = { ...targetState.frozen! };
        targetState.frozen = undefined;
        targetState.pendingWarning = undefined;
        targetState.issueAttemptTimestamps = [];
        const resolvedReport = previous.reportId
          ? resolveReportObligation(previous.reportId, actor.actorId)
          : null;
        appendSecurityLog('audit', 'unlock_executed', actor, {
          targetActorId,
          details: {
            reason: previous.reason,
            warningId: previous.warningId ?? null,
            reportId: previous.reportId ?? null,
            reportStatus: resolvedReport?.status ?? null,
          },
        });
        return {
          targetActorId,
          unlockedAt: new Date().toISOString(),
          unlockedBy: actor,
          previousFreeze: {
            frozenAt: new Date(previous.frozenAt).toISOString(),
            reason: previous.reason,
            warningId: previous.warningId ?? null,
            reportId: previous.reportId ?? null,
          },
          resolvedReport: resolvedReport ?? null,
        };
      },
    });

    res.status(result.status).json(result.body);
  });

  // POST /v1/school/admin/security/revoke-access
  router.post('/admin/security/revoke-access', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetActorId?: unknown; reason?: unknown; proposalId?: unknown };
    const targetActorId = normalizeText(body.targetActorId);
    const reason = parseGovernanceReason(body.reason, 'operator_revoked_access');
    if (!targetActorId) {
      res.status(400).json({ code: 'invalid', message: 'targetActorId is required' });
      return;
    }

    const targetState = getAdminSecurityState(targetActorId);
    if (targetState.revokedAccess) {
      res.json({
        success: true,
        targetActorId,
        alreadyRevoked: true,
        revokedAt: new Date(targetState.revokedAccess.revokedAt).toISOString(),
        reason: targetState.revokedAccess.reason,
        reportId: targetState.revokedAccess.reportId ?? null,
      });
      return;
    }

    const result = processGovernanceAction({
      actor,
      actionType: 'revoke_admin_access',
      targetId: targetActorId,
      reason,
      proposalIdInput: body.proposalId,
      execute: () => {
        const now = Date.now();
        if (targetState.frozen?.reportId) {
          resolveReportObligation(targetState.frozen.reportId, actor.actorId, now);
        }
        targetState.frozen = undefined;
        targetState.pendingWarning = undefined;
        targetState.issueAttemptTimestamps = [];
        targetState.revokedAccess = {
          revokedAt: now,
          reason,
          revokedByActorId: actor.actorId,
        };
        const revokeLog = appendSecurityLog('audit', 'access_revoked', actor, {
          now,
          targetActorId,
          details: {
            reason,
          },
        });
        const report = createReportObligation({
          type: 'revoke_access',
          targetActorId,
          actionByActorId: actor.actorId,
          reason,
          logEntryId: revokeLog.id,
          now,
        });
        targetState.revokedAccess.reportId = report.reportId;
        return {
          targetActorId,
          revokedAt: new Date(now).toISOString(),
          reason,
          reportId: report.reportId,
          revokedBy: actor,
        };
      },
    });

    res.status(result.status).json(result.body);
  });

  // POST /v1/school/admin/security/restore-access
  router.post('/admin/security/restore-access', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetActorId?: unknown; proposalId?: unknown };
    const targetActorId = normalizeText(body.targetActorId);
    if (!targetActorId) {
      res.status(400).json({ code: 'invalid', message: 'targetActorId is required' });
      return;
    }

    const targetState = adminSecurityStates.get(targetActorId);
    if (!targetState || !targetState.revokedAccess) {
      res.status(404).json({ code: 'not_found', message: '指定された剥奪アカウントが見つかりません' });
      return;
    }

    const reason = parseGovernanceReason(targetState.revokedAccess.reason, 'operator_restore_access');
    const result = processGovernanceAction({
      actor,
      actionType: 'restore_admin_access',
      targetId: targetActorId,
      reason,
      proposalIdInput: body.proposalId,
      execute: () => {
        const previous = { ...targetState.revokedAccess! };
        targetState.revokedAccess = undefined;
        targetState.pendingWarning = undefined;
        targetState.issueAttemptTimestamps = [];
        const resolvedReport = previous.reportId
          ? resolveReportObligation(previous.reportId, actor.actorId)
          : null;
        appendSecurityLog('audit', 'access_restored', actor, {
          targetActorId,
          details: {
            reason: previous.reason,
            reportId: previous.reportId ?? null,
          },
        });
        return {
          targetActorId,
          restoredAt: new Date().toISOString(),
          restoredBy: actor,
          previousRevocation: {
            revokedAt: new Date(previous.revokedAt).toISOString(),
            reason: previous.reason,
            reportId: previous.reportId ?? null,
          },
          resolvedReport: resolvedReport ?? null,
        };
      },
    });

    res.status(result.status).json(result.body);
  });

  // POST /v1/school/admin/security/operator/revoke
  router.post('/admin/security/operator/revoke', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetOperatorActorId?: unknown; reason?: unknown; proposalId?: unknown };
    const targetOperatorActorId = normalizeText(body.targetOperatorActorId);
    const reason = parseGovernanceReason(body.reason, 'operator_community_revoked');
    if (!targetOperatorActorId) {
      res.status(400).json({ code: 'invalid', message: 'targetOperatorActorId is required' });
      return;
    }
    if (targetOperatorActorId === actor.actorId) {
      res.status(400).json({ code: 'invalid', message: 'self revocation is not allowed' });
      return;
    }
    if (revokedOperatorStates.has(targetOperatorActorId)) {
      const already = revokedOperatorStates.get(targetOperatorActorId)!;
      res.json({
        success: true,
        alreadyRevoked: true,
        targetOperatorActorId,
        revokedAt: new Date(already.revokedAt).toISOString(),
        reason: already.reason,
        reportId: already.reportId ?? null,
      });
      return;
    }

    const requiredApproverIds = getActiveOperatorCommunityIds(actor)
      .filter((operatorActorId) => operatorActorId !== targetOperatorActorId);
    if (requiredApproverIds.length === 0) {
      res.status(409).json({ code: 'invalid', message: 'last active operator cannot be revoked' });
      return;
    }

    const result = processGovernanceAction({
      actor,
      actionType: 'revoke_operator',
      targetId: targetOperatorActorId,
      reason,
      proposalIdInput: body.proposalId,
      requiredApproverIds,
      execute: () => {
        const now = Date.now();
        revokedOperatorStates.set(targetOperatorActorId, {
          revokedAt: now,
          reason,
          revokedByActorId: actor.actorId,
        });
        const revokeLog = appendSecurityLog('audit', 'operator_access_revoked', actor, {
          targetActorId: targetOperatorActorId,
          now,
          details: { reason },
        });
        const report = createReportObligation({
          type: 'operator_revoke',
          targetActorId: targetOperatorActorId,
          actionByActorId: actor.actorId,
          reason,
          logEntryId: revokeLog.id,
          now,
        });
        const revoked = revokedOperatorStates.get(targetOperatorActorId);
        if (revoked) revoked.reportId = report.reportId;
        return {
          targetOperatorActorId,
          revokedAt: new Date(now).toISOString(),
          reason,
          reportId: report.reportId,
          revokedBy: actor,
        };
      },
    });

    res.status(result.status).json(result.body);
  });

  // POST /v1/school/admin/security/operator/restore
  router.post('/admin/security/operator/restore', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetOperatorActorId?: unknown; proposalId?: unknown };
    const targetOperatorActorId = normalizeText(body.targetOperatorActorId);
    if (!targetOperatorActorId) {
      res.status(400).json({ code: 'invalid', message: 'targetOperatorActorId is required' });
      return;
    }
    const revoked = revokedOperatorStates.get(targetOperatorActorId);
    if (!revoked) {
      res.status(404).json({ code: 'not_found', message: '指定された剥奪運営者が見つかりません' });
      return;
    }

    const result = processGovernanceAction({
      actor,
      actionType: 'restore_operator',
      targetId: targetOperatorActorId,
      reason: parseGovernanceReason(revoked.reason, 'operator_community_restore'),
      proposalIdInput: body.proposalId,
      execute: () => {
        const previous = { ...revoked };
        revokedOperatorStates.delete(targetOperatorActorId);
        const resolvedReport = previous.reportId
          ? resolveReportObligation(previous.reportId, actor.actorId)
          : null;
        appendSecurityLog('audit', 'operator_access_restored', actor, {
          targetActorId: targetOperatorActorId,
          details: {
            reason: previous.reason,
            reportId: previous.reportId ?? null,
          },
        });
        return {
          targetOperatorActorId,
          restoredAt: new Date().toISOString(),
          restoredBy: actor,
          previousRevocation: {
            revokedAt: new Date(previous.revokedAt).toISOString(),
            reason: previous.reason,
            reportId: previous.reportId ?? null,
          },
          resolvedReport: resolvedReport ?? null,
        };
      },
    });

    res.status(result.status).json(result.body);
  });

  // GET /v1/school/admin/security/users
  router.get('/admin/security/users', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const userIdFilter = normalizeUserKey(req.query.userId);
    const items = Array.from(userModeration.entries())
      .filter(([userId]) => !userIdFilter || userId === userIdFilter)
      .map(([userId, state]) => ({
        userId,
        frozenAt: state.frozen ? new Date(state.frozen.frozenAt).toISOString() : null,
        frozenReason: state.frozen?.reason ?? null,
        frozenByActorId: state.frozen?.byActorId ?? null,
        frozenReportId: state.frozen?.reportId ?? null,
        deletedAt: state.deleted ? new Date(state.deleted.deletedAt).toISOString() : null,
        deletedReason: state.deleted?.reason ?? null,
        deletedByActorId: state.deleted?.byActorId ?? null,
        deletedReportId: state.deleted?.reportId ?? null,
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));
    res.json({
      checkedAt: new Date().toISOString(),
      viewer: actor,
      total: items.length,
      items,
    });
  });

  // POST /v1/school/admin/security/users/freeze
  router.post('/admin/security/users/freeze', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { userId?: unknown; reason?: unknown; proposalId?: unknown };
    const userId = normalizeUserKey(body.userId);
    if (!userId) {
      res.status(400).json({ code: 'invalid', message: 'userId is required' });
      return;
    }
    const current = userModeration.get(userId) ?? {};
    if (current.deleted) {
      res.status(409).json({ code: 'invalid', message: 'deleted user cannot be frozen' });
      return;
    }
    if (current.frozen) {
      res.json({
        success: true,
        alreadyFrozen: true,
        userId,
        frozenAt: new Date(current.frozen.frozenAt).toISOString(),
        reason: current.frozen.reason,
        reportId: current.frozen.reportId ?? null,
      });
      return;
    }
    const reason = parseGovernanceReason(body.reason, 'operator_community_frozen_user');
    const targetId = `user:${userId}`;
    const result = processGovernanceAction({
      actor,
      actionType: 'freeze_user',
      targetId,
      reason,
      proposalIdInput: body.proposalId,
      execute: () => {
        const now = Date.now();
        const state: UserModerationState = userModeration.get(userId) ?? {};
        state.frozen = {
          frozenAt: now,
          reason,
          byActorId: actor.actorId,
        };
        userModeration.set(userId, state);
        const freezeLog = appendSecurityLog('audit', 'user_frozen', actor, {
          targetActorId: targetId,
          now,
          details: { reason, userId },
        });
        const report = createReportObligation({
          type: 'user_freeze',
          targetActorId: targetId,
          actionByActorId: actor.actorId,
          reason,
          logEntryId: freezeLog.id,
          now,
        });
        const latest = userModeration.get(userId);
        if (latest?.frozen) latest.frozen.reportId = report.reportId;
        return {
          userId,
          frozenAt: new Date(now).toISOString(),
          reason,
          reportId: report.reportId,
          frozenBy: actor,
        };
      },
    });
    res.status(result.status).json(result.body);
  });

  // POST /v1/school/admin/security/users/unfreeze
  router.post('/admin/security/users/unfreeze', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { userId?: unknown; proposalId?: unknown };
    const userId = normalizeUserKey(body.userId);
    if (!userId) {
      res.status(400).json({ code: 'invalid', message: 'userId is required' });
      return;
    }
    const current = userModeration.get(userId);
    if (!current?.frozen) {
      res.status(404).json({ code: 'not_found', message: '指定された凍結ユーザーが見つかりません' });
      return;
    }
    const targetId = `user:${userId}`;
    const result = processGovernanceAction({
      actor,
      actionType: 'unfreeze_user',
      targetId,
      reason: parseGovernanceReason(current.frozen.reason, 'operator_community_unfreeze_user'),
      proposalIdInput: body.proposalId,
      execute: () => {
        const previous = { ...current.frozen! };
        current.frozen = undefined;
        userModeration.set(userId, current);
        const resolvedReport = previous.reportId
          ? resolveReportObligation(previous.reportId, actor.actorId)
          : null;
        appendSecurityLog('audit', 'user_unfrozen', actor, {
          targetActorId: targetId,
          details: {
            reason: previous.reason,
            reportId: previous.reportId ?? null,
            userId,
          },
        });
        return {
          userId,
          unfrozenAt: new Date().toISOString(),
          unfrozenBy: actor,
          previousFreeze: {
            frozenAt: new Date(previous.frozenAt).toISOString(),
            reason: previous.reason,
            reportId: previous.reportId ?? null,
          },
          resolvedReport: resolvedReport ?? null,
        };
      },
    });
    res.status(result.status).json(result.body);
  });

  // POST /v1/school/admin/security/users/delete
  router.post('/admin/security/users/delete', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { userId?: unknown; reason?: unknown; proposalId?: unknown };
    const userId = normalizeUserKey(body.userId);
    if (!userId) {
      res.status(400).json({ code: 'invalid', message: 'userId is required' });
      return;
    }
    const current = userModeration.get(userId) ?? {};
    if (current.deleted) {
      res.json({
        success: true,
        alreadyDeleted: true,
        userId,
        deletedAt: new Date(current.deleted.deletedAt).toISOString(),
        reason: current.deleted.reason,
        reportId: current.deleted.reportId ?? null,
      });
      return;
    }
    const reason = parseGovernanceReason(body.reason, 'operator_community_deleted_user');
    const targetId = `user:${userId}`;
    const result = processGovernanceAction({
      actor,
      actionType: 'delete_user',
      targetId,
      reason,
      proposalIdInput: body.proposalId,
      execute: () => {
        const now = Date.now();
        const state: UserModerationState = userModeration.get(userId) ?? {};
        state.deleted = {
          deletedAt: now,
          reason,
          byActorId: actor.actorId,
        };
        state.frozen = {
          frozenAt: now,
          reason: `deleted:${reason}`,
          byActorId: actor.actorId,
        };
        userModeration.set(userId, state);
        const deleteLog = appendSecurityLog('audit', 'user_deleted', actor, {
          targetActorId: targetId,
          now,
          details: { reason, userId },
        });
        const report = createReportObligation({
          type: 'user_delete',
          targetActorId: targetId,
          actionByActorId: actor.actorId,
          reason,
          logEntryId: deleteLog.id,
          now,
        });
        const latest = userModeration.get(userId);
        if (latest?.deleted) latest.deleted.reportId = report.reportId;
        if (latest?.frozen) latest.frozen.reportId = report.reportId;
        return {
          userId,
          deletedAt: new Date(now).toISOString(),
          reason,
          reportId: report.reportId,
          deletedBy: actor,
        };
      },
    });
    res.status(result.status).json(result.body);
  });

  // POST /v1/school/admin/security/users/restore
  router.post('/admin/security/users/restore', (req: Request, res: Response) => {
    const actor = ensureGovernanceOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { userId?: unknown; proposalId?: unknown };
    const userId = normalizeUserKey(body.userId);
    if (!userId) {
      res.status(400).json({ code: 'invalid', message: 'userId is required' });
      return;
    }
    const current = userModeration.get(userId);
    if (!current?.deleted) {
      res.status(404).json({ code: 'not_found', message: '指定された削除ユーザーが見つかりません' });
      return;
    }
    const targetId = `user:${userId}`;
    const result = processGovernanceAction({
      actor,
      actionType: 'restore_user',
      targetId,
      reason: parseGovernanceReason(current.deleted.reason, 'operator_community_restore_user'),
      proposalIdInput: body.proposalId,
      execute: () => {
        const previousDeleted = { ...current.deleted! };
        const previousFrozen = current.frozen ? { ...current.frozen } : null;
        current.deleted = undefined;
        current.frozen = undefined;
        userModeration.set(userId, current);
        const resolvedReport = previousDeleted.reportId
          ? resolveReportObligation(previousDeleted.reportId, actor.actorId)
          : null;
        appendSecurityLog('audit', 'user_restored', actor, {
          targetActorId: targetId,
          details: {
            reason: previousDeleted.reason,
            reportId: previousDeleted.reportId ?? null,
            userId,
          },
        });
        return {
          userId,
          restoredAt: new Date().toISOString(),
          restoredBy: actor,
          previousDeletion: {
            deletedAt: new Date(previousDeleted.deletedAt).toISOString(),
            reason: previousDeleted.reason,
            reportId: previousDeleted.reportId ?? null,
            frozenAt: previousFrozen ? new Date(previousFrozen.frozenAt).toISOString() : null,
          },
          resolvedReport: resolvedReport ?? null,
        };
      },
    });
    res.status(result.status).json(result.body);
  });

  // POST /v1/school/events/:eventId/close
  router.post('/events/:eventId/close', (req: Request, res: Response) => {
    const adminContext = enforceAdminFreeze(req, res, 'event_close');
    if (!adminContext) return;

    const { actor, now } = adminContext;
    const event = resolveEvent(storage, res, req.params.eventId);
    if (!event) return;
    if (event.state === 'ended') {
      res.json(event);
      return;
    }
    const updated = storage.updateEventState(req.params.eventId, 'ended');
    if (!updated) {
      res.status(404).json({ code: 'not_found', message: 'イベントが見つかりません' });
      return;
    }
    appendSecurityLog('execution', 'event_close_success', actor, {
      now,
      details: {
        eventId: req.params.eventId,
        state: 'ended',
      },
    });
    res.json(updated);
  });

  // GET /v1/school/events/:eventId/claimants
  router.get('/events/:eventId/claimants', (req: Request, res: Response) => {
    const event = resolveEvent(storage, res, req.params.eventId);
    if (!event) return;
    const claims = storage.getClaims(req.params.eventId);
    const items = claims.map((claim) => toClaimantItem(storage, claim));
    res.json({ eventId: req.params.eventId, eventTitle: event.title, items });
  });

  // POST /v1/school/claims
  router.post('/claims', (req: Request, res: Response) => {
    const body = req.body as { eventId?: string; walletAddress?: string; joinToken?: string };
    const eventId = normalizeText(body?.eventId);
    const walletAddress = normalizeText(body?.walletAddress) || undefined;
    const joinToken = normalizeText(body?.joinToken) || undefined;

    if (!eventId) {
      res.status(400).json({
        success: false,
        error: { code: 'invalid', message: 'イベントIDが無効です' },
      } as SchoolClaimResult);
      return;
    }

    const event = storage.getEvent(eventId);
    if (!event) {
      res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'イベントが見つかりません' },
      } as SchoolClaimResult);
      return;
    }

    if (event.state && event.state !== 'published') {
      res.status(403).json({
        success: false,
        error: { code: 'eligibility', message: 'このイベントは参加できません' },
      } as SchoolClaimResult);
      return;
    }

    const existing = storage.getClaims(eventId);
    const claimIntervalDays = event.claimIntervalDays ?? 30;
    const maxClaimsPerInterval = event.maxClaimsPerInterval === null ? null : (event.maxClaimsPerInterval ?? 1);
    const intervalMs = claimIntervalDays * 24 * 60 * 60 * 1000;
    const windowStart = Date.now() - intervalMs;
    const subjectClaims = existing.filter((c) => {
      if (walletAddress && c.walletAddress === walletAddress) return true;
      if (joinToken && c.joinToken === joinToken) return true;
      return false;
    });
    const subjectClaimsInWindow = subjectClaims.filter((c) => c.joinedAt >= windowStart);
    const reachedLimit =
      maxClaimsPerInterval === null
        ? false
        : subjectClaimsInWindow.length >= maxClaimsPerInterval;
    if (reachedLimit) {
      res.status(200).json({
        success: true,
        eventName: event.title,
        alreadyJoined: true,
      } as SchoolClaimResult);
      return;
    }

    storage.addClaim(eventId, walletAddress, joinToken);
    res.status(200).json({
      success: true,
      eventName: event.title,
    } as SchoolClaimResult);
  });

  return router;
}
