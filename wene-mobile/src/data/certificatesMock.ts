/**
 * 参加証（証明書）のモックデータと発行ロジック
 * PoC 用。発行済み証明書はストレージに永続化し、リロード後も表示する。
 * 実 API に差し替え可能。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Certificate } from '../types/certificate';

const STORAGE_KEY = 'wene:issued_certificates';

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

/** メモリキャッシュ（初回アクセスでストレージから復元） */
let _issuedCertificates: Certificate[] | null = null;

async function loadIssuedCertificates(): Promise<Certificate[]> {
  if (_issuedCertificates !== null) return _issuedCertificates;
  const raw = await storageGetItem(STORAGE_KEY);
  if (!raw) {
    _issuedCertificates = [];
    return _issuedCertificates;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    _issuedCertificates = Array.isArray(parsed)
      ? (parsed as Certificate[]).filter(
          (c) =>
            c &&
            typeof c.certificateId === 'string' &&
            typeof c.studentId === 'string' &&
            typeof c.eventId === 'string' &&
            typeof c.eventName === 'string' &&
            typeof c.issuedAt === 'string' &&
            typeof c.organizerName === 'string'
        )
      : [];
  } catch {
    _issuedCertificates = [];
  }
  return _issuedCertificates;
}

async function saveIssuedCertificates(): Promise<void> {
  if (_issuedCertificates === null) return;
  await storageSetItem(STORAGE_KEY, JSON.stringify(_issuedCertificates));
}

/** 参加により発行された証明書（永続化済み）。直接参照より getMockCertificatesByStudentId / issueMockCertificateForEvent を利用すること */
export async function getIssuedCertificates(): Promise<Certificate[]> {
  return loadIssuedCertificates();
}

/** 静的なモック証明書（初期表示用・任意） */
const certificatesMock: Certificate[] = [];

function sortCertificatesNewestFirst(list: Certificate[]): Certificate[] {
  return [...list].sort((a, b) => (b.issuedAt < a.issuedAt ? -1 : 1));
}

function createWelcomeCertificate(studentId: string): Certificate {
  return {
    certificateId: 'cert-welcome',
    studentId,
    eventId: 'welcome',
    eventName: 'we-ne へようこそ',
    category: 'other',
    issuedAt: new Date(0).toISOString(),
    organizerName: 'we-ne',
    note: 'アプリに登録いただきありがとうございます。',
  };
}

/**
 * イベント参加時に証明書を1件発行し、永続化に追加する（モック専用）
 */
export async function issueMockCertificateForEvent(
  studentId: string,
  event: {
    eventId: string;
    eventName: string;
    category?: string;
    organizerName?: string;
  }
): Promise<Certificate> {
  const list = await loadIssuedCertificates();
  const certificateId = `cert-${event.eventId}-${Date.now()}-${studentId.slice(0, 6)}`;
  const cert: Certificate = {
    certificateId,
    studentId,
    eventId: event.eventId,
    eventName: event.eventName,
    category: event.category,
    issuedAt: new Date().toISOString(),
    organizerName: event.organizerName ?? 'we-ne',
    note: '参加が記録されました',
  };
  list.push(cert);
  await saveIssuedCertificates();
  return cert;
}

/**
 * 生徒IDに紐づく証明書一覧を取得（静的モック + 発行済みをマージし、新しい順）
 */
export async function getMockCertificatesByStudentId(
  studentId: string
): Promise<Certificate[]> {
  const dynamic = await loadIssuedCertificates();
  const base = certificatesMock.filter((c) => c.studentId === studentId);
  const byStudent = dynamic.filter((c) => c.studentId === studentId);
  const combined = [...base, ...byStudent];
  if (combined.length === 0) {
    return [createWelcomeCertificate(studentId)];
  }
  return sortCertificatesNewestFirst(combined);
}
