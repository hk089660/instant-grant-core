/**
 * Grant 型定義
 * API・画面表示で共通利用
 */
export interface Grant {
  campaignId: string; // Campaign ID
  title: string;
  description: string;
  issuerName?: string;
  logoUrl?: string; // e.g. "https://..."
  solanaMint?: string;
  solanaAuthority?: string;
  solanaGrantId?: string;
  ticketTokenAmount?: number;
  /** 期限（JST固定）。YYYY-MM-DD 形式。23:59表示に利用 */
  goalDeadlineJst?: string;
  /** 残り日数（表示用）。goalDeadline から算出可 */
  timerDays?: number;
  /** 残り時間（表示用）。goalDeadline から算出可 */
  timerHours?: number;
  /** 残高（表示用。ダミー可） */
  balance?: number;
  /** 利用先（抽象）。使用画面で表示 */
  usageHint?: string;
}
