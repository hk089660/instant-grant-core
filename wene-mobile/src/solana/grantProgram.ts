/**
 * Grant Program SDK
 * 
 * 【安定性のポイント】
 * - Program ID は config.ts から一元取得
 * - Connection は singleton を使用
 * - PDA 計算は純粋関数（副作用なし）
 */

import {
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';

// Program ID は config.ts から一元取得
import { GRANT_PROGRAM_ID } from './config';
import { getConnection } from './singleton';

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

/**
 * PoP signer config PDA（authority 単位）
 */
export const getPopConfigPda = (
  authority: PublicKey,
  programId: PublicKey = GRANT_PROGRAM_ID
): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pop-config'), authority.toBuffer()],
    programId
  );
};

/**
 * PoP chain state PDA（grant 単位）
 */
export const getPopStatePda = (
  grant: PublicKey,
  programId: PublicKey = GRANT_PROGRAM_ID
): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pop-state'), grant.toBuffer()],
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

// ============================================================
// トランザクション構築
// ============================================================

/**
 * Claim Grantトランザクションを構築
 * 
 * 【安定性】
 * - Connection は singleton を使用
 * - 署名は呼び出し側で行う（Phantomなど）
 */
export const buildClaimGrantTransaction = async (
  claimer: PublicKey,
  params: {
    authority: PublicKey;
    mint: PublicKey;
    grantId: bigint;
    periodIndex: bigint;
  }
): Promise<Transaction> => {
  const connection = getConnection();
  const { authority, mint, grantId, periodIndex } = params;
  
  // PDAを計算
  const [grantPda] = getGrantPda(authority, mint, grantId);
  const [_vaultPda] = getVaultPda(grantPda);
  const [_receiptPda] = getReceiptPda(grantPda, claimer, periodIndex);
  
  // 受給者のATAを取得/作成
  const claimerAta = await getAssociatedTokenAddress(mint, claimer);
  
  // ATAが存在しない場合は作成命令を追加
  const transaction = new Transaction();
  try {
    await getAccount(connection, claimerAta);
  } catch {
    // ATAが存在しない場合は作成命令を追加
    transaction.add(
      createAssociatedTokenAccountInstruction(
        claimer,
        claimerAta,
        claimer,
        mint
      )
    );
  }
  
  // TODO: Anchor ProgramのIDLを使って実際のinstructionを構築
  // const program = getProgram();
  // const instruction = await program.methods
  //   .claimGrant(new BN(periodIndex.toString()))
  //   .accounts({ ... })
  //   .instruction();
  // transaction.add(instruction);
  
  return transaction;
};

/**
 * Grant情報を取得
 * 
 * 【安定性】
 * - Connection は singleton を使用
 */
export const fetchGrantInfo = async (
  authority: PublicKey,
  mint: PublicKey,
  grantId: bigint
): Promise<{
  grant: PublicKey;
  vault: PublicKey;
  amountPerPeriod: bigint;
  periodSeconds: bigint;
  startTs: bigint;
  expiresAt: bigint;
} | null> => {
  try {
    const [grantPda] = getGrantPda(authority, mint, grantId);
    const [vaultPda] = getVaultPda(grantPda);
    
    // TODO: Anchor Programのaccount.fetch()を使う
    // const program = getProgram();
    // const grantAccount = await program.account.grant.fetch(grantPda);
    
    // スタブ: ダミーデータを返す
    return {
      grant: grantPda,
      vault: vaultPda,
      amountPerPeriod: BigInt(1000),
      periodSeconds: BigInt(2592000), // 30日
      startTs: BigInt(Math.floor(Date.now() / 1000) - 86400),
      expiresAt: BigInt(0),
    };
  } catch {
    return null;
  }
};

// ============================================================
// 型定義（後方互換性）
// ============================================================

export interface GrantProgram {
  version: string;
  name: string;
  instructions: Array<{
    name: string;
    accounts: Array<any>;
    args: Array<any>;
  }>;
  accounts: Array<any>;
  types: Array<any>;
}
