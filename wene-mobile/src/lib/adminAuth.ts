import AsyncStorage from '@react-native-async-storage/async-storage';

const ADMIN_AUTH_LEGACY_STORAGE_KEY = 'admin_auth_session_v1';
const ADMIN_AUTH_ACTIVE_SCOPE_KEY = 'admin_auth_active_scope_v2';
const ADMIN_AUTH_SCOPED_STORAGE_PREFIX = 'admin_auth_session_v2';

export type AdminSessionRole = 'admin' | 'master';

export interface AdminAuthSession {
  token: string;
  role: AdminSessionRole;
  source?: 'password' | 'demo';
  adminName?: string;
  adminId?: string;
  createdAt: string;
}

function normalizeToken(token: unknown): string {
  return typeof token === 'string' ? token.trim() : '';
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeRole(role: unknown): AdminSessionRole {
  return role === 'master' ? 'master' : 'admin';
}

function nonCryptoHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeScopePart(value: string): string {
  const out = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return out.replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
}

export function getAdminScopeId(session: AdminAuthSession): string {
  const role = normalizeRole(session.role);
  const adminId = normalizeOptionalText(session.adminId);
  if (adminId) {
    return `operator:${normalizeScopePart(adminId)}`;
  }
  if (role === 'master') {
    return 'operator:master';
  }
  if (session.source === 'demo') {
    return 'operator:demo-admin';
  }
  return `operator:admin-${nonCryptoHash(session.token)}`;
}

function getScopedStorageKey(scopeId: string): string {
  return `${ADMIN_AUTH_SCOPED_STORAGE_PREFIX}:${scopeId}`;
}

function parseSession(raw: string | null): AdminAuthSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AdminAuthSession>;
    const token = normalizeToken(parsed.token);
    if (!token) return null;
    const role = normalizeRole(parsed.role);
    return {
      token,
      role,
      source: parsed.source === 'demo' ? 'demo' : 'password',
      adminName: normalizeOptionalText(parsed.adminName),
      adminId: normalizeOptionalText(parsed.adminId),
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveAdminSession(session: AdminAuthSession): Promise<void> {
  const normalizedSession: AdminAuthSession = {
    token: normalizeToken(session.token),
    role: normalizeRole(session.role),
    source: session.source === 'demo' ? 'demo' : 'password',
    adminName: normalizeOptionalText(session.adminName),
    adminId: normalizeOptionalText(session.adminId),
    createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
  };
  if (!normalizedSession.token) {
    throw new Error('admin session token is required');
  }

  const scopeId = getAdminScopeId(normalizedSession);
  await AsyncStorage.setItem(getScopedStorageKey(scopeId), JSON.stringify(normalizedSession));
  await AsyncStorage.setItem(ADMIN_AUTH_ACTIVE_SCOPE_KEY, scopeId);
}

async function migrateLegacySessionIfNeeded(): Promise<AdminAuthSession | null> {
  const legacyRaw = await AsyncStorage.getItem(ADMIN_AUTH_LEGACY_STORAGE_KEY);
  const legacy = parseSession(legacyRaw);
  if (!legacy) {
    await AsyncStorage.removeItem(ADMIN_AUTH_LEGACY_STORAGE_KEY);
    return null;
  }
  await saveAdminSession(legacy);
  await AsyncStorage.removeItem(ADMIN_AUTH_LEGACY_STORAGE_KEY);
  return legacy;
}

export async function loadAdminSession(): Promise<AdminAuthSession | null> {
  const activeScope = normalizeOptionalText(await AsyncStorage.getItem(ADMIN_AUTH_ACTIVE_SCOPE_KEY));
  if (activeScope) {
    const scopedRaw = await AsyncStorage.getItem(getScopedStorageKey(activeScope));
    const scoped = parseSession(scopedRaw);
    if (scoped) return scoped;
    await AsyncStorage.removeItem(ADMIN_AUTH_ACTIVE_SCOPE_KEY);
  }
  return migrateLegacySessionIfNeeded();
}

export async function getAdminToken(): Promise<string | null> {
  const session = await loadAdminSession();
  return session?.token ?? null;
}

export async function clearAdminSession(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const targetKeys = keys.filter((key) => key.startsWith(`${ADMIN_AUTH_SCOPED_STORAGE_PREFIX}:`));
  if (targetKeys.length > 0) {
    await AsyncStorage.multiRemove(targetKeys);
  }
  await AsyncStorage.removeItem(ADMIN_AUTH_ACTIVE_SCOPE_KEY);
  await AsyncStorage.removeItem(ADMIN_AUTH_LEGACY_STORAGE_KEY);
}
