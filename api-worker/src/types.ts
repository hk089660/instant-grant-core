/**
 * 学校API 契約型（wene-mobile/src/types/school.ts と一致）
 */

export interface SchoolEvent {
  id: string;
  title: string;
  datetime: string;
  host: string;
  state?: 'draft' | 'published' | 'ended';
  /** 参加済み数（管理者用） */
  claimedCount?: number;
  solanaMint?: string;
  solanaAuthority?: string;
  solanaGrantId?: string;
  /** 参加完了時の配布量（表示・監査用） */
  ticketTokenAmount?: number;
  /**
   * 受給可能な期間（日）
   * 例: 30 => 30日ごとに回数制限を評価
   */
  claimIntervalDays?: number;
  /**
   * 期間内の最大受給回数
   * null の場合は無制限
   */
  maxClaimsPerInterval?: number | null;
}

export type SchoolClaimErrorCode =
  | 'invalid'
  | 'not_found'
  | 'eligibility'
  | 'retryable'
  | 'user_cancel'
  | 'wallet_required';

export interface SchoolClaimErrorInfo {
  code: SchoolClaimErrorCode;
  message: string;
}

export interface SchoolClaimResultSuccess {
  success: true;
  eventName: string;
  alreadyJoined?: boolean;
  txSignature?: string;
  receiptPubkey?: string;
  explorerTxUrl?: string;
  explorerReceiptUrl?: string;
}

export interface SchoolClaimResultFailure {
  success: false;
  error: SchoolClaimErrorInfo;
}

export type SchoolClaimResult = SchoolClaimResultSuccess | SchoolClaimResultFailure;

export interface ClaimBody {
  eventId?: string;
  walletAddress?: string;
  joinToken?: string;
  txSignature?: string;
  receiptPubkey?: string;
}

export interface PopProofBody {
  eventId?: string;
  grant?: string;
  claimer?: string;
  periodIndex?: string | number;
}

export interface PopProofResponse {
  signerPubkey: string;
  messageBase64: string;
  signatureBase64: string;
  auditHash: string;
  prevHash: string;
  streamPrevHash: string;
  entryHash: string;
  issuedAt: number;
}

/** POST /api/users/register */
export interface RegisterBody {
  displayName?: string;
  pin?: string;
}

/** POST /api/events/:eventId/claim (userId+pin flow) */
export interface UserClaimBody {
  userId?: string;
  pin?: string;
  walletAddress?: string;
  txSignature?: string;
  receiptPubkey?: string;
}

export interface UserClaimResponse {
  status: 'created' | 'already';
  confirmationCode: string;
}
