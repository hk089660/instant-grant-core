/**
 * 生徒レジストリ（モック）
 * 管理画面での表示用。登録成功時（RegisterScreen 等）に setStudentSession の後に
 * upsertStudentRegistry({ studentId, grade, studentCodeMasked: maskStudentCode(code), displayName, registeredAt }) を呼ぶ想定。
 * 実装時はバックエンド DB に差し替え。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wene:student_registry';

export interface StudentRegistryEntry {
  studentId: string;
  /** 学年。UI で 1..12 の範囲で検証する。 */
  grade: number;
  studentCodeMasked: string;
  displayName: string;
  registeredAt: string; // ISO
}

async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  }
}

let _registry: Map<string, StudentRegistryEntry> | null = null;

async function loadRegistry(): Promise<Map<string, StudentRegistryEntry>> {
  if (_registry) return _registry;
  const raw = await getItem(STORAGE_KEY);
  if (!raw) {
    _registry = new Map();
    return _registry;
  }
  try {
    const arr = JSON.parse(raw) as unknown;
    _registry = new Map(
      (Array.isArray(arr) ? arr : []).filter(
        (e: unknown): e is StudentRegistryEntry =>
          e != null &&
          typeof (e as StudentRegistryEntry).studentId === 'string' &&
          typeof (e as StudentRegistryEntry).grade === 'number' &&
          typeof (e as StudentRegistryEntry).studentCodeMasked === 'string' &&
          typeof (e as StudentRegistryEntry).displayName === 'string' &&
          typeof (e as StudentRegistryEntry).registeredAt === 'string'
      ).map((e) => [e.studentId, e])
    );
  } catch {
    _registry = new Map();
  }
  return _registry;
}

async function saveRegistry(): Promise<void> {
  if (!_registry) return;
  const arr = Array.from(_registry.values());
  await setItem(STORAGE_KEY, JSON.stringify(arr));
}

export async function upsertStudentRegistry(entry: StudentRegistryEntry): Promise<void> {
  const reg = await loadRegistry();
  reg.set(entry.studentId, entry);
  await saveRegistry();
}

export async function getStudentRegistryById(
  studentId: string
): Promise<StudentRegistryEntry | null> {
  const reg = await loadRegistry();
  return reg.get(studentId) ?? null;
}

export async function listStudentRegistry(): Promise<StudentRegistryEntry[]> {
  const reg = await loadRegistry();
  return Array.from(reg.values());
}

export function maskStudentCode(code: string): string {
  if (!code || code.length < 4) return '****';
  return `***${code.slice(-4)}`;
}
