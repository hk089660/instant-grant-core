/**
 * 学校向け参加券 API
 *
 * ウォレット不要で QR → eventId → 端末ID + eventId で重複参加防止。
 * EXPO_PUBLIC_SCHOOL_API_URL 設定時は API に送信、未設定時は mock クライアント。
 */

import type { SchoolClaimResult } from '../types/school';
import { createMockSchoolClaimClient } from './schoolClaimClient.mock';
import { createApiSchoolClaimClient } from './schoolClaimClient';
import { schoolEventProvider } from './schoolEvents';

/**
 * 学校参加券を送信
 *
 * @param eventId QR から取得したイベントID（parseEventId で検証済みを推奨）
 * @param token 参加用署名トークン（/u/join?token=... から渡す。サーバが REQUIRE 時は必須）
 * @returns 成功/失敗を統一形式で返す
 */
export async function submitSchoolClaim(eventId: string, token?: string): Promise<SchoolClaimResult> {
  try {
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return {
        success: false,
        error: { code: 'invalid_input', message: 'イベントIDが無効です' },
      };
    }
    const apiClient = await createApiSchoolClaimClient();
    const client = apiClient ?? createMockSchoolClaimClient(schoolEventProvider);
    return await client.submit(eventId.trim(), token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: { code: 'retryable', message: msg || '参加に失敗しました' },
    };
  }
}

export type { SchoolClaimResult } from '../types/school';
