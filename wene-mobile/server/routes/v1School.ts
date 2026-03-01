/**
 * v1 学校API（GET events, GET events/:id, POST claims）
 * レスポンスは SchoolClaimResult / SchoolEvent 型に 100% 一致
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import type { SchoolEvent, SchoolClaimResult } from '../../src/types/school';
import type { ClaimRecord, SchoolStorage } from '../storage/MemoryStorage';

export interface V1SchoolDeps {
  storage: SchoolStorage;
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
  | 'access_restored';

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

type ReportObligationType = 'freeze' | 'revoke_access';
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

const ADMIN_ISSUE_BURST_WINDOW_MS = 60_000;
const ADMIN_ISSUE_BURST_THRESHOLD = 3;
const ADMIN_WARNING_TTL_MS = 120_000;
const SECURITY_LOG_LIMIT_DEFAULT = 100;
const SECURITY_LOG_LIMIT_MAX = 500;
const REPORT_OBLIGATION_LIMIT_DEFAULT = 100;
const REPORT_OBLIGATION_LIMIT_MAX = 500;

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
  const { storage } = deps;
  const adminSecurityStates = new Map<string, AdminSecurityState>();
  const securityLogs: AdminSecurityLogEntry[] = [];
  const reportObligations: ReportObligationItem[] = [];
  const reportObligationIndex = new Map<string, ReportObligationItem>();
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

    res.json({
      checkedAt: new Date().toISOString(),
      viewer: actor,
      frozenCount: frozenItems.length,
      revokedCount: revokedItems.length,
      warningCount: pendingWarnings.length,
      items: frozenItems,
      revokedItems,
      pendingWarnings,
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

  // POST /v1/school/admin/security/unlock
  router.post('/admin/security/unlock', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetActorId?: unknown };
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

    const previous = { ...targetState.frozen };
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

    res.json({
      success: true,
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
    });
  });

  // POST /v1/school/admin/security/revoke-access
  router.post('/admin/security/revoke-access', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetActorId?: unknown; reason?: unknown };
    const targetActorId = normalizeText(body.targetActorId);
    const reason = normalizeText(body.reason) || 'operator_revoked_access';
    if (!targetActorId) {
      res.status(400).json({ code: 'invalid', message: 'targetActorId is required' });
      return;
    }

    const targetState = getAdminSecurityState(targetActorId);
    const now = Date.now();
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

    res.json({
      success: true,
      targetActorId,
      revokedAt: new Date(now).toISOString(),
      reason,
      reportId: report.reportId,
      revokedBy: actor,
    });
  });

  // POST /v1/school/admin/security/restore-access
  router.post('/admin/security/restore-access', (req: Request, res: Response) => {
    const actor = ensureOperatorContext(req, res);
    if (!actor) return;

    const body = (req.body ?? {}) as { targetActorId?: unknown };
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

    const previous = { ...targetState.revokedAccess };
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

    res.json({
      success: true,
      targetActorId,
      restoredAt: new Date().toISOString(),
      restoredBy: actor,
      previousRevocation: {
        revokedAt: new Date(previous.revokedAt).toISOString(),
        reason: previous.reason,
        reportId: previous.reportId ?? null,
      },
      resolvedReport: resolvedReport ?? null,
    });
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
