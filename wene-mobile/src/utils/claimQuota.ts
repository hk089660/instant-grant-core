import type { ClaimQuotaStatus, SchoolEvent } from '../types/school';

type ClaimPolicyLike =
  | Pick<ClaimQuotaStatus, 'claimIntervalDays' | 'maxClaimsPerInterval'>
  | Pick<SchoolEvent, 'claimIntervalDays' | 'maxClaimsPerInterval'>
  | null
  | undefined;

export function supportsRepeatClaimPolicy(policy: ClaimPolicyLike): boolean {
  if (!policy) return false;
  return policy.maxClaimsPerInterval === null || (typeof policy.maxClaimsPerInterval === 'number' && policy.maxClaimsPerInterval > 1);
}

export function canClaimAgain(claimQuota?: ClaimQuotaStatus | null): boolean {
  if (!claimQuota) return false;
  return claimQuota.remainingClaimsInCurrentInterval === null || claimQuota.remainingClaimsInCurrentInterval > 0;
}

export function formatClaimPolicyLabel(policy: ClaimPolicyLike): string | null {
  if (!policy) return null;
  const claimIntervalDays =
    typeof policy.claimIntervalDays === 'number' && Number.isFinite(policy.claimIntervalDays) && policy.claimIntervalDays > 0
      ? Math.floor(policy.claimIntervalDays)
      : 30;
  const maxClaimsPerInterval = policy.maxClaimsPerInterval;
  return `${claimIntervalDays}日ごと / ${maxClaimsPerInterval == null ? '無制限' : `${maxClaimsPerInterval}回まで`}`;
}

export function getClaimQuotaHeadline(claimQuota?: ClaimQuotaStatus | null): string | null {
  if (!claimQuota) return null;
  if (claimQuota.remainingClaimsInCurrentInterval === null) {
    return 'この期間は何回でも受け取れます';
  }
  if (claimQuota.remainingClaimsInCurrentInterval > 0) {
    return `あと${claimQuota.remainingClaimsInCurrentInterval}回受け取れます`;
  }
  return 'この期間の上限に達しました';
}

export function getClaimQuotaUsageLabel(claimQuota?: ClaimQuotaStatus | null): string | null {
  if (!claimQuota) return null;
  if (claimQuota.maxClaimsPerInterval === null) {
    return `この期間の受け取り回数: ${claimQuota.claimsUsedInCurrentInterval}回`;
  }
  return `この期間の受け取り: ${claimQuota.claimsUsedInCurrentInterval} / ${claimQuota.maxClaimsPerInterval}回`;
}

export function formatClaimQuotaNextAvailableAt(nextAvailableAt?: number): string | null {
  if (typeof nextAvailableAt !== 'number' || !Number.isFinite(nextAvailableAt) || nextAvailableAt <= 0) {
    return null;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(nextAvailableAt));
}
