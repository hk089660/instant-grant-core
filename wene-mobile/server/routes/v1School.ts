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

interface CreateEventBody {
  title?: string;
  datetime?: string;
  host?: string;
  state?: 'draft' | 'published';
  solanaMint?: string;
  solanaAuthority?: string;
  solanaGrantId?: string;
  ticketTokenAmount?: number | string;
  claimIntervalDays?: number | string;
  maxClaimsPerInterval?: number | string | null | 'unlimited';
}

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

export function createV1SchoolRouter(deps: V1SchoolDeps): Router {
  const router = Router();
  const { storage } = deps;

  // GET /v1/school/events
  router.get('/events', (_req: Request, res: Response) => {
    const items = storage.getEvents();
    res.json({ items, nextCursor: undefined });
  });

  // POST /v1/school/events — イベント新規作成（admin用）
  router.post('/events', (req: Request, res: Response) => {
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

    const state = body.state === 'draft' ? 'draft' : 'published';
    const id = `evt-${Date.now().toString(36)}`;
    const event: SchoolEvent = {
      id,
      title,
      datetime,
      host,
      state,
      solanaMint: body.solanaMint,
      solanaAuthority: body.solanaAuthority,
      solanaGrantId: body.solanaGrantId,
      ticketTokenAmount,
      claimIntervalDays,
      maxClaimsPerInterval,
    };
    storage.addEvent(event);
    res.status(201).json(event);
  });

  // GET /v1/school/events/:eventId
  router.get('/events/:eventId', (req: Request, res: Response) => {
    const event = resolveEvent(storage, res, req.params.eventId);
    if (!event) return;
    res.json(event);
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
