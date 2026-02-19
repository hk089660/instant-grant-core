import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { SchoolStorage } from '../storage/MemoryStorage';

export interface ApiDeps {
    storage: SchoolStorage;
}

function hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
}

function genConfirmationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(6);
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function createApiRouter(deps: ApiDeps): Router {
    const router = Router();
    const { storage } = deps;

    // POST /api/users/register
    router.post('/users/register', async (req: Request, res: Response) => {
        const body = req.body;
        const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 32) : '';
        const pin = typeof body?.pin === 'string' ? body.pin : '';

        if (!displayName || displayName.length < 1) {
            res.status(400).json({ error: 'displayName required (1-32)' });
            return;
        }
        if (!/^\d{4,6}$/.test(pin)) {
            res.status(400).json({ error: 'pin must be 4-6 digits' });
            return;
        }

        const userId = crypto.randomUUID();
        const pinHash = hashPin(pin);

        storage.addUser({ id: userId, displayName, pinHash });

        res.json({ userId });
    });

    // POST /api/auth/verify
    router.post('/auth/verify', async (req: Request, res: Response) => {
        const body = req.body;
        const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
        const pin = typeof body?.pin === 'string' ? body.pin : '';

        if (!userId || !pin) {
            res.status(400).json({ error: 'missing params' });
            return;
        }

        const user = storage.getUser(userId);
        if (!user) {
            res.status(401).json({ message: 'User not found', code: 'user_not_found' });
            return;
        }

        const pinHash = hashPin(pin);
        if (user.pinHash !== pinHash) {
            res.status(401).json({ message: 'Invalid PIN', code: 'invalid_pin' });
            return;
        }

        res.json({ ok: true });
    });

    // POST /api/events/:eventId/claim
    router.post('/events/:eventId/claim', async (req: Request, res: Response) => {
        const eventId = req.params.eventId;
        const body = req.body;
        const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
        const pin = typeof body?.pin === 'string' ? body.pin : '';

        if (!userId || !pin) {
            res.status(400).json({ error: 'missing params' });
            return;
        }

        const user = storage.getUser(userId);
        if (!user) {
            res.status(401).json({ message: 'User not found', code: 'user_not_found' });
            return;
        }

        const pinHash = hashPin(pin);
        if (user.pinHash !== pinHash) {
            res.status(401).json({ message: 'Invalid PIN', code: 'invalid_pin' });
            return;
        }

        const event = storage.getEvent(eventId);
        if (!event) {
            res.status(404).json({ error: 'event not found' });
            return;
        }

        if (event.state && event.state !== 'published') {
            res.status(400).json({ error: 'event not available' });
            return;
        }

        const already = storage.hasClaimed(eventId, userId);
        if (already) {
            // 既存のレコードから confirmationCode を探す
            const claims = storage.getUserClaims(userId);
            const rec = claims.find((c) => c.eventId === eventId);
            const confirmationCode = rec?.confirmationCode ?? genConfirmationCode();
            res.json({ status: 'already', confirmationCode });
            return;
        }

        const confirmationCode = genConfirmationCode();
        storage.addUserClaim(eventId, userId, confirmationCode);
        res.json({ status: 'created', confirmationCode });
    });

    return router;
}
