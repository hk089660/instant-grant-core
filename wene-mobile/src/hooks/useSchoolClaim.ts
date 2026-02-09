/**
 * 学校参加券クレームロジック
 *
 * UI から分離し、テスト・再利用を容易にする。
 * already は success と同等に扱い、onSuccess で success 画面へ遷移する。
 */

import { useState, useCallback } from 'react';
import { submitSchoolClaim } from '../api/schoolClaim';
import { getEventById } from '../api/schoolEvents';
import { useRecipientTicketStore } from '../store/recipientTicketStore';
import type { SchoolEvent } from '../types/school';
import type { SchoolClaimErrorInfo, SchoolClaimResultSuccess } from '../types/school';

export type SchoolClaimStatus = 'idle' | 'loading' | 'success' | 'already' | 'error';

export interface UseSchoolClaimOptions {
  onSuccess?: (result: SchoolClaimResultSuccess) => void;
}

export interface UseSchoolClaimResult {
  status: SchoolClaimStatus;
  /** エラー時のみ。表示用 message + ロジック用 code */
  errorInfo: SchoolClaimErrorInfo | null;
  /** UI 表示用（後方互換）。errorInfo?.message */
  error: string | null;
  /** リトライ可能か（retryable エラー時 true） */
  isRetryable: boolean;
  event: SchoolEvent | null;
  isJoined: boolean;
  handleClaim: () => Promise<void>;
  reset: () => void;
}

export function useSchoolClaim(
  eventId: string | undefined,
  options?: UseSchoolClaimOptions
): UseSchoolClaimResult {
  const [status, setStatus] = useState<SchoolClaimStatus>('idle');
  const [errorInfo, setErrorInfo] = useState<SchoolClaimErrorInfo | null>(null);
  const { isJoined } = useRecipientTicketStore();
  const onSuccess = options?.onSuccess;

  const event = eventId ? getEventById(eventId) : null;

  const handleClaim = useCallback(async () => {
    if (!eventId || !event) return;
    setStatus('loading');
    setErrorInfo(null);

    const result = await submitSchoolClaim(eventId);

    if (result.success) {
      if (result.alreadyJoined) {
        setStatus('already');
      } else {
        setStatus('success');
      }
      // alreadyJoined の場合も success 遷移に通す
      onSuccess?.(result);
    } else {
      setStatus('error');
      setErrorInfo(result.error);
    }
  }, [eventId, event, onSuccess]);

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorInfo(null);
  }, []);

  return {
    status,
    errorInfo,
    error: errorInfo?.message ?? null,
    isRetryable: errorInfo?.code === 'retryable',
    event,
    isJoined: eventId ? isJoined(eventId) : false,
    handleClaim,
    reset,
  };
}
