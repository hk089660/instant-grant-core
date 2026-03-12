const MAX_U64 = (BigInt(1) << BigInt(64)) - BigInt(1);
const MIN_PREFUND_MULTIPLIER = 100;

export function toPositiveU64(value: bigint, name: string): bigint {
  if (value <= BigInt(0)) {
    throw new Error(`${name} must be greater than 0`);
  }
  if (value > MAX_U64) {
    throw new Error(`${name} exceeds u64 limit`);
  }
  return value;
}

export function computeBootstrapAmount(
  amountPerPeriod: bigint,
  maxClaimsPerInterval: number | null
): bigint {
  const expectedClaimsPerInterval = maxClaimsPerInterval == null
    ? 100
    : Math.max(1, Math.floor(maxClaimsPerInterval));
  const expectedIntervals = maxClaimsPerInterval == null ? 30 : 60;
  const base = amountPerPeriod * BigInt(expectedClaimsPerInterval) * BigInt(expectedIntervals);
  const floor = amountPerPeriod * BigInt(MIN_PREFUND_MULTIPLIER);
  return base > floor ? base : floor;
}

export function computeIssueMintPlan(params: {
  ticketTokenAmount: number;
  maxClaimsPerInterval: number | null;
}): {
  amountPerPeriod: bigint;
  bootstrapAmount: bigint;
  adminRetainedAmount: bigint;
  initialMintAmount: bigint;
} {
  const amountPerPeriod = toPositiveU64(
    BigInt(Math.floor(params.ticketTokenAmount)),
    'ticketTokenAmount'
  );
  const bootstrapAmount = toPositiveU64(
    computeBootstrapAmount(amountPerPeriod, params.maxClaimsPerInterval),
    'bootstrapMintAmount'
  );

  // Do not retain extra supply in the issuer wallet. Otherwise, using the
  // same wallet for setup and claim makes a single claim appear as 2 tokens.
  const adminRetainedAmount = BigInt(0);
  const initialMintAmount = bootstrapAmount;

  return {
    amountPerPeriod,
    bootstrapAmount,
    adminRetainedAmount,
    initialMintAmount,
  };
}
