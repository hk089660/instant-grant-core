/**
 * 参加証（証明書）の型定義
 * 唯一の定義元。他では re-export のみ利用すること。
 */

export interface Certificate {
  certificateId: string;
  studentId: string;
  eventId: string;
  eventName: string;
  category?: string;
  issuedAt: string; // ISO
  organizerName: string;
  note?: string;
}
