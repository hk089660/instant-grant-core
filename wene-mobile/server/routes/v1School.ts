/**
 * v1 学校API（GET events, GET events/:id, POST claims）
 * レスポンスは SchoolClaimResult / SchoolEvent 型に 100% 一致
 */

import { Router, Request, Response } from 'express';
import type { SchoolEvent, SchoolClaimResult } from '../../src/types/school';
import type { SchoolStorage } from '../storage/MemoryStorage';

export interface V1SchoolDeps {
  storage: SchoolStorage;
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
    const body = req.body as {
      title?: string;
      datetime?: string;
      host?: string;
      state?: 'draft' | 'published';
      solanaMint?: string;
      solanaAuthority?: string;
      solanaGrantId?: string;
      ticketTokenAmount?: number | string;
      claimIntervalDays?: number | string;
      maxClaimsPerInterval?: number | string | null;
    };
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const datetime = typeof body?.datetime === 'string' ? body.datetime.trim() : '';
    const host = typeof body?.host === 'string' ? body.host.trim() : '';
    const rawTokenAmount = body?.ticketTokenAmount;
    const ticketTokenAmount =
      typeof rawTokenAmount === 'number' && Number.isFinite(rawTokenAmount)
        ? Math.floor(rawTokenAmount)
        : typeof rawTokenAmount === 'string' && /^\d+$/.test(rawTokenAmount.trim())
          ? Number.parseInt(rawTokenAmount.trim(), 10)
          : NaN;
    const rawClaimIntervalDays = body?.claimIntervalDays;
    const claimIntervalDays =
      typeof rawClaimIntervalDays === 'number' && Number.isFinite(rawClaimIntervalDays)
        ? Math.floor(rawClaimIntervalDays)
        : typeof rawClaimIntervalDays === 'string' && /^\d+$/.test(rawClaimIntervalDays.trim())
          ? Number.parseInt(rawClaimIntervalDays.trim(), 10)
          : 30;
    const rawMaxClaimsPerInterval = body?.maxClaimsPerInterval;
    const maxClaimsPerInterval =
      rawMaxClaimsPerInterval === null || rawMaxClaimsPerInterval === 'unlimited'
        ? null
        : typeof rawMaxClaimsPerInterval === 'number' && Number.isFinite(rawMaxClaimsPerInterval)
          ? Math.floor(rawMaxClaimsPerInterval)
          : typeof rawMaxClaimsPerInterval === 'string' && /^\d+$/.test(rawMaxClaimsPerInterval.trim())
            ? Number.parseInt(rawMaxClaimsPerInterval.trim(), 10)
            : 1;

    if (!title || !datetime || !host) {
      res.status(400).json({ error: 'title, datetime, host are required' });
      return;
    }
    if (!Number.isInteger(ticketTokenAmount) || ticketTokenAmount <= 0) {
      res.status(400).json({ error: 'ticketTokenAmount must be a positive integer' });
      return;
    }
    if (!Number.isInteger(claimIntervalDays) || claimIntervalDays <= 0) {
      res.status(400).json({ error: 'claimIntervalDays must be a positive integer' });
      return;
    }
    if (maxClaimsPerInterval !== null && (!Number.isInteger(maxClaimsPerInterval) || maxClaimsPerInterval <= 0)) {
      res.status(400).json({ error: 'maxClaimsPerInterval must be null or a positive integer' });
      return;
    }
    const id = `evt-${Date.now().toString(36)}`;
    const event: SchoolEvent = {
      id,
      title,
      datetime,
      host,
      state: body.state ?? 'published',
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
    const event = storage.getEvent(req.params.eventId);
    if (!event) {
      res.status(404).json({ code: 'not_found', message: 'イベントが見つかりません' });
      return;
    }
    res.json(event as SchoolEvent);
  });

  // GET /v1/school/events/:eventId/claimants
  router.get('/events/:eventId/claimants', (req: Request, res: Response) => {
    const event = storage.getEvent(req.params.eventId);
    if (!event) {
      res.status(404).json({ code: 'not_found', message: 'イベントが見つかりません' });
      return;
    }
    const claims = storage.getClaims(req.params.eventId);
    const items = claims.map((c) => {
      let displayName = '匿名';
      let subject = c.walletAddress ?? 'anonymous';

      if (c.userId) {
        const user = storage.getUser(c.userId);
        if (user) {
          displayName = user.displayName;
          subject = user.id;
        }
      } else if (c.walletAddress) {
        displayName = c.walletAddress.slice(0, 8) + '…';
      }

      return {
        subject,
        displayName,
        confirmationCode: c.confirmationCode ?? Math.random().toString(36).slice(2, 8).toUpperCase(),
        claimedAt: new Date(c.joinedAt).toISOString(),
      };
    });
    res.json({ eventId: req.params.eventId, eventTitle: event.title, items });
  });

  // POST /v1/school/claims
  router.post('/claims', (req: Request, res: Response) => {
    const body = req.body as { eventId?: string; walletAddress?: string; joinToken?: string };
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
    const walletAddress = typeof body?.walletAddress === 'string' ? body.walletAddress : undefined;
    const joinToken = typeof body?.joinToken === 'string' ? body.joinToken : undefined;

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
