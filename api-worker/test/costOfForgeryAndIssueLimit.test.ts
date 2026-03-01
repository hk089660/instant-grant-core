import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchoolStore, type Env } from '../src/storeDO';

class MockStorage {
  private data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async list(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, unknown>> {
    const prefix = options?.prefix ?? '';
    let entries = Array.from(this.data.entries()).filter(([key]) => key.startsWith(prefix));
    entries.sort(([a], [b]) => a.localeCompare(b));
    if (options?.reverse) entries = entries.reverse();
    if (typeof options?.limit === 'number') entries = entries.slice(0, options.limit);
    return new Map(entries);
  }
}

class MockDurableObjectState {
  storage: MockStorage;
  id: { toString: () => string } = { toString: () => 'mock-id' };

  constructor() {
    this.storage = new MockStorage();
  }

  waitUntil(_promise: Promise<unknown>): void {
    // no-op
  }

  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> {
    return callback();
  }
}

describe('costOfForgery integration and admin issuance limits', () => {
  let state: MockDurableObjectState;

  beforeEach(() => {
    state = new MockDurableObjectState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('blocks user registration when costOfForgery denies', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'true',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
      COST_OF_FORGERY_MIN_SCORE: '70',
    };
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          allow: false,
          score: 12,
          reason: 'high_sybil_risk',
          decisionId: 'decision-001',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const store = new SchoolStore(state as any, env);
    const res = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.101',
        },
        body: JSON.stringify({
          userId: 'cost-of-forgery-user-01',
          displayName: 'Cost of Forgery User',
          pin: '1234',
        }),
      })
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      code?: string;
      reason?: string;
      remediation?: {
        requestEndpoint?: string;
        actions?: Array<{ type?: string }>;
      };
    };
    expect(body.code).toBe('cost_of_forgery_blocked');
    expect(body.reason).toContain('high_sybil_risk');
    expect(body.remediation?.requestEndpoint).toBe('/api/cost-of-forgery/remediation/request');
    expect(body.remediation?.actions?.some((action) => action.type === 'request_admin_review')).toBe(true);

    const users = await state.storage.list({ prefix: 'user:' });
    expect(users.size).toBe(0);
  });

  it('allows registration in fail-open mode when costOfForgery is unavailable', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'false',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
    };
    const fetchMock = vi.fn().mockRejectedValue(new Error('upstream timeout'));
    vi.stubGlobal('fetch', fetchMock);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    const store = new SchoolStore(state as any, env);
    const res = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.102',
        },
        body: JSON.stringify({
          userId: 'cost-of-forgery-user-02',
          displayName: 'Fail Open User',
          pin: '1234',
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId?: string };
    expect(body.userId).toBe('cost-of-forgery-user-02');
    consoleErrorSpy.mockRestore();
  });

  it('keeps register fail-open when register override is false even if global fail-closed is true', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED_REGISTER: 'false',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
    };
    const fetchMock = vi.fn().mockRejectedValue(new Error('upstream timeout'));
    vi.stubGlobal('fetch', fetchMock);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    const store = new SchoolStore(state as any, env);
    const res = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.103',
        },
        body: JSON.stringify({
          userId: 'cost-of-forgery-user-03',
          displayName: 'Register Fail Open',
          pin: '1234',
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId?: string };
    expect(body.userId).toBe('cost-of-forgery-user-03');
    consoleErrorSpy.mockRestore();
  });

  it('keeps claim fail-closed when claim override is true', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'false',
      COST_OF_FORGERY_FAIL_CLOSED_CLAIM: 'true',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
    };
    const fetchMock = vi.fn().mockRejectedValue(new Error('upstream timeout'));
    vi.stubGlobal('fetch', fetchMock);

    const store = new SchoolStore(state as any, env);
    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer master-secret',
        },
        body: JSON.stringify({
          title: 'Fail Closed Claim Event',
          datetime: '2026/03/01 09:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { id?: string };
    expect(typeof created.id).toBe('string');

    const claimRes = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.104',
        },
        body: JSON.stringify({
          eventId: created.id,
          walletAddress: '11111111111111111111111111111111',
        }),
      })
    );
    expect(claimRes.status).toBe(503);
    const claimBody = (await claimRes.json()) as {
      success?: boolean;
      error?: { code?: string };
    };
    expect(claimBody.success).toBe(false);
    expect(claimBody.error?.code).toBe('retryable');
  });

  it('uses stricter CoF threshold for public events than school_internal events', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'true',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
      COST_OF_FORGERY_MIN_SCORE_SCHOOL_INTERNAL: '70',
      COST_OF_FORGERY_MIN_SCORE_PUBLIC: '85',
      COST_OF_FORGERY_CACHE_TTL_SECONDS: '300',
    };
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          score: 75,
          reason: 'medium_risk',
          decisionId: 'decision-threshold-001',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = new SchoolStore(state as any, env);
    let nowMs = 1_700_100_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const createHeaders = {
      'content-type': 'application/json',
      Authorization: 'Bearer master-secret',
    };
    nowMs = 1_700_100_000_000;
    const internalEventRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({
          title: 'Internal Threshold Event',
          datetime: '2026/03/01 14:00',
          host: 'admin',
          riskProfile: 'school_internal',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(internalEventRes.status).toBe(201);
    const internalEvent = await internalEventRes.json() as { id?: string };
    expect(typeof internalEvent.id).toBe('string');

    nowMs = 1_700_100_001_000;
    const publicEventRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({
          title: 'Public Threshold Event',
          datetime: '2026/03/01 15:00',
          host: 'admin',
          riskProfile: 'public',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(publicEventRes.status).toBe(201);
    const publicEvent = await publicEventRes.json() as { id?: string };
    expect(typeof publicEvent.id).toBe('string');

    const wallet = '11111111111111111111111111111111';
    nowMs = 1_700_100_002_000;
    const internalClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.105',
        },
        body: JSON.stringify({
          eventId: internalEvent.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(internalClaim.status).toBe(200);

    nowMs = 1_700_100_003_000;
    const publicClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.105',
        },
        body: JSON.stringify({
          eventId: publicEvent.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(publicClaim.status).toBe(403);
    const publicClaimBody = await publicClaim.json() as {
      success?: boolean;
      error?: { code?: string };
    };
    expect(publicClaimBody.success).toBe(false);
    expect(publicClaimBody.error?.code).toBe('eligibility');

    nowMs = 1_700_100_004_000;
    const publicClaimAgain = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.105',
        },
        body: JSON.stringify({
          eventId: publicEvent.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(publicClaimAgain.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('allows wallet claim after remediation request is approved by admin', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'true',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
      COST_OF_FORGERY_MIN_SCORE: '90',
    };
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          score: 30,
          reason: 'low_confidence',
          decisionId: 'decision-remediation-001',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = new SchoolStore(state as any, env);

    const createRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer master-secret',
        },
        body: JSON.stringify({
          title: 'Remediation Event',
          datetime: '2026/03/01 16:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { id?: string };
    expect(typeof created.id).toBe('string');

    const wallet = '11111111111111111111111111111111';
    const blockedClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.130',
        },
        body: JSON.stringify({
          eventId: created.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(blockedClaim.status).toBe(403);
    const blockedBody = await blockedClaim.json() as {
      success?: boolean;
      error?: { code?: string };
      remediation?: { requestEndpoint?: string };
    };
    expect(blockedBody.success).toBe(false);
    expect(blockedBody.error?.code).toBe('eligibility');
    expect(blockedBody.remediation?.requestEndpoint).toBe('/api/cost-of-forgery/remediation/request');

    const remediationRequest = await store.fetch(
      new Request('https://example.com/api/cost-of-forgery/remediation/request', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.130',
        },
        body: JSON.stringify({
          action: 'wallet_claim',
          eventId: created.id,
          walletAddress: wallet,
          remediationAction: 'request_admin_review',
          evidenceType: 'admin_review',
          note: 'manual review request',
        }),
      })
    );
    expect(remediationRequest.status).toBe(202);
    const remediationRequestBody = await remediationRequest.json() as { requestId?: string; status?: string };
    expect(typeof remediationRequestBody.requestId).toBe('string');
    expect(remediationRequestBody.status).toBe('pending');

    const approveRes = await store.fetch(
      new Request(`https://example.com/api/admin/cost-of-forgery/remediation/${remediationRequestBody.requestId}/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer master-secret',
        },
        body: JSON.stringify({
          expiresInMinutes: 180,
          reason: 'verified attendee',
        }),
      })
    );
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json() as { status?: string };
    expect(approveBody.status).toBe('approved');

    const approvedClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.130',
        },
        body: JSON.stringify({
          eventId: created.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(approvedClaim.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches wallet risk decision by TTL and reuses it across events', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'true',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
      COST_OF_FORGERY_CACHE_TTL_SECONDS: '300',
    };
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          allow: true,
          score: 92,
          reason: 'ok',
          decisionId: 'decision-cache-001',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = new SchoolStore(state as any, env);
    let nowMs = 1_700_200_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const createHeaders = {
      'content-type': 'application/json',
      Authorization: 'Bearer master-secret',
    };
    nowMs = 1_700_200_000_000;
    const createFirst = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({
          title: 'Cache Event 1',
          datetime: '2026/03/01 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createFirst.status).toBe(201);
    const firstEvent = await createFirst.json() as { id?: string };
    expect(typeof firstEvent.id).toBe('string');

    nowMs = 1_700_200_001_000;
    const createSecond = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({
          title: 'Cache Event 2',
          datetime: '2026/03/01 11:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createSecond.status).toBe(201);
    const secondEvent = await createSecond.json() as { id?: string };
    expect(typeof secondEvent.id).toBe('string');

    const wallet = '11111111111111111111111111111111';
    nowMs = 1_700_200_002_000;
    const firstClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.120',
        },
        body: JSON.stringify({
          eventId: firstEvent.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(firstClaim.status).toBe(200);

    nowMs = 1_700_200_003_000;
    const secondClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.120',
        },
        body: JSON.stringify({
          eventId: secondEvent.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(secondClaim.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('expires wallet risk cache after TTL and calls upstream again', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      COST_OF_FORGERY_ENABLED: 'true',
      COST_OF_FORGERY_FAIL_CLOSED: 'true',
      COST_OF_FORGERY_BASE_URL: 'https://cost-of-forgery.example',
      COST_OF_FORGERY_VERIFY_PATH: '/v1/risk/score',
      COST_OF_FORGERY_CACHE_TTL_SECONDS: '1',
    };
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          allow: true,
          score: 88,
          reason: 'ok',
          decisionId: 'decision-cache-ttl',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = new SchoolStore(state as any, env);
    let nowMs = 1_700_300_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    const createHeaders = {
      'content-type': 'application/json',
      Authorization: 'Bearer master-secret',
    };
    nowMs = 1_700_300_000_000;
    const createFirst = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({
          title: 'TTL Event 1',
          datetime: '2026/03/01 12:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createFirst.status).toBe(201);
    const firstEvent = await createFirst.json() as { id?: string };
    expect(typeof firstEvent.id).toBe('string');
    nowMs = 1_700_300_001_000;
    const createSecond = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({
          title: 'TTL Event 2',
          datetime: '2026/03/01 13:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createSecond.status).toBe(201);
    const secondEvent = await createSecond.json() as { id?: string };
    expect(typeof secondEvent.id).toBe('string');

    const wallet = '11111111111111111111111111111111';
    nowMs = 1_700_300_002_000;
    const firstClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.121',
        },
        body: JSON.stringify({
          eventId: firstEvent.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(firstClaim.status).toBe(200);

    nowMs = 1_700_300_004_500;
    const secondClaim = await store.fetch(
      new Request('https://example.com/v1/school/claims', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '198.51.100.121',
        },
        body: JSON.stringify({
          eventId: secondEvent.id,
          walletAddress: wallet,
        }),
      })
    );
    expect(secondClaim.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('limits event issuance per admin per day', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      SECURITY_ADMIN_EVENT_ISSUE_LIMIT_PER_DAY: '1',
    };
    const store = new SchoolStore(state as any, env);
    const headers = {
      'content-type': 'application/json',
      Authorization: 'Bearer master-secret',
    };

    const first = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Issue Limit Event 1',
          datetime: '2026/03/01 10:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(first.status).toBe(201);

    const second = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Issue Limit Event 2',
          datetime: '2026/03/01 11:00',
          host: 'admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(second.status).toBe(429);
    const body = (await second.json()) as { code?: string };
    expect(body.code).toBe('event_issue_limit_exceeded');
  });

  it('limits admin invite issuance per day', async () => {
    const env: Env = {
      ADMIN_PASSWORD: 'master-secret',
      AUDIT_IMMUTABLE_MODE: 'off',
      SECURITY_ADMIN_INVITE_ISSUE_LIMIT_PER_DAY: '1',
    };
    const store = new SchoolStore(state as any, env);
    const headers = {
      'content-type': 'application/json',
      Authorization: 'Bearer master-secret',
    };

    const first = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Admin One' }),
      })
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { code?: string };
    expect(typeof firstBody.code).toBe('string');

    const second = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Admin Two' }),
      })
    );
    expect(second.status).toBe(429);
    const body = (await second.json()) as { code?: string };
    expect(body.code).toBe('admin_invite_issue_limit_exceeded');
  });
});
