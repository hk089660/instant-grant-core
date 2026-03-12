export interface CodeScopedOnchainProofSource {
  confirmationCode?: string;
  txSignature?: string;
  receiptPubkey?: string;
  popEntryHash?: string;
  popAuditHash?: string;
  popSigner?: string;
  joinedAt?: number;
}

export interface CodeScopedOnchainProof {
  matchesCurrentConfirmationCode: boolean;
  txSignature?: string;
  receiptPubkey?: string;
  popEntryHash?: string;
  popAuditHash?: string;
  popSigner?: string;
  claimedAt?: number;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function selectCodeScopedStoredOnchainProof(
  stored: CodeScopedOnchainProofSource | null | undefined,
  confirmationCode?: string
): CodeScopedOnchainProof {
  const normalizedStoredCode = normalizeOptionalString(stored?.confirmationCode);
  const normalizedConfirmationCode = normalizeOptionalString(confirmationCode);
  const matchesCurrentConfirmationCode = normalizedStoredCode === normalizedConfirmationCode;

  if (!matchesCurrentConfirmationCode) {
    return {
      matchesCurrentConfirmationCode,
    };
  }

  return {
    matchesCurrentConfirmationCode,
    txSignature: normalizeOptionalString(stored?.txSignature),
    receiptPubkey: normalizeOptionalString(stored?.receiptPubkey),
    popEntryHash: normalizeOptionalString(stored?.popEntryHash),
    popAuditHash: normalizeOptionalString(stored?.popAuditHash),
    popSigner: normalizeOptionalString(stored?.popSigner),
    claimedAt:
      typeof stored?.joinedAt === 'number' && Number.isFinite(stored.joinedAt)
        ? stored.joinedAt
        : undefined,
  };
}
