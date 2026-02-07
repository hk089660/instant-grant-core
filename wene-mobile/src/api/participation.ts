/**
 * 参加記録 API
 * recordParticipation は実 API / 記録レイヤーに差し替え可能（boundary）
 */

import { createMockParticipationClient } from './participationClient.mock';

const client = createMockParticipationClient();

/**
 * 参加を記録する（PoC: モックで証明書発行まで実施）
 */
export async function recordParticipation(
  studentId: string,
  eventId: string
): Promise<{ ok: true }> {
  return client.record({ studentId, eventId });
}
