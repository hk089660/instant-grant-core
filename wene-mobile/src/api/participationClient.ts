/**
 * 参加記録 API クライアントのインターフェース
 * 実 API / Solana レイヤーに差し替え可能
 */

export interface ParticipationClient {
  record(params: { studentId: string; eventId: string }): Promise<{ ok: true }>;
}
