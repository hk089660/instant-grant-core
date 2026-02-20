/**
 * 学校向け参加券の型定義
 * API・store・画面で共通利用
 */

export interface SchoolEvent {
  id: string;
  title: string;
  datetime: string;
  host: string;
  state?: 'draft' | 'published' | 'ended';
  /** 参加済み数（管理者用・API が返す） */
  claimedCount?: number;
  solanaMint?: string;
  solanaAuthority?: string;
  solanaGrantId?: string;
  /** 参加完了時に配布するSPLトークン量（最小単位） */
  ticketTokenAmount?: number;
  /** 受給可能な期間（日） */
  claimIntervalDays?: number;
  /** 期間内の最大受給回数（null = 無制限） */
  maxClaimsPerInterval?: number | null;
}

/** エラー種別（HTTP契約・UI分岐は code のみで行う） */
export type SchoolClaimErrorCode =
  | 'invalid'           // eventId 不正
  | 'not_found'        // イベントが見つからない
  | 'eligibility'      // 参加資格なし（event.state が published 以外等）
  | 'retryable'        // ネットワーク等、再試行可能
  | 'user_cancel'      // Phantom署名キャンセル
  | 'wallet_required'; // Phantom接続が必要（Phantom誘導ボタン用）

export interface SchoolClaimErrorInfo {
  code: SchoolClaimErrorCode;
  message: string;
}

export interface SchoolClaimResultSuccess {
  success: true;
  eventName: string;
  /** 既に参加済みで成功扱い（success 遷移と同等） */
  alreadyJoined?: boolean;
  /** トランザクション署名（成功時） */
  txSignature?: string;
  /** Receipt の Pubkey（成功時） */
  receiptPubkey?: string;
  /** Explorer のトランザクションURL（devnet） */
  explorerTxUrl?: string;
  /** Explorer の Receipt URL（devnet） */
  explorerReceiptUrl?: string;
}

export interface SchoolClaimResultFailure {
  success: false;
  error: SchoolClaimErrorInfo;
}

export type SchoolClaimResult = SchoolClaimResultSuccess | SchoolClaimResultFailure;
