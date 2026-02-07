/**
 * 学校向け参加券の型定義
 * API・store・画面で共通利用
 */

export interface SchoolEvent {
  id: string;
  title: string;
  datetime: string;
  host: string;
}

/** エラー種別（ロジック側で判別） */
export type SchoolClaimErrorCode =
  | 'retryable'     // ネットワーク等、再試行可能
  | 'invalid_input' // eventId 不正
  | 'not_found'     // イベントが見つからない
  | 'unknown';      // その他

export interface SchoolClaimErrorInfo {
  code: SchoolClaimErrorCode;
  message: string;
}

export interface SchoolClaimResultSuccess {
  success: true;
  eventName: string;
  /** 既に参加済みで成功扱い（success 遷移と同等） */
  alreadyJoined?: boolean;
}

export interface SchoolClaimResultFailure {
  success: false;
  error: SchoolClaimErrorInfo;
}

export type SchoolClaimResult = SchoolClaimResultSuccess | SchoolClaimResultFailure;

export type { Certificate } from './certificate';
