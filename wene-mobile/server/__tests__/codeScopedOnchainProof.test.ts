import { describe, expect, it } from 'vitest';
import { selectCodeScopedStoredOnchainProof } from '../../src/utils/codeScopedOnchainProof';

describe('selectCodeScopedStoredOnchainProof', () => {
  it('does not reuse old on-chain proof for a new confirmation code', () => {
    const selected = selectCodeScopedStoredOnchainProof(
      {
        confirmationCode: 'OLDCODE',
        txSignature: 'old-tx',
        receiptPubkey: 'old-receipt',
        popEntryHash: 'old-entry',
      },
      'NEWCODE'
    );

    expect(selected.matchesCurrentConfirmationCode).toBe(false);
    expect(selected.txSignature).toBeUndefined();
    expect(selected.receiptPubkey).toBeUndefined();
    expect(selected.popEntryHash).toBeUndefined();
  });

  it('reuses on-chain proof only when the confirmation code matches', () => {
    const selected = selectCodeScopedStoredOnchainProof(
      {
        confirmationCode: 'MATCHED',
        txSignature: 'matched-tx',
        receiptPubkey: 'matched-receipt',
        popAuditHash: 'matched-audit',
        popSigner: 'matched-signer',
        joinedAt: 123,
      },
      'MATCHED'
    );

    expect(selected.matchesCurrentConfirmationCode).toBe(true);
    expect(selected.txSignature).toBe('matched-tx');
    expect(selected.receiptPubkey).toBe('matched-receipt');
    expect(selected.popAuditHash).toBe('matched-audit');
    expect(selected.popSigner).toBe('matched-signer');
    expect(selected.claimedAt).toBe(123);
  });
});
