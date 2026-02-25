/**
 * 学校API 統合テスト（createServer + MemoryStorage、ネットワーク依存なし）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../createServer';
import { createMemoryStorage } from '../storage/MemoryStorage';

describe('school API', () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    app = createServer({ storage: createMemoryStorage() });
  });

  it('GET /v1/school/events returns items', async () => {
    const res = await request(app).get('/v1/school/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    const evt001 = res.body.items.find((e: { id: string }) => e.id === 'evt-001');
    expect(evt001).toBeDefined();
    expect(evt001.title).toBe('地域清掃ボランティア');
    expect(evt001.state).toBe('published');
  });

  it('GET /v1/school/events/evt-001 returns event', async () => {
    const res = await request(app).get('/v1/school/events/evt-001');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('evt-001');
    expect(res.body.title).toBe('地域清掃ボランティア');
  });

  it('GET /v1/school/events/invalid returns 404', async () => {
    const res = await request(app).get('/v1/school/events/invalid');
    expect(res.status).toBe(404);
  });

  it('POST /v1/school/events rejects invalid numeric fields', async () => {
    const res = await request(app)
      .post('/v1/school/events')
      .send({
        title: 'Invalid Event',
        datetime: '2026/02/28 10:00-11:00',
        host: 'Test Host',
        ticketTokenAmount: 'abc',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ticketTokenAmount');
  });

  it('POST /v1/school/claims evt-001 first time returns success', async () => {
    const res = await request(app)
      .post('/v1/school/claims')
      .send({ eventId: 'evt-001', walletAddress: 'addr1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.eventName).toBe('地域清掃ボランティア');
    expect(res.body.alreadyJoined).toBeUndefined();
  });

  it('POST /v1/school/claims evt-001 second time same wallet returns alreadyJoined', async () => {
    const first = await request(app).post('/v1/school/claims').send({ eventId: 'evt-001', walletAddress: 'addr1' });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    const second = await request(app)
      .post('/v1/school/claims')
      .send({ eventId: 'evt-001', walletAddress: 'addr1' });
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(second.body.alreadyJoined).toBe(true);
  });

  it('GET /v1/school/events/:eventId/claimants uses stable fallback confirmationCode', async () => {
    const claimRes = await request(app)
      .post('/v1/school/claims')
      .send({ eventId: 'evt-001', walletAddress: 'stable_wallet_001' });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.success).toBe(true);

    const first = await request(app).get('/v1/school/events/evt-001/claimants');
    expect(first.status).toBe(200);
    const firstItem = first.body.items.find((item: { subject: string }) => item.subject === 'stable_wallet_001');
    expect(firstItem).toBeDefined();
    expect(firstItem.confirmationCode).toMatch(/^[A-F0-9]{6}$/);

    const second = await request(app).get('/v1/school/events/evt-001/claimants');
    expect(second.status).toBe(200);
    const secondItem = second.body.items.find((item: { subject: string }) => item.subject === 'stable_wallet_001');
    expect(secondItem).toBeDefined();
    expect(secondItem.confirmationCode).toBe(firstItem.confirmationCode);
  });

  it('POST /api/events/:eventId/claim already with proof updates sync tx/receipt', async () => {
    const registerRes = await request(app)
      .post('/api/users/register')
      .send({ userId: 'student_001', displayName: 'Student', pin: '1234' });
    expect(registerRes.status).toBe(200);

    const firstClaim = await request(app)
      .post('/api/events/evt-001/claim')
      .send({ userId: 'student_001', pin: '1234' });
    expect(firstClaim.status).toBe(200);
    expect(firstClaim.body.status).toBe('created');

    const secondClaim = await request(app)
      .post('/api/events/evt-001/claim')
      .send({
        userId: 'student_001',
        pin: '1234',
        walletAddress: 'wallet_001',
        txSignature: 'txsig_001',
        receiptPubkey: 'receipt_001',
      });
    expect(secondClaim.status).toBe(200);
    expect(secondClaim.body.status).toBe('already');

    const syncRes = await request(app)
      .post('/api/users/tickets/sync')
      .send({ userId: 'student_001', pin: '1234' });
    expect(syncRes.status).toBe(200);
    expect(Array.isArray(syncRes.body.tickets)).toBe(true);
    expect(syncRes.body.tickets.length).toBeGreaterThanOrEqual(1);
    const ticket = syncRes.body.tickets.find((t: { eventId: string }) => t.eventId === 'evt-001');
    expect(ticket).toBeDefined();
    expect(ticket.txSignature).toBe('txsig_001');
    expect(ticket.receiptPubkey).toBe('receipt_001');
  });

  it('POST /api/events/:eventId/claim rejects on-chain proof before off-chain receipt', async () => {
    const registerRes = await request(app)
      .post('/api/users/register')
      .send({ userId: 'student_002', displayName: 'Student2', pin: '1234' });
    expect(registerRes.status).toBe(200);

    const claimRes = await request(app)
      .post('/api/events/evt-001/claim')
      .send({
        userId: 'student_002',
        pin: '1234',
        walletAddress: 'wallet_002',
        txSignature: 'txsig_002',
        receiptPubkey: 'receipt_002',
      });
    expect(claimRes.status).toBe(409);
    expect(claimRes.body.code).toBe('offchain_receipt_required');
  });

  it('POST /api/audit/receipts/verify-code returns ok for issued confirmation code', async () => {
    const registerRes = await request(app)
      .post('/api/users/register')
      .send({ userId: 'student_003', displayName: 'Student3', pin: '1234' });
    expect(registerRes.status).toBe(200);

    const claimRes = await request(app)
      .post('/api/events/evt-001/claim')
      .send({ userId: 'student_003', pin: '1234' });
    expect(claimRes.status).toBe(200);
    const confirmationCode = claimRes.body?.confirmationCode as string | undefined;
    expect(typeof confirmationCode).toBe('string');

    const verifyRes = await request(app)
      .post('/api/audit/receipts/verify-code')
      .send({ eventId: 'evt-001', confirmationCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.ok).toBe(true);
    expect(verifyRes.body.verification?.ok).toBe(true);
  });
});
