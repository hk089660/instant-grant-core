/**
 * 生徒セッションの唯一の実装（get/set/clear）
 * studentId は登録フロー（registerStudent 応答など）で setStudentSession に渡して永続化する。
 * device-id ベースの studentId は使わない。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'studentSession';
const LEGACY_STORAGE_KEY = 'wene:student_session';

export interface StudentSession {
  studentId: string;
}

/**
 * 永続化用のストレージ（AsyncStorage を利用。Web では RN の AsyncStorage が localStorage にフォールバックする想定）
 */
async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  }
}

function parseSession(raw: string): StudentSession | null {
  try {
    const data = JSON.parse(raw) as { studentId?: string };
    if (typeof data?.studentId === 'string' && data.studentId.length > 0) {
      return { studentId: data.studentId };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 現在の生徒セッションを取得する。
 * 登録済みで setStudentSession が呼ばれていれば { studentId } を返し、未登録なら null。
 * 旧キー "wene:student_session" が存在する場合は "studentSession" へ移行する。
 */
export async function getStudentSession(): Promise<StudentSession | null> {
  let raw = await getItem(STORAGE_KEY);
  if (!raw) {
    raw = await getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const session = parseSession(raw);
      if (session) {
        await setItem(STORAGE_KEY, raw);
        await removeItem(LEGACY_STORAGE_KEY);
        return session;
      }
    }
    return null;
  }
  return parseSession(raw);
}

/**
 * 生徒セッションを保存する（登録フローで registerStudent 応答の studentId を渡して呼ぶ）
 */
export async function setStudentSession(session: StudentSession): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify({ studentId: session.studentId }));
}

/**
 * 生徒セッションをクリアする（ログアウト時など）
 * 新キー・旧キー両方を削除し、AsyncStorage と localStorage のどちらに残っていても消えるようにする。
 */
export async function clearStudentSession(): Promise<void> {
  await removeItem(STORAGE_KEY);
  await removeItem(LEGACY_STORAGE_KEY);
}
