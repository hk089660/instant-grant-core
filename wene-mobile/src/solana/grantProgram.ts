/**
 * Grant Program PDA Utilities
 * 
 * 【安定性のポイント】
 * - Program ID は config.ts から一元取得
 * - PDA 計算は純粋関数（副作用なし）
 */

import { PublicKey } from '@solana/web3.js';

// Program ID は config.ts から一元取得
import { GRANT_PROGRAM_ID } from './config';

// ============================================================
// PDA 計算（純粋関数）
// ============================================================

/**
 * Grant PDAを計算
 */
export const getGrantPda = (
  authority: PublicKey,
  mint: PublicKey,
  grantId: bigint,
  programId: PublicKey = GRANT_PROGRAM_ID
): [PublicKey, number] => {
  const grantIdBytes = Buffer.alloc(8);
  grantIdBytes.writeBigUInt64LE(grantId, 0);
  
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('grant'),
      authority.toBuffer(),
      mint.toBuffer(),
      grantIdBytes,
    ],
    programId
  );
};

/**
 * Vault PDAを計算
 */
export const getVaultPda = (
  grant: PublicKey,
  programId: PublicKey = GRANT_PROGRAM_ID
): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), grant.toBuffer()],
    programId
  );
};

/**
 * Receipt PDAを計算
 */
export const getReceiptPda = (
  grant: PublicKey,
  claimer: PublicKey,
  periodIndex: bigint,
  programId: PublicKey = GRANT_PROGRAM_ID
): [PublicKey, number] => {
  const periodIndexBytes = Buffer.alloc(8);
  periodIndexBytes.writeBigUInt64LE(periodIndex, 0);
  
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('receipt'),
      grant.toBuffer(),
      claimer.toBuffer(),
      periodIndexBytes,
    ],
    programId
  );
};

// ============================================================
// ユーティリティ関数
// ============================================================

/**
 * 現在のperiod_indexを計算
 */
export const calculatePeriodIndex = (
  startTs: bigint,
  periodSeconds: bigint,
  currentTs?: bigint
): bigint => {
  const now = currentTs || BigInt(Math.floor(Date.now() / 1000));
  const elapsed = now - startTs;
  if (elapsed < 0) {
    return BigInt(0);
  }
  return elapsed / periodSeconds;
};
