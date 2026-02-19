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
});
