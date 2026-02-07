/**
 * 参加記録の型（PoC 用・最小限）
 * 実 API では recordId 等はサーバー発行に差し替え可能
 */
export type ParticipationRecord = {
  recordId: string;
  studentId: string;
  eventId: string;
  recordedAt: string; // ISO
  source?: 'manual' | 'qr';
  /** UI/CSV 用。記録時スナップショットまたはレジストリから補完。学年は UI で 1..12 を想定。 */
  grade?: number;
  studentCodeMasked?: string;
  displayName?: string;
};
