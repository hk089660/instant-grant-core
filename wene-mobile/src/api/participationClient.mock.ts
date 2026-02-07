/**
 * 参加記録 API クライアント - Mock 実装
 * イベントメタは adminMock / schoolEvents から取得し、証明書を1件発行する。
 */

import type { ParticipationClient } from './participationClient';
import { getEventById } from './schoolEvents';
import { addParticipationRecord } from '../data/participationMock';
import { getStudentRegistryById } from '../data/studentRegistryMock';
import { issueMockCertificateForEvent } from '../data/certificatesMock';

const eventCategoryByEventId: Record<string, string> = {
  'evt-001': 'volunteer',
  'evt-002': 'school',
  'evt-003': 'school',
};

export function createMockParticipationClient(): ParticipationClient {
  return {
    async record(params: { studentId: string; eventId: string }): Promise<{ ok: true }> {
      const event = getEventById(params.eventId);
      const eventMeta = event
        ? {
            eventId: event.id,
            eventName: event.title,
            category: eventCategoryByEventId[event.id] ?? 'other',
            organizerName: event.host,
          }
        : {
            eventId: params.eventId,
            eventName: params.eventId,
            category: 'other' as const,
            organizerName: 'we-ne',
          };
      const student = await getStudentRegistryById(params.studentId);
      await addParticipationRecord({
        studentId: params.studentId,
        eventId: params.eventId,
        source: 'manual',
        grade: student?.grade,
        displayName: student?.displayName,
        studentCodeMasked: student?.studentCodeMasked,
      });
      await issueMockCertificateForEvent(params.studentId, eventMeta);
      return { ok: true };
    },
  };
}
