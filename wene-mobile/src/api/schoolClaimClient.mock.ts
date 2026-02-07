/**
 * 学校参加券 API クライアント - Mock 実装
 *
 * ケース:
 * - evt-001: 成功
 * - evt-002: 既参加 (alreadyJoined)
 * - evt-003: リトライ可能エラー (retryable)
 * - その他: 通常の成功/既参加判定
 *
 * 同一端末での二回目以降の「再ログイン」: isJoined(eventId) のとき
 * success + alreadyJoined を返し、onSuccess で完了画面へ遷移させる（そのまま通す）。
 */

import type { SchoolClaimClient } from './schoolClaimClient';
import type { SchoolClaimResult } from '../types/school';
import type { SchoolEventProvider } from './schoolClaimClient';
import { useRecipientTicketStore } from '../store/recipientTicketStore';
import { addSharedParticipation } from '../data/adminMock';

let _deviceId: string | null = null;

async function getDeviceId(storage: { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> }): Promise<string> {
  if (_deviceId) return _deviceId;
  const key = 'wene:device_id';
  let value = await storage.getItem(key);
  if (!value) {
    value = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    await storage.setItem(key, value);
  }
  _deviceId = value;
  return value;
}

/** addTicket / setCompleted は呼び出し元（JoinScreen 等）で行う。mock は addSharedParticipation のみ（API 無効時の管理者ログ用）。 */
export function createMockSchoolClaimClient(eventProvider: SchoolEventProvider): SchoolClaimClient {
  return {
    async submit(eventId: string, _token?: string): Promise<SchoolClaimResult> {
      const event = eventProvider.getById(eventId);
      if (!event) {
        return {
          success: false,
          error: { code: 'not_found', message: 'イベントが見つかりません' },
        };
      }

      // evt-003: リトライ可能エラー（ネットワーク想定）
      if (eventId === 'evt-003') {
        return {
          success: false,
          error: {
            code: 'retryable',
            message: '接続できませんでした。しばらくしてから再試行してください。',
          },
        };
      }

      // evt-002: 既参加扱い（store 状態に依らず）
      if (eventId === 'evt-002') {
        return {
          success: true,
          eventName: event.title,
          alreadyJoined: true,
        };
      }

      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await getDeviceId(AsyncStorage);

      const { isJoined } = useRecipientTicketStore.getState();
      if (isJoined(eventId)) {
        return { success: true, eventName: event.title, alreadyJoined: true };
      }

      addSharedParticipation({ eventId, eventName: event.title });

      return { success: true, eventName: event.title };
    },
  };
}
