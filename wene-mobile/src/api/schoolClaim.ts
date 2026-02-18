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
  return claimClient.submit(eventId, { walletAddress: walletPubkey, ...options });
}

export type { SchoolClaimResult } from '../types/school';
