import { describe, expect, it } from 'vitest';
import { computeIssueMintPlan } from '../../src/solana/issueMintPlan';

describe('computeIssueMintPlan', () => {
  it('does not retain extra issuer supply when ticketTokenAmount is 1', () => {
    const plan = computeIssueMintPlan({
      ticketTokenAmount: 1,
      maxClaimsPerInterval: 1,
    });

    expect(plan.amountPerPeriod).toBe(BigInt(1));
    expect(plan.adminRetainedAmount).toBe(BigInt(0));
    expect(plan.initialMintAmount).toBe(plan.bootstrapAmount);
  });

  it('keeps initial mint amount equal to vault bootstrap amount', () => {
    const plan = computeIssueMintPlan({
      ticketTokenAmount: 3,
      maxClaimsPerInterval: null,
    });

    expect(plan.bootstrapAmount).toBeGreaterThan(BigInt(0));
    expect(plan.initialMintAmount).toBe(plan.bootstrapAmount);
    expect(plan.initialMintAmount - plan.bootstrapAmount).toBe(BigInt(0));
  });
});
