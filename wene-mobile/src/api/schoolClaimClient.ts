/**
 * 学校参加券 API クライアント
 *
 * インターフェースを定義し、実装は差し替え可能。
 * EXPO_PUBLIC_SCHOOL_API_URL 設定時は API クライアント、未設定時は mock。
 */

import type { SchoolClaimResult, SchoolClaimErrorCode } from '../types/school';
import type { SchoolEvent } from '../types/school';
import { getStudentSession } from '../utils/studentSession';
import { getEventById } from './schoolEvents';

export interface SchoolClaimClient {
  /** token は QR/join URL 経由で渡る参加用署名トークン（任意。SERVER が REQUIRE 時は必須） */
  submit(eventId: string, token?: string): Promise<SchoolClaimResult>;
}

export interface SchoolEventProvider {
  getById(eventId: string): SchoolEvent | null;
  getAll(): SchoolEvent[];
}

/** API 実装を返すファクトリ（apiSubmitClaim で送信。studentId は getStudentSession から取得） */
export async function createApiSchoolClaimClient(): Promise<SchoolClaimClient | null> {
  const { getSchoolApiBaseUrl } = await import('../config/api');
  const { apiSubmitClaim } = await import('./adminApiClient');
  if (!getSchoolApiBaseUrl()) return null;
  return {
    async submit(eventId: string, token?: string): Promise<SchoolClaimResult> {
      const session = await getStudentSession();
      if (!session) {
        return {
          success: false,
          error: { code: 'invalid_input', message: 'ログインしてください' },
        };
      }
      const eventIdTrim = eventId.trim();
      try {
        const res = await apiSubmitClaim({
          eventId: eventIdTrim,
          studentId: session.studentId,
          source: 'scan',
          token: token ?? undefined,
        });
        if (res.ok) {
          const eventName = getEventById(eventIdTrim)?.title ?? '';
          return {
            success: true,
            eventName,
            alreadyJoined: res.created === false,
          };
        }
        const isExpired = res.error === 'expired_token';
        return {
          success: false,
          error: {
            code: (isExpired ? 'retryable' : res.error === 'invalid_request' ? 'invalid_input' : 'unknown') as SchoolClaimErrorCode,
            message: isExpired ? 'この参加用リンクは期限切れです。新しいQRでお試しください。' : (res.error ?? '参加に失敗しました'),
          },
        };
      } catch {
        return {
          success: false,
          error: { code: 'retryable', message: '参加に失敗しました。しばらくしてから再試行してください。' },
        };
      }
    },
  };
}
