/**
 * 学校参加券 API
 *
 * 実装は createSchoolDeps() で HTTP クライアントを使用。
 * UI の分岐は SchoolClaimResult.error.code のみに依存する。
 */

import type { SchoolClaimResult } from '../types/school';
import type { SchoolClaimSubmitOptions } from './schoolClaimClient';
import { getSchoolDeps } from './createSchoolDeps';
import { useRecipientStore } from '../store/recipientStore';

export async function submitSchoolClaim(
  eventId: string,
  options?: SchoolClaimSubmitOptions
): Promise<SchoolClaimResult> {
  const { claimClient } = getSchoolDeps();
  const walletPubkey = useRecipientStore.getState().walletPubkey ?? undefined;
  const normalizedOptionWallet =
    typeof options?.walletAddress === 'string' && options.walletAddress.trim()
      ? options.walletAddress.trim()
      : undefined;
  const resolvedWalletAddress = normalizedOptionWallet ?? walletPubkey;
  const payload: SchoolClaimSubmitOptions = {
    ...(options ?? {}),
    ...(resolvedWalletAddress ? { walletAddress: resolvedWalletAddress } : {}),
  };
  return claimClient.submit(eventId, payload);
}

export type { SchoolClaimResult } from '../types/school';
