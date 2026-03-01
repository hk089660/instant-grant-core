import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { SchoolStorage } from '../storage/MemoryStorage';
import type { SharedSecurityState } from '../security/sharedSecurityState';

export interface ApiDeps {
    storage: SchoolStorage;
    sharedSecurity: SharedSecurityState;
}

const USER_ID_MIN_LENGTH = 3;
const USER_ID_MAX_LENGTH = 32;
const USER_ID_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

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
    const { storage, sharedSecurity } = deps;
    const userIdHashes = new Set<string>();
    let userIdChainLastHash = '0'.repeat(64);

    const normalizeUserId = (raw: unknown): string => {
        if (typeof raw !== 'string') return '';
        return raw.trim().toLowerCase();
    };

    const validateUserId = (userId: string): string | null => {
        if (!userId) return `userId required (${USER_ID_MIN_LENGTH}-${USER_ID_MAX_LENGTH})`;
        if (!USER_ID_RE.test(userId)) return 'userId must be 3-32 chars using a-z, 0-9, dot, underscore, hyphen';
        return null;
    };

    const hashUserId = (userId: string): string => {
        return crypto.createHash('sha256').update(`user-id:${userId}`).digest('hex');
    };

    const userModeration = sharedSecurity.userModeration;

    const ensureUserNotModerated = (res: Response, userId: string): boolean => {
        const normalized = normalizeUserId(userId);
        if (!normalized) return true;
        const state = userModeration.get(normalized);
        if (state?.deleted) {
            res.status(403).json({
                error: 'user account deleted by operator consensus',
                code: 'user_deleted',
                deletedAt: new Date(state.deleted.deletedAt).toISOString(),
                reason: state.deleted.reason,
            });
            return false;
        }
        if (state?.frozen) {
            res.status(423).json({
                error: 'user account frozen by operator consensus',
                code: 'user_frozen',
                frozenAt: new Date(state.frozen.frozenAt).toISOString(),
                reason: state.frozen.reason,
                unlockRequired: true,
            });
            return false;
        }
        return true;
    };

    const buildUserIdChainHash = (userIdHash: string, prevChainHash: string): string => {
        return crypto
            .createHash('sha256')
            .update(JSON.stringify({
                version: 1,
                kind: 'user_id_register',
                userIdHash,
                prevChainHash,
            }))
            .digest('hex');
    };

    // POST /api/users/register
    router.post('/users/register', async (req: Request, res: Response) => {
        const body = req.body;
        const userId = normalizeUserId(body?.userId);
        const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 32) : '';
        const pin = typeof body?.pin === 'string' ? body.pin : '';

        const userIdError = validateUserId(userId);
        if (userIdError) {
            res.status(400).json({ error: userIdError, code: 'invalid_user_id' });
            return;
        }
        if (!ensureUserNotModerated(res, userId)) {
            return;
        }
        if (!displayName || displayName.length < 1) {
            res.status(400).json({ error: 'displayName required (nickname 1-32)' });
            return;
        }
        if (!/^\d{4,6}$/.test(pin)) {
            res.status(400).json({ error: 'pin must be 4-6 digits' });
            return;
        }

        const userIdHash = hashUserId(userId);
        if (storage.hasUser(userId) || userIdHashes.has(userIdHash)) {
            res.status(409).json({ error: 'userId already exists', code: 'duplicate_user_id' });
            return;
        }

        const pinHash = hashPin(pin);
        const chainHash = buildUserIdChainHash(userIdHash, userIdChainLastHash);

        storage.addUser({ id: userId, displayName, pinHash });
        userIdHashes.add(userIdHash);
        userIdChainLastHash = chainHash;

        res.json({ userId });
    });

    // POST /api/auth/verify
    router.post('/auth/verify', async (req: Request, res: Response) => {
        const body = req.body;
        const userId = normalizeUserId(body?.userId);
        const pin = typeof body?.pin === 'string' ? body.pin : '';

        if (!userId || !pin) {
            res.status(400).json({ error: 'missing params' });
            return;
        }
        if (!ensureUserNotModerated(res, userId)) {
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

    // POST /api/users/tickets/sync
    router.post('/users/tickets/sync', async (req: Request, res: Response) => {
        const body = req.body;
        const userId = normalizeUserId(body?.userId);
        const pin = typeof body?.pin === 'string' ? body.pin : '';

        if (!userId || !pin) {
            res.status(400).json({ error: 'missing params' });
            return;
        }
        if (!ensureUserNotModerated(res, userId)) {
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

        const tickets = storage
            .getUserClaims(userId)
            .slice()
            .sort((a, b) => b.joinedAt - a.joinedAt)
            .map((claim) => {
                const event = storage.getEvent(claim.eventId);
                return {
                    eventId: claim.eventId,
                    eventName: event?.title ?? claim.eventId,
                    claimedAt: claim.joinedAt,
                    confirmationCode: claim.confirmationCode,
                    mint: event?.solanaMint,
                    txSignature: claim.txSignature,
                    receiptPubkey: claim.receiptPubkey,
                };
            });

        res.json({
            syncedAt: new Date().toISOString(),
            tickets,
        });
    });

    // POST /api/audit/receipts/verify-code
    router.post('/audit/receipts/verify-code', async (req: Request, res: Response) => {
        const body = req.body as { eventId?: unknown; confirmationCode?: unknown };
        const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
        const confirmationCode = typeof body?.confirmationCode === 'string' ? body.confirmationCode.trim() : '';
        if (!eventId || !confirmationCode) {
            res.status(400).json({ error: 'eventId and confirmationCode are required' });
            return;
        }

        const claim = storage
            .getClaims(eventId)
            .find((item) => item.confirmationCode === confirmationCode);
        if (!claim) {
            res.status(404).json({ error: 'ticket receipt not found' });
            return;
        }

        res.json({
            ok: true,
            checkedAt: new Date().toISOString(),
            eventId,
            confirmationCode,
            verification: {
                ok: true,
                checkedAt: new Date().toISOString(),
                errors: [],
            },
        });
    });

    // POST /api/events/:eventId/claim
    router.post('/events/:eventId/claim', async (req: Request, res: Response) => {
        const eventId = req.params.eventId;
        const body = req.body;
        const userId = normalizeUserId(body?.userId);
        const pin = typeof body?.pin === 'string' ? body.pin : '';
        const walletAddress = typeof body?.walletAddress === 'string' ? body.walletAddress.trim() : '';
        const txSignature = typeof body?.txSignature === 'string' ? body.txSignature.trim() : '';
        const receiptPubkey = typeof body?.receiptPubkey === 'string' ? body.receiptPubkey.trim() : '';
        const hasOnchainProof = Boolean(walletAddress || txSignature || receiptPubkey);

        if (!userId || !pin) {
            res.status(400).json({ error: 'missing params' });
            return;
        }
        if (!ensureUserNotModerated(res, userId)) {
            return;
        }
        if (hasOnchainProof && (!walletAddress || !txSignature || !receiptPubkey)) {
            res.status(400).json({ error: 'on-chain claim proof required' });
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

        const claimIntervalDays = event.claimIntervalDays ?? 30;
        const maxClaimsPerInterval = event.maxClaimsPerInterval === null
            ? null
            : (event.maxClaimsPerInterval ?? 1);
        const already = storage.hasClaimed(eventId, userId, claimIntervalDays, maxClaimsPerInterval);
        if (!already && hasOnchainProof) {
            res.status(409).json({
                error: 'on-chain claim requires off-chain receipt verification first',
                code: 'offchain_receipt_required',
            });
            return;
        }
        if (already) {
            // 既存のレコードから confirmationCode を探す
            const claims = storage.getUserClaims(userId);
            const rec = claims.find((c) => c.eventId === eventId);
            const confirmationCode = rec?.confirmationCode ?? genConfirmationCode();
            if (hasOnchainProof) {
                storage.updateUserClaimOnchainProof(eventId, userId, {
                    walletAddress,
                    txSignature,
                    receiptPubkey,
                });
            }
            res.json({ status: 'already', confirmationCode });
            return;
        }

        const confirmationCode = genConfirmationCode();
        storage.addUserClaim(
            eventId,
            userId,
            confirmationCode,
            hasOnchainProof
                ? {
                    walletAddress,
                    txSignature,
                    receiptPubkey,
                }
                : undefined
        );
        res.json({ status: 'created', confirmationCode });
    });

    return router;
}
