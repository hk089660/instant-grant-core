/**
 * 参加記録のモック永続化
 * リロード後も保持。実 API に差し替え可能。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParticipationRecord } from '../types/participation';

const STORAGE_KEY = 'wene:participation_records';

let loaded = false;
let participationRecords: ParticipationRecord[] = [];

async function storageGetItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    return null;
  }
}

async function storageSetItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  }
}

export async function loadParticipationRecords(): Promise<void> {
  if (loaded) return;
  const raw = await storageGetItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      participationRecords = Array.isArray(parsed)
        ? (parsed as ParticipationRecord[]).filter(
            (r) =>
              r &&
              typeof r.recordId === 'string' &&
              typeof r.studentId === 'string' &&
              typeof r.eventId === 'string' &&
              typeof r.recordedAt === 'string'
          )
        : [];
    } catch {
      participationRecords = [];
    }
  } else {
    participationRecords = [];
  }
  loaded = true;
}

async function saveParticipationRecords(): Promise<void> {
  await storageSetItem(STORAGE_KEY, JSON.stringify(participationRecords));
}

export async function addParticipationRecord(params: {
  studentId: string;
  eventId: string;
  source?: 'manual' | 'qr';
  grade?: number;
  displayName?: string;
  studentCodeMasked?: string;
}): Promise<ParticipationRecord> {
  await loadParticipationRecords();
  const record: ParticipationRecord = {
    recordId: `rec-${params.eventId}-${Date.now()}-${params.studentId.slice(0, 6)}`,
    studentId: params.studentId,
    eventId: params.eventId,
    recordedAt: new Date().toISOString(),
    source: params.source ?? 'manual',
    grade: params.grade,
    displayName: params.displayName,
    studentCodeMasked: params.studentCodeMasked,
  };
  participationRecords.push(record);
  await saveParticipationRecords();
  return record;
}

/** 新しい順 */
export async function listParticipationRecords(): Promise<ParticipationRecord[]> {
  await loadParticipationRecords();
  return [...participationRecords].sort(
    (a, b) => (new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
  );
}

export async function listParticipationRecordsByEvent(
  eventId: string
): Promise<ParticipationRecord[]> {
  await loadParticipationRecords();
  return participationRecords
    .filter((r) => r.eventId === eventId)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
}

/** 開発用: 全件クリア */
export async function clearParticipationRecords(): Promise<void> {
  participationRecords = [];
  loaded = true;
  await saveParticipationRecords();
}
