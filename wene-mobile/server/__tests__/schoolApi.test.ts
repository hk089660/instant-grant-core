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

  it('POST /v1/school/events/:eventId/close marks event as ended and blocks claim', async () => {
    const closeRes = await request(app).post('/v1/school/events/evt-001/close').send({});
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.state).toBe('ended');

    const claimRes = await request(app)
      .post('/v1/school/claims')
      .send({ eventId: 'evt-001', walletAddress: 'addr-close-test' });
    expect(claimRes.status).toBe(403);
    expect(claimRes.body.success).toBe(false);
    expect(claimRes.body.error?.code).toBe('eligibility');
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

  it('POST /v1/school/events returns red security warning when suspicious issuance is detected', async () => {
    const res = await request(app)
      .post('/v1/school/events')
      .set('Authorization', 'Bearer admin-warning-test')
      .send({
        title: 'bot mass issue campaign',
        datetime: '2026/03/01 10:00-11:00',
        host: 'Automation Team',
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('security_warning');
    expect(res.body.warning?.alertColor).toBe('red');
    expect(res.body.warning?.freezeOnProceed).toBe(true);
    expect(Array.isArray(res.body.warning?.signals)).toBe(true);
    expect(res.body.warning?.signals.length).toBeGreaterThan(0);
  });

  it('POST /v1/school/events keeps account frozen until operator manually unlocks it', async () => {
    const actorToken = 'Bearer admin-freeze-test';
    const suspiciousPayload = {
      title: 'bot scripted event',
      datetime: '2026/03/02 10:00-11:00',
      host: 'script-operator',
    };

    const warningRes = await request(app)
      .post('/v1/school/events')
      .set('Authorization', actorToken)
      .send(suspiciousPayload);
    expect(warningRes.status).toBe(409);
    expect(warningRes.body.code).toBe('security_warning');

    const freezeRes = await request(app)
      .post('/v1/school/events')
      .set('Authorization', actorToken)
      .set('X-Admin-Security-Override', 'continue')
      .send(suspiciousPayload);
    expect(freezeRes.status).toBe(423);
    expect(freezeRes.body.code).toBe('account_frozen');
    expect(freezeRes.body.alertColor).toBe('red');
    expect(freezeRes.body.unlockRequired).toBe(true);
    expect(typeof freezeRes.body.frozenAt).toBe('string');

    const blockedRes = await request(app)
      .post('/v1/school/events')
      .set('Authorization', actorToken)
      .send({
        title: 'normal event after freeze',
        datetime: '2026/03/03 10:00-11:00',
        host: 'Student Council',
      });
    expect(blockedRes.status).toBe(423);
    expect(blockedRes.body.code).toBe('account_frozen');

    const freezeStatusRes = await request(app)
      .get('/v1/school/admin/security/freeze-status')
      .set('Authorization', 'Bearer operator-admin-01')
      .set('X-Admin-Role', 'admin')
      .set('X-Admin-Id', 'operator-admin-01');
    expect(freezeStatusRes.status).toBe(200);
    expect(Array.isArray(freezeStatusRes.body.items)).toBe(true);
    expect(freezeStatusRes.body.items.length).toBeGreaterThanOrEqual(1);
    const frozenActor = freezeStatusRes.body.items[0]?.actorId as string | undefined;
    expect(typeof frozenActor).toBe('string');

    const deniedUnlockRes = await request(app)
      .post('/v1/school/admin/security/unlock')
      .set('Authorization', 'Bearer operator-admin-01')
      .set('X-Admin-Role', 'admin')
      .set('X-Admin-Id', 'operator-admin-01')
      .send({ targetActorId: frozenActor });
    expect(deniedUnlockRes.status).toBe(403);
    expect(deniedUnlockRes.body.code).toBe('operator_consensus_required');

    await request(app)
      .get('/v1/school/admin/security/freeze-status')
      .set('Authorization', 'Bearer operator-master-01')
      .set('X-Admin-Role', 'master')
      .set('X-Admin-Id', 'operator-master-01');
    await request(app)
      .get('/v1/school/admin/security/freeze-status')
      .set('Authorization', 'Bearer operator-master-02')
      .set('X-Admin-Role', 'master')
      .set('X-Admin-Id', 'operator-master-02');

    const unlockProposalRes = await request(app)
      .post('/v1/school/admin/security/unlock')
      .set('Authorization', 'Bearer operator-master-01')
      .set('X-Admin-Role', 'master')
      .set('X-Admin-Id', 'operator-master-01')
      .send({ targetActorId: frozenActor });
    expect(unlockProposalRes.status).toBe(202);
    expect(unlockProposalRes.body.status).toBe('pending_consensus');
    const unlockProposalId = unlockProposalRes.body.consensus?.proposalId as string | undefined;
    expect(typeof unlockProposalId).toBe('string');

    const unlockRes = await request(app)
      .post('/v1/school/admin/security/unlock')
      .set('Authorization', 'Bearer operator-master-02')
      .set('X-Admin-Role', 'master')
      .set('X-Admin-Id', 'operator-master-02')
      .send({ targetActorId: frozenActor, proposalId: unlockProposalId });
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.success).toBe(true);

    const afterUnlockRes = await request(app)
      .post('/v1/school/events')
      .set('Authorization', actorToken)
      .send({
        title: 'event after manual unlock',
        datetime: '2026/03/03 10:00-11:00',
        host: 'Student Council',
      });
    expect(afterUnlockRes.status).toBe(201);

    const otherAdminRes = await request(app)
      .post('/v1/school/events')
      .set('Authorization', 'Bearer admin-not-frozen')
      .send({
        title: 'Normal Event',
        datetime: '2026/03/03 12:00-13:00',
        host: 'Student Council',
      });
    expect(otherAdminRes.status).toBe(201);
  });

  it('operators can read security audit and execution logs', async () => {
    const actorToken = 'Bearer admin-log-test';
    const suspiciousPayload = {
      title: 'bot log test event',
      datetime: '2026/03/05 10:00-11:00',
      host: 'script-team',
    };

    await request(app)
      .post('/v1/school/events')
      .set('Authorization', actorToken)
      .send(suspiciousPayload);
    await request(app)
      .post('/v1/school/events')
      .set('Authorization', actorToken)
      .set('X-Admin-Security-Override', 'continue')
      .send(suspiciousPayload);

    const logsRes = await request(app)
      .get('/v1/school/admin/security/logs?limit=20')
      .set('Authorization', 'Bearer operator-admin-02')
      .set('X-Admin-Role', 'admin')
      .set('X-Admin-Id', 'operator-admin-02');
    expect(logsRes.status).toBe(200);
    expect(Array.isArray(logsRes.body.items)).toBe(true);
    expect(logsRes.body.items.length).toBeGreaterThan(0);
    expect(logsRes.body.roleView).toBe('operator');

    const actions = logsRes.body.items.map((item: { action?: string }) => item.action);
    expect(actions).toContain('security_warning_detected');
    expect(actions).toContain('freeze_enforced');
  });

  it('revoke access creates required report obligation and blocks until restored', async () => {
    const targetHeaders = {
      Authorization: 'Bearer target-admin-token',
      'X-Admin-Id': 'target-admin-001',
    };
    const operatorMaster1Headers = {
      Authorization: 'Bearer operator-master-03',
      'X-Admin-Role': 'master',
      'X-Admin-Id': 'operator-master-03',
    };
    const operatorMaster2Headers = {
      Authorization: 'Bearer operator-master-04',
      'X-Admin-Role': 'master',
      'X-Admin-Id': 'operator-master-04',
    };

    await request(app).get('/v1/school/admin/security/freeze-status').set(operatorMaster1Headers);
    await request(app).get('/v1/school/admin/security/freeze-status').set(operatorMaster2Headers);

    const revokeProposalRes = await request(app)
      .post('/v1/school/admin/security/revoke-access')
      .set(operatorMaster1Headers)
      .send({
        targetActorId: 'admin:target-admin-001',
        reason: 'policy_violation',
      });
    expect(revokeProposalRes.status).toBe(202);
    expect(revokeProposalRes.body.status).toBe('pending_consensus');
    const revokeProposalId = revokeProposalRes.body.consensus?.proposalId as string | undefined;
    expect(typeof revokeProposalId).toBe('string');

    const revokeRes = await request(app)
      .post('/v1/school/admin/security/revoke-access')
      .set(operatorMaster2Headers)
      .send({
        targetActorId: 'admin:target-admin-001',
        proposalId: revokeProposalId,
      });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.success).toBe(true);
    expect(typeof revokeRes.body.reportId).toBe('string');

    const blockedRes = await request(app)
      .post('/v1/school/events')
      .set(targetHeaders)
      .send({
        title: 'revoked access should block',
        datetime: '2026/03/10 10:00-11:00',
        host: 'Student Council',
      });
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.code).toBe('access_revoked');

    const obligationsRes = await request(app)
      .get('/v1/school/admin/security/report-obligations?status=required')
      .set(operatorMaster1Headers);
    expect(obligationsRes.status).toBe(200);
    expect(Array.isArray(obligationsRes.body.items)).toBe(true);
    expect(obligationsRes.body.items.some((item: { type?: string; targetActorId?: string }) => (
      item.type === 'revoke_access' && item.targetActorId === 'admin:target-admin-001'
    ))).toBe(true);

    const restoreProposalRes = await request(app)
      .post('/v1/school/admin/security/restore-access')
      .set(operatorMaster1Headers)
      .send({ targetActorId: 'admin:target-admin-001' });
    expect(restoreProposalRes.status).toBe(202);
    expect(restoreProposalRes.body.status).toBe('pending_consensus');
    const restoreProposalId = restoreProposalRes.body.consensus?.proposalId as string | undefined;
    expect(typeof restoreProposalId).toBe('string');

    const restoreRes = await request(app)
      .post('/v1/school/admin/security/restore-access')
      .set(operatorMaster2Headers)
      .send({ targetActorId: 'admin:target-admin-001', proposalId: restoreProposalId });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);

    const afterRestoreRes = await request(app)
      .post('/v1/school/events')
      .set(targetHeaders)
      .send({
        title: 'restored access event',
        datetime: '2026/03/10 12:00-13:00',
        host: 'Student Council',
      });
    expect(afterRestoreRes.status).toBe(201);
  });

  it('operator revocation requires unanimous community approval excluding the target operator', async () => {
    const master1 = {
      Authorization: 'Bearer operator-master-07',
      'X-Admin-Role': 'master',
      'X-Admin-Id': 'operator-master-07',
    };
    const master2 = {
      Authorization: 'Bearer operator-master-08',
      'X-Admin-Role': 'master',
      'X-Admin-Id': 'operator-master-08',
    };
    const master3 = {
      Authorization: 'Bearer operator-master-09',
      'X-Admin-Role': 'master',
      'X-Admin-Id': 'operator-master-09',
    };

    await request(app).get('/v1/school/admin/security/freeze-status').set(master1);
    await request(app).get('/v1/school/admin/security/freeze-status').set(master2);
    await request(app).get('/v1/school/admin/security/freeze-status').set(master3);

    const revokeProposalRes = await request(app)
      .post('/v1/school/admin/security/operator/revoke')
      .set(master1)
      .send({
        targetOperatorActorId: 'admin:operator-master-09',
        reason: 'community_policy_violation',
      });
    expect(revokeProposalRes.status).toBe(202);
    expect(revokeProposalRes.body.status).toBe('pending_consensus');
    expect(revokeProposalRes.body.consensus?.requiredApproverIds).toEqual([
      'admin:operator-master-07',
      'admin:operator-master-08',
    ]);
    const proposalId = revokeProposalRes.body.consensus?.proposalId as string | undefined;
    expect(typeof proposalId).toBe('string');

    const revokeDoneRes = await request(app)
      .post('/v1/school/admin/security/operator/revoke')
      .set(master2)
      .send({
        targetOperatorActorId: 'admin:operator-master-09',
        proposalId,
      });
    expect(revokeDoneRes.status).toBe(200);
    expect(revokeDoneRes.body.success).toBe(true);

    const revokedOperatorAccessRes = await request(app)
      .get('/v1/school/admin/security/freeze-status')
      .set(master3);
    expect(revokedOperatorAccessRes.status).toBe(403);
    expect(revokedOperatorAccessRes.body.code).toBe('operator_revoked');
  });

  it('admin role cannot revoke operator or user accounts', async () => {
    const adminHeaders = {
      Authorization: 'Bearer operator-admin-07',
      'X-Admin-Role': 'admin',
      'X-Admin-Id': 'operator-admin-07',
    };

    const revokeOperatorRes = await request(app)
      .post('/v1/school/admin/security/operator/revoke')
      .set(adminHeaders)
      .send({
        targetOperatorActorId: 'admin:operator-master-99',
        reason: 'policy_violation',
      });
    expect(revokeOperatorRes.status).toBe(403);
    expect(revokeOperatorRes.body.code).toBe('operator_consensus_required');

    const deleteUserRes = await request(app)
      .post('/v1/school/admin/security/users/delete')
      .set(adminHeaders)
      .send({
        userId: 'target-user-01',
        reason: 'policy_violation',
      });
    expect(deleteUserRes.status).toBe(403);
    expect(deleteUserRes.body.code).toBe('operator_consensus_required');
  });

  it('operator community can freeze/delete users only with unanimous approvals', async () => {
    await request(app)
      .post('/api/users/register')
      .send({ userId: 'freeze_user_01', displayName: 'Freeze User', pin: '1234' });

    const master1 = {
      Authorization: 'Bearer operator-master-05',
      'X-Admin-Role': 'master',
      'X-Admin-Id': 'operator-master-05',
    };
    const master2 = {
      Authorization: 'Bearer operator-master-06',
      'X-Admin-Role': 'master',
      'X-Admin-Id': 'operator-master-06',
    };
    await request(app).get('/v1/school/admin/security/freeze-status').set(master1);
    await request(app).get('/v1/school/admin/security/freeze-status').set(master2);

    const freezeProposal = await request(app)
      .post('/v1/school/admin/security/users/freeze')
      .set(master1)
      .send({ userId: 'freeze_user_01', reason: 'risk_detected' });
    expect(freezeProposal.status).toBe(202);
    const freezeProposalId = freezeProposal.body.consensus?.proposalId as string | undefined;
    expect(typeof freezeProposalId).toBe('string');

    const freezeDone = await request(app)
      .post('/v1/school/admin/security/users/freeze')
      .set(master2)
      .send({ userId: 'freeze_user_01', proposalId: freezeProposalId });
    expect(freezeDone.status).toBe(200);
    expect(freezeDone.body.success).toBe(true);

    const verifyBlocked = await request(app)
      .post('/api/auth/verify')
      .send({ userId: 'freeze_user_01', pin: '1234' });
    expect(verifyBlocked.status).toBe(423);
    expect(verifyBlocked.body.code).toBe('user_frozen');

    const deleteProposal = await request(app)
      .post('/v1/school/admin/security/users/delete')
      .set(master1)
      .send({ userId: 'freeze_user_01', reason: 'severe_violation' });
    expect(deleteProposal.status).toBe(202);
    const deleteProposalId = deleteProposal.body.consensus?.proposalId as string | undefined;
    expect(typeof deleteProposalId).toBe('string');

    const deleteDone = await request(app)
      .post('/v1/school/admin/security/users/delete')
      .set(master2)
      .send({ userId: 'freeze_user_01', proposalId: deleteProposalId });
    expect(deleteDone.status).toBe(200);
    expect(deleteDone.body.success).toBe(true);

    const registerBlocked = await request(app)
      .post('/api/users/register')
      .send({ userId: 'freeze_user_01', displayName: 'Freeze User', pin: '1234' });
    expect(registerBlocked.status).toBe(403);
    expect(registerBlocked.body.code).toBe('user_deleted');
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
