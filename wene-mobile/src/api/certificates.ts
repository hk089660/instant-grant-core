/**
 * 証明書一覧 API
 * 実 API に差し替え可能（boundary）
 */

import type { Certificate } from '../types/certificate';
import { getMockCertificatesByStudentId } from '../data/certificatesMock';

/**
 * 生徒IDに紐づく証明書一覧を取得（PoC: モック）
 */
export async function getCertificatesByStudentId(studentId: string): Promise<Certificate[]> {
  return getMockCertificatesByStudentId(studentId);
}
