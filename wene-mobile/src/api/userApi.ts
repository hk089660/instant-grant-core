/**
 * 利用者登録・参加申込 API（userId + PIN フロー）
 * 同一 baseUrl（EXPO_PUBLIC_API_BASE_URL）を使用
 */

import { httpPost } from './http/httpClient';

export function getBaseUrl(): string {
  // Web: Pages Functions で /api/* を Worker に中継するため、同一オリジンを使う（CORS回避）
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  // Native: 環境変数で指定された Workers URL へ直接アクセス
  const base = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  return base;
}

export interface RegisterResponse {
  userId: string;
}

export interface UserClaimResponse {
  status: 'created' | 'already';
  confirmationCode: string;
}

export interface UserClaimOnchainProof {
  walletAddress?: string;
  txSignature?: string;
  receiptPubkey?: string;
}

export interface VerifyUserResponse {
  ok: true;
}

export async function registerUser(displayName: string, pin: string): Promise<RegisterResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/users/register`;
  return httpPost<RegisterResponse>(url, { displayName, pin });
}

export async function verifyUserPin(userId: string, pin: string): Promise<VerifyUserResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/auth/verify`;
  return httpPost<VerifyUserResponse>(url, { userId, pin });
}

export async function claimEventWithUser(
  eventId: string,
  userId: string,
  pin: string,
  proof?: UserClaimOnchainProof
): Promise<UserClaimResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/events/${encodeURIComponent(eventId)}/claim`;
  return httpPost<UserClaimResponse>(url, {
    userId,
    pin,
    walletAddress: proof?.walletAddress,
    txSignature: proof?.txSignature,
    receiptPubkey: proof?.receiptPubkey,
  });
}
