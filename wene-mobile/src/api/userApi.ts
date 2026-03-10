/**
 * 利用者登録・参加申込 API（userId + PIN フロー）
 * 同一 baseUrl（EXPO_PUBLIC_SCHOOL_API_BASE_URL 優先、互換で EXPO_PUBLIC_API_BASE_URL）を使用
 */

import { httpPost } from './http/httpClient';
import type { ParticipationTicketReceipt } from '../types/school';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';

export function getBaseUrl(): string {
  return resolveApiBaseUrl();
}

export interface RegisterResponse {
  userId: string;
}

export interface UserClaimResponse {
  status: 'created' | 'already';
  confirmationCode: string;
  ticketReceipt?: ParticipationTicketReceipt;
  txSignature?: string;
  receiptPubkey?: string;
  explorerTxUrl?: string;
}

export interface UserClaimOnchainProof {
  walletAddress?: string;
  confirmationCode?: string;
  txSignature?: string;
  receiptPubkey?: string;
}

export interface VerifyUserResponse {
  ok: true;
}

export interface UserTicketSyncItem {
  eventId: string;
  eventName: string;
  claimedAt: number;
  confirmationCode?: string;
  auditReceiptId?: string;
  auditReceiptHash?: string;
  txSignature?: string;
  receiptPubkey?: string;
  mint?: string;
}

export interface UserTicketSyncResponse {
  syncedAt: string;
  tickets: UserTicketSyncItem[];
}

export interface VerifyTicketReceiptByCodeResponse {
  ok: boolean;
  checkedAt?: string;
  eventId?: string;
  confirmationCode?: string;
  receipt?: ParticipationTicketReceipt;
  verification?: {
    ok: boolean;
    checkedAt?: string;
    errors?: Array<{
      code?: string;
      message?: string;
      field?: string;
    }>;
  };
}

export async function registerUser(
  userId: string,
  displayName: string,
  pin: string,
  costOfForgeryToken?: string
): Promise<RegisterResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/users/register`;
  return httpPost<RegisterResponse>(url, { userId, displayName, pin, costOfForgeryToken });
}

export async function verifyUserPin(userId: string, pin: string): Promise<VerifyUserResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/auth/verify`;
  return httpPost<VerifyUserResponse>(url, { userId, pin });
}

export async function syncUserTickets(userId: string, pin: string): Promise<UserTicketSyncResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/users/tickets/sync`;
  return httpPost<UserTicketSyncResponse>(url, { userId, pin });
}

export async function claimEventWithUser(
  eventId: string,
  userId: string,
  pin: string,
  proof?: UserClaimOnchainProof,
  costOfForgeryToken?: string
): Promise<UserClaimResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/events/${encodeURIComponent(eventId)}/claim`;
  return httpPost<UserClaimResponse>(url, {
    userId,
    pin,
    walletAddress: proof?.walletAddress,
    confirmationCode: proof?.confirmationCode,
    txSignature: proof?.txSignature,
    receiptPubkey: proof?.receiptPubkey,
    costOfForgeryToken,
  });
}

export async function verifyTicketReceiptByCode(
  eventId: string,
  confirmationCode: string
): Promise<VerifyTicketReceiptByCodeResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/audit/receipts/verify-code`;
  return httpPost<VerifyTicketReceiptByCodeResponse>(url, { eventId, confirmationCode });
}
