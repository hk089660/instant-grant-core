import AsyncStorage from '@react-native-async-storage/async-storage';

export const ADMIN_AUTH_STORAGE_KEY = 'admin_auth_session_v1';

export type AdminSessionRole = 'admin' | 'master';

export interface AdminAuthSession {
  token: string;
  role: AdminSessionRole;
  source?: 'password' | 'demo';
  createdAt: string;
}

function normalizeToken(token: unknown): string {
  return typeof token === 'string' ? token.trim() : '';
}

export async function saveAdminSession(session: AdminAuthSession): Promise<void> {
  await AsyncStorage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify(session));
}

export async function loadAdminSession(): Promise<AdminAuthSession | null> {
  try {
    const raw = await AsyncStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminAuthSession>;
    const token = normalizeToken(parsed.token);
    if (!token) return null;
    const role = parsed.role === 'master' ? 'master' : 'admin';
    return {
      token,
      role,
      source: parsed.source === 'demo' ? 'demo' : 'password',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getAdminToken(): Promise<string | null> {
  const session = await loadAdminSession();
  return session?.token ?? null;
}

export async function clearAdminSession(): Promise<void> {
  await AsyncStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
}

