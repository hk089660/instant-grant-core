import { beforeEach, describe, expect, it } from 'vitest';
import { SchoolStore, type Env } from '../src/storeDO';

class MockStorage {
  private data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
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

describe('master admin disclosure APIs', () => {
  let state: MockDurableObjectState;
  let store: SchoolStore;
  const masterToken = 'master-secret';

  beforeEach(() => {
    state = new MockDurableObjectState();
    const env: Env = {
      ADMIN_PASSWORD: masterToken,
      AUDIT_IMMUTABLE_MODE: 'off',
      ENFORCE_ONCHAIN_POP: 'false',
    };
    // @ts-expect-error mock for DurableObjectState
    store = new SchoolStore(state, env);
  });

  it('returns issued admin disclosure with related users and events', async () => {
    const inviteRes = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ name: 'Admin A' }),
      })
    );
    expect(inviteRes.status).toBe(200);
    const inviteBody = (await inviteRes.json()) as { code?: string; adminId?: string };
    expect(typeof inviteBody.code).toBe('string');
    expect(typeof inviteBody.adminId).toBe('string');
    const adminCode = inviteBody.code as string;

    const createEventRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${adminCode}`,
        },
        body: JSON.stringify({
          title: 'admin-a-event',
          datetime: '2026/02/22 10:00',
          host: 'Admin A',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createEventRes.status).toBe(201);
    const created = (await createEventRes.json()) as { id?: string };
    expect(typeof created.id).toBe('string');
    const eventId = created.id as string;

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'User A', pin: '1234' }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registerBody = (await registerRes.json()) as { userId?: string };
    expect(typeof registerBody.userId).toBe('string');
    const userId = registerBody.userId as string;

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
        }),
      })
    );
    expect(claimRes.status).toBe(200);

    const disclosureRes = await store.fetch(
      new Request('https://example.com/api/master/admin-disclosures?includeRevoked=1&transferLimit=500', {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(disclosureRes.status).toBe(200);
    const disclosure = (await disclosureRes.json()) as {
      strictLevel?: string;
      admins?: Array<{
        adminId: string;
        code: string;
        name: string;
        status: string;
        events: Array<{ id: string }>;
        relatedUsers: Array<{ userId: string | null; displayName: string | null }>;
      }>;
    };
    expect(disclosure.strictLevel).toBe('master_full');
    const admin = disclosure.admins?.find((item) => item.code === adminCode);
    expect(admin).toBeTruthy();
    expect(admin?.name).toBe('Admin A');
    expect(admin?.status).toBe('active');
    expect(admin?.events.some((ev) => ev.id === eventId)).toBe(true);
    expect(admin?.relatedUsers.some((u) => u.userId === userId && u.displayName === 'User A')).toBe(true);
  });

  it('renames admin by code/adminId and reflects in invite/disclosure', async () => {
    const inviteRes = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ name: 'Before Rename' }),
      })
    );
    expect(inviteRes.status).toBe(200);
    const inviteBody = (await inviteRes.json()) as { code?: string; adminId?: string };
    const adminCode = inviteBody.code as string;
    const adminId = inviteBody.adminId as string;

    const renameByCodeRes = await store.fetch(
      new Request('https://example.com/api/admin/rename', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ code: adminCode, name: 'Renamed Admin' }),
      })
    );
    expect(renameByCodeRes.status).toBe(200);

    const renameByAdminIdRes = await store.fetch(
      new Request('https://example.com/api/admin/rename', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ adminId, name: 'Renamed Again' }),
      })
    );
    expect(renameByAdminIdRes.status).toBe(200);

    const invitesRes = await store.fetch(
      new Request('https://example.com/api/admin/invites?includeRevoked=1', {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(invitesRes.status).toBe(200);
    const invitesBody = (await invitesRes.json()) as {
      invites?: Array<{ code: string; adminId: string; name: string }>;
    };
    const inviteRow = invitesBody.invites?.find((item) => item.code === adminCode);
    expect(inviteRow?.adminId).toBe(adminId);
    expect(inviteRow?.name).toBe('Renamed Again');

    const disclosureRes = await store.fetch(
      new Request('https://example.com/api/master/admin-disclosures?includeRevoked=1', {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(disclosureRes.status).toBe(200);
    const disclosureBody = (await disclosureRes.json()) as {
      admins?: Array<{ code: string; name: string }>;
    };
    const disclosureRow = disclosureBody.admins?.find((item) => item.code === adminCode);
    expect(disclosureRow?.name).toBe('Renamed Again');
  });

  it('searches disclosure entities via server-side master search API', async () => {
    const inviteRes = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ name: 'Search Admin' }),
      })
    );
    expect(inviteRes.status).toBe(200);
    const inviteBody = (await inviteRes.json()) as { code?: string };
    const adminCode = inviteBody.code as string;

    const createEventRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${adminCode}`,
        },
        body: JSON.stringify({
          title: 'Search Event',
          datetime: '2026/02/22 10:00',
          host: 'Search Admin',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createEventRes.status).toBe(201);
    const created = (await createEventRes.json()) as { id?: string };
    const eventId = created.id as string;

    const registerRes = await store.fetch(
      new Request('https://example.com/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Search User', pin: '1234' }),
      })
    );
    expect(registerRes.status).toBe(200);
    const registerBody = (await registerRes.json()) as { userId?: string };
    const userId = registerBody.userId as string;

    const claimRes = await store.fetch(
      new Request(`https://example.com/api/events/${encodeURIComponent(eventId)}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          pin: '1234',
        }),
      })
    );
    expect(claimRes.status).toBe(200);

    const searchRes = await store.fetch(
      new Request(`https://example.com/api/master/search?q=${encodeURIComponent(userId)}&limit=50`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as {
      strictLevel?: string;
      total?: number;
      items?: Array<{ kind: string; title: string; subtitle: string }>;
    };
    expect(searchBody.strictLevel).toBe('master_full');
    expect((searchBody.total ?? 0) > 0).toBe(true);
    expect(searchBody.items?.some((item) => item.kind === 'user')).toBe(true);
    expect(searchBody.items?.some((item) => item.kind === 'claim')).toBe(true);
  });

  it('keeps revoked admin records but blocks usage and can filter revoked entries', async () => {
    const inviteRes = await store.fetch(
      new Request('https://example.com/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ name: 'Admin B' }),
      })
    );
    expect(inviteRes.status).toBe(200);
    const inviteBody = (await inviteRes.json()) as { code?: string };
    const adminCode = inviteBody.code as string;

    const revokeRes = await store.fetch(
      new Request('https://example.com/api/admin/revoke', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ code: adminCode }),
      })
    );
    expect(revokeRes.status).toBe(200);
    const revokeBody = (await revokeRes.json()) as { success?: boolean; revokedAt?: string };
    expect(revokeBody.success).toBe(true);
    expect(typeof revokeBody.revokedAt).toBe('string');

    const loginRes = await store.fetch(
      new Request('https://example.com/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: adminCode }),
      })
    );
    expect(loginRes.status).toBe(401);

    const createEventRes = await store.fetch(
      new Request('https://example.com/v1/school/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${adminCode}`,
        },
        body: JSON.stringify({
          title: 'blocked event',
          datetime: '2026/02/22 11:00',
          host: 'Admin B',
          ticketTokenAmount: 1,
        }),
      })
    );
    expect(createEventRes.status).toBe(401);

    const listNoRevokedRes = await store.fetch(
      new Request('https://example.com/api/master/admin-disclosures?includeRevoked=0', {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(listNoRevokedRes.status).toBe(200);
    const noRevoked = (await listNoRevokedRes.json()) as { admins?: Array<{ code: string }> };
    expect(noRevoked.admins?.some((a) => a.code === adminCode)).toBe(false);

    const listAllRes = await store.fetch(
      new Request('https://example.com/api/master/admin-disclosures?includeRevoked=1', {
        method: 'GET',
        headers: { Authorization: `Bearer ${masterToken}` },
      })
    );
    expect(listAllRes.status).toBe(200);
    const withRevoked = (await listAllRes.json()) as { admins?: Array<{ code: string; status: string; revokedAt: string | null }> };
    const revoked = withRevoked.admins?.find((a) => a.code === adminCode);
    expect(revoked?.status).toBe('revoked');
    expect(typeof revoked?.revokedAt).toBe('string');
  });
});
