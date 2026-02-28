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
  /** CoF 閾値プロファイル（学校内向け/公開イベント） */
  riskProfile?: 'school_internal' | 'public';
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

export type CostOfForgeryActionType = 'user_register' | 'user_claim' | 'wallet_claim';

export type CostOfForgeryRemediationActionType =
  | 'present_pop_receipt'
  | 'reissue_invite_code'
  | 'request_admin_review';

export interface CostOfForgeryRemediationAction {
  type: CostOfForgeryRemediationActionType;
  label: string;
  description: string;
  endpoint: string;
  method: 'POST';
}

export interface CostOfForgeryRemediationFlow {
  flowVersion: 1;
  flowId: string;
  status: 'required';
  action: CostOfForgeryActionType;
  requestEndpoint: '/api/cost-of-forgery/remediation/request';
  eventId?: string;
  minScore?: number;
  score?: number | null;
  reason?: string | null;
  decisionId?: string | null;
  actions: CostOfForgeryRemediationAction[];
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
  /** 参加券の確認コード（wallet不要導線の主キー） */
  confirmationCode?: string;
  /** 監査ログ不変レシート（第三者検証用） */
  ticketReceipt?: ParticipationTicketReceipt;
}

export interface ParticipationTicketReceipt {
  version: 1;
  type: 'participation_audit_receipt';
  receiptId: string;
  receiptHash: string;
  issuedAt: string;
  confirmationCode: string;
  subjectCommitment: string;
  verifyEndpoint: string;
  audit: {
    event: string;
    eventId: string;
    entryHash: string;
    prevHash: string;
    streamPrevHash: string;
    immutableMode: 'off' | 'best_effort' | 'required';
    immutablePayloadHash: string | null;
    immutableSinks: Array<{
      sink: 'r2_entry' | 'r2_stream' | 'kv_index' | 'immutable_ingest';
      ref: string;
      at: string;
    }>;
  };
}

export interface SchoolClaimResultFailure {
  success: false;
  error: SchoolClaimErrorInfo;
  remediation?: CostOfForgeryRemediationFlow;
}

export type SchoolClaimResult = SchoolClaimResultSuccess | SchoolClaimResultFailure;
