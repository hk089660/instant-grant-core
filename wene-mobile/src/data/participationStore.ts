import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParticipationState } from '../types/ui';

export interface ParticipationRecord {
  eventId: string;
  state: Extract<ParticipationState, 'started' | 'completed'>;
  startedAt: number;
  completedAt?: number;
}

const STORAGE_KEY_PREFIX = 'wene:participations:v2';

function normalizeUserScope(userId?: string | null): string {
  const normalized = typeof userId === 'string' ? userId.trim().toLowerCase() : '';
  return normalized || 'guest';
}

function getStorageKey(userId?: string | null): string {
  return `${STORAGE_KEY_PREFIX}:${normalizeUserScope(userId)}`;
}

const loadRecords = async (userId?: string | null): Promise<ParticipationRecord[]> => {
  const value = await AsyncStorage.getItem(getStorageKey(userId));
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as ParticipationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveRecords = async (records: ParticipationRecord[], userId?: string | null): Promise<void> => {
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(records));
};

export const getParticipations = async (userId?: string | null): Promise<ParticipationRecord[]> => {
  return loadRecords(userId);
};

export const setStarted = async (eventId: string, userId?: string | null): Promise<void> => {
  const records = await loadRecords(userId);
  const existing = records.find((record) => record.eventId === eventId);
  if (existing) {
    if (existing.state === 'completed') return;
    await saveRecords(records, userId);
    return;
  }
  const now = Date.now();
  records.push({ eventId, state: 'started', startedAt: now });
  await saveRecords(records, userId);
};

export const setCompleted = async (eventId: string, userId?: string | null): Promise<void> => {
  const records = await loadRecords(userId);
  const existing = records.find((record) => record.eventId === eventId);
  const now = Date.now();
  if (existing) {
    existing.state = 'completed';
    existing.completedAt = now;
    if (!existing.startedAt) {
      existing.startedAt = now;
    }
    await saveRecords(records, userId);
    return;
  }
  records.push({ eventId, state: 'completed', startedAt: now, completedAt: now });
  await saveRecords(records, userId);
};

export const clearParticipations = async (userId?: string | null): Promise<void> => {
  await AsyncStorage.removeItem(getStorageKey(userId));
};
