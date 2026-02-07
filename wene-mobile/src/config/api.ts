/**
 * API ベースURL（実運用時は .env で EXPO_PUBLIC_SCHOOL_API_URL を設定）
 * 未設定・不正な値の場合は null（ローカルストア・モックを使用）
 */

/**
 * ベースURLを正規化する。
 * - 前後空白を trim
 * - 空なら null
 * - 末尾スラッシュをすべて除去
 * - http:// または https:// で始まらない場合は null（スキーム必須）
 */
export function normalizeBaseUrl(raw: string | undefined): string | null {
  if (raw == null) return null;
  let s = typeof raw === 'string' ? raw.trim() : '';
  if (s.length === 0) return null;
  while (s.endsWith('/')) {
    s = s.slice(0, -1);
  }
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    return null;
  }
  return s;
}

export function getSchoolApiBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_SCHOOL_API_URL;
  return normalizeBaseUrl(url);
}

export function isSchoolApiEnabled(): boolean {
  return getSchoolApiBaseUrl() != null;
}
