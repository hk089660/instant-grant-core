/**
 * 管理者ロールの永続化（実運用: デバイスごとの選択を保持）
 * Web: localStorage / Native: AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Role } from '../types/ui';

const STORAGE_KEY = 'wene:admin_role';
const DEFAULT_ROLE: Role = 'operator';

let currentRole: Role = DEFAULT_ROLE;

async function getStorage(): Promise<{ getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> }> {
  try {
    return AsyncStorage;
  } catch {
    if (typeof localStorage !== 'undefined') {
      return {
        getItem: (k) => Promise.resolve(localStorage.getItem(k)),
        setItem: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
      };
    }
    throw new Error('No storage available');
  }
}

const VALID_ROLES: Role[] = ['viewer', 'operator', 'admin'];
function parseRole(value: string | null): Role {
  if (value && VALID_ROLES.includes(value as Role)) return value as Role;
  return DEFAULT_ROLE;
}

/**
 * ストレージからロールを読み込み、メモリに反映する。起動時に1回呼ぶ。
 */
export async function loadAdminRole(): Promise<Role> {
  try {
    const storage = await getStorage();
    const value = await storage.getItem(STORAGE_KEY);
    currentRole = parseRole(value);
    return currentRole;
  } catch {
    return currentRole;
  }
}

/** 現在のロール（同期）。loadAdminRole 後に有効。 */
export function getAdminRole(): Role {
  return currentRole;
}

/** ロールを保存しメモリに反映。永続化は非同期で実行。 */
export function setAdminRole(role: Role): void {
  currentRole = role;
  getStorage().then((storage) => storage.setItem(STORAGE_KEY, role)).catch(() => {});
}
