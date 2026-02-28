/**
 * POST /v1/school/claims で参加申込
 * レスポンスは SchoolClaimResult に 100% 合わせる
 */

import { httpPost, toSchoolClaimResult } from './httpClient';
import type { SchoolClaimResult } from '../../types/school';
import type { SchoolClaimClient, SchoolClaimSubmitOptions } from '../schoolClaimClient';

export interface HttpSchoolClaimClientOptions {
  baseUrl: string;
}

export function createHttpSchoolClaimClient(options: HttpSchoolClaimClientOptions): SchoolClaimClient {
  const base = options.baseUrl.replace(/\/$/, '');
  const url = `${base}/v1/school/claims`;

  return {
    async submit(eventId: string, opts?: SchoolClaimSubmitOptions): Promise<SchoolClaimResult> {
      try {
        const body = {
          eventId,
          walletAddress: opts?.walletAddress,
          joinToken: opts?.joinToken,
          txSignature: opts?.txSignature,
          receiptPubkey: opts?.receiptPubkey,
          costOfForgeryToken: opts?.costOfForgeryToken,
        };
        const result = await httpPost<SchoolClaimResult>(url, body);
        if (result && typeof result === 'object' && 'success' in result) {
          return result;
        }
        return {
          success: false,
          error: { code: 'retryable', message: '不正なレスポンスです' },
        };
      } catch (e) {
        return toSchoolClaimResult(e);
      }
    },
  };
}
