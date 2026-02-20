import { Transaction, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createBurnInstruction,
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { GRANT_PROGRAM_ID } from './config';
import { getConnection, getProgram } from './anchorClient';
import { getGrantPda, getVaultPda, getReceiptPda, calculatePeriodIndex } from './grantProgram';
import { DEFAULT_CLUSTER } from './cluster';
import { DEVNET_GRANT_CONFIG } from './devnetConfig';
import { RPC_URL } from './singleton';

function toBigIntValue(value: unknown, field: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  if (value && typeof value === 'object' && 'toString' in value) {
    const str = (value as { toString: () => string }).toString();
    if (/^-?\d+$/.test(str.trim())) return BigInt(str.trim());
  }
  throw new Error(`Invalid ${field} in grant account`);
}

/**
 * Claim Transaction 構築パラメータ
 */
export interface BuildClaimTxParams {
  campaignId: string;
  code?: string;
  recipientPubkey: PublicKey;
  solanaMint?: string | null;
  solanaAuthority?: string | null;
  solanaGrantId?: string | null;
}

/**
 * Claim Transaction 構築結果
 */
export interface BuildClaimTxResult {
  tx: Transaction;
  meta: {
    feePayer: PublicKey | null;
    /** buildClaimTx 時点の blockhash（sendSignedTx の confirmContext に必ず渡す） */
    recentBlockhash: string;
    /** buildClaimTx 時点の lastValidBlockHeight（sendSignedTx の confirmContext に必ず渡す） */
    lastValidBlockHeight: number;
    instructionCount: number;
    grantPda: PublicKey;
    vaultPda: PublicKey;
    receiptPda: PublicKey;
    claimerAta: PublicKey;
    periodIndex: bigint;
    mint: PublicKey;
  };
}

/**
 * Claim Grant トランザクションを構築
 * 
 * 注意: 署名・送信は行わない。構築のみ。
 * 
 * TODO: campaignId/code から authority/mint/grantId を取得するAPIが必要
 * 現時点では、これらの情報を取得する方法が未確定のため、
 * パラメータとして直接受け取る形に変更する可能性がある
 */
export async function buildClaimTx(
  params: BuildClaimTxParams
): Promise<BuildClaimTxResult> {
  const { campaignId, recipientPubkey } = params;
  const connection = getConnection();
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[RPC] buildClaimTx() connection.rpcEndpoint=', connection.rpcEndpoint);
    console.log('[CLUSTER_CHECK]', { rpcEndpoint: connection.rpcEndpoint, expected: 'devnet' });
  }
  const program = getProgram();

  // devnetConfig: DEV+devnet 時は本物の Grant を使用。未設定時は dummy にフォールバック
  const devnetConfig = DEFAULT_CLUSTER === 'devnet' ? DEVNET_GRANT_CONFIG : null;

  const authority = params.solanaAuthority
    ? new PublicKey(params.solanaAuthority)
    : devnetConfig
      ? devnetConfig.authority
      : new PublicKey('11111111111111111111111111111111');

  const mint = params.solanaMint
    ? new PublicKey(params.solanaMint)
    : devnetConfig
      ? devnetConfig.mint
      : new PublicKey('So11111111111111111111111111111111111111112');

  const grantId = params.solanaGrantId
    ? BigInt(params.solanaGrantId)
    : devnetConfig
      ? devnetConfig.grantId
      : BigInt(1);

  const [grantPda] = getGrantPda(authority, mint, grantId);
  const hasExplicitGrantParams = Boolean(
    params.solanaAuthority &&
    params.solanaMint &&
    params.solanaGrantId
  );
  let periodSource: 'grantAccount' | 'devnetConfig' | 'fallback' = 'fallback';
  let startTs: bigint;
  let periodSeconds: bigint;
  try {
    const grantAccount = await (program as any).account.grant.fetch(grantPda);
    startTs = toBigIntValue(grantAccount.startTs, 'startTs');
    periodSeconds = toBigIntValue(grantAccount.periodSeconds, 'periodSeconds');
    periodSource = 'grantAccount';
  } catch (grantFetchError) {
    if (hasExplicitGrantParams) {
      const msg = grantFetchError instanceof Error ? grantFetchError.message : String(grantFetchError);
      throw new Error(`配布設定の取得に失敗しました（grant fetch failed: ${msg}）`);
    }
    if (devnetConfig) {
      startTs = devnetConfig.startTs;
      periodSeconds = devnetConfig.periodSeconds;
      periodSource = 'devnetConfig';
    } else {
      startTs = BigInt(Math.floor(Date.now() / 1000) - 86400);
      periodSeconds = BigInt(2592000);
      periodSource = 'fallback';
    }
  }
  if (periodSeconds <= BigInt(0)) {
    throw new Error('配布設定が不正です（period_seconds <= 0）');
  }

  const periodIndex = calculatePeriodIndex(startTs, periodSeconds);

  const [vaultPda] = getVaultPda(grantPda);
  const [receiptPda] = getReceiptPda(grantPda, recipientPubkey, periodIndex);

  // 既存レシートがある場合は、同一期間の再受給が不可能（Program仕様）なので事前に中断
  const existingReceipt = await connection.getAccountInfo(receiptPda, 'confirmed');
  if (existingReceipt) {
    const nextClaimTs = Number(startTs + (periodIndex + BigInt(1)) * periodSeconds);
    const nextClaimIso = Number.isFinite(nextClaimTs) && nextClaimTs > 0
      ? new Date(nextClaimTs * 1000).toISOString()
      : null;
    const nextClaimMsg = nextClaimIso ? ` 次回受給可能時刻: ${nextClaimIso}` : '';
    throw new Error(
      `このウォレットは現在の配布期間で既に受給済みです（Program仕様）。${nextClaimMsg}`
    );
  }

  // vault が無い/空の場合は署名前に明示的にエラーにする
  let vaultBalanceForCheck = BigInt(0);
  try {
    const vaultAcc = await getAccount(connection, vaultPda);
    vaultBalanceForCheck = BigInt(vaultAcc.amount.toString());
  } catch {
    throw new Error('配布用Vaultが見つかりません。管理者側でGrant設定を確認してください');
  }
  if (vaultBalanceForCheck <= BigInt(0)) {
    throw new Error('配布原資が不足しています。管理者側でGrantの入金（fund_grant）を実施してください');
  }

  // DEV: claim 実行前の事前チェック（1ブロックで状態が分かる）
  let vaultBalanceLog = '';
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (devnetConfig) {
      try {
        const vaultAcc = await getAccount(connection, vaultPda);
        vaultBalanceLog = vaultAcc.amount.toString();
      } catch {
        vaultBalanceLog = 'UNKNOWN (grant/vault 未存在?)';
      }
    }
    console.log(
      '[DEV_ENV] cluster=' + DEFAULT_CLUSTER +
      ' rpc=' + RPC_URL +
      ' programId=' + GRANT_PROGRAM_ID.toBase58() +
      ' source=' + periodSource
    );
    if (periodSource !== 'fallback') {
      console.log(
        '[DEV_GRANT] grantId=' + grantId.toString() +
        ' mint=' + mint.toBase58() +
        ' vault=' + vaultPda.toBase58() +
        ' vaultBalance=' + (vaultBalanceLog || '-') +
        ' periodIndex=' + periodIndex.toString()
      );
    }
  }

  const claimerAta = await getAssociatedTokenAddress(mint, recipientPubkey);

  const tx = new Transaction();

  try {
    await getAccount(connection, claimerAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        recipientPubkey,
        claimerAta,
        recipientPubkey,
        mint
      )
    );
  }

  const instruction = await program.methods
    .claimGrant(new BN(periodIndex.toString()))
    .accounts({
      grant: grantPda,
      mint,
      vault: vaultPda,
      claimer: recipientPubkey,
      claimerAta: claimerAta,
      receipt: receiptPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  tx.add(instruction);

  // recentBlockhash / lastValidBlockHeight を必ず取得（sendSignedTx の confirmContext に常に渡すため）
  const { blockhash: recentBlockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = recentBlockhash;

  // feePayer を設定（送信しないが、tx の完全性のために）
  tx.feePayer = recipientPubkey;

  return {
    tx,
    meta: {
      feePayer: recipientPubkey,
      recentBlockhash,
      lastValidBlockHeight,
      instructionCount: tx.instructions.length,
      grantPda,
      vaultPda,
      receiptPda,
      claimerAta,
      periodIndex,
      mint,
    },
  };
}

// ===== Use Transaction =====

/**
 * Use Transaction 構築パラメータ
 */
export interface BuildUseTxParams {
  campaignId: string;
  recipientPubkey: PublicKey;
  amount?: bigint; // 使用量（未指定時は全残高）
}

/**
 * Use Transaction 構築結果
 */
export interface BuildUseTxResult {
  tx: Transaction;
  meta: {
    feePayer: PublicKey | null;
    recentBlockhash: string | null;
    instructionCount: number;
    mint: PublicKey;
    userAta: PublicKey;
    amount: bigint;
  };
}

/**
 * Use（消費）トランザクションを構築
 * SPL Token の burn 操作を使用
 * 
 * 注意: 署名・送信は行わない。構築のみ。
 * 
 * TODO: campaignId から Grant 情報（mint）を取得するAPIが必要
 */
export async function buildUseTx(
  params: BuildUseTxParams
): Promise<BuildUseTxResult> {
  const { campaignId, recipientPubkey, amount } = params;
  const connection = getConnection();

  // TODO: campaignId から Grant 情報（mint）を取得
  // 現時点では、ダミー値を使用（実際の実装では API から取得）
  const dummyMint = new PublicKey('So11111111111111111111111111111111111111112'); // SOL (devnet)

  // ユーザーの ATA を取得
  const userAta = await getAssociatedTokenAddress(dummyMint, recipientPubkey);

  // トランザクションを作成
  const tx = new Transaction();

  // ATA の残高を取得して使用量を決定
  let burnAmount: bigint;
  if (amount !== undefined) {
    burnAmount = amount;
  } else {
    try {
      const account = await getAccount(connection, userAta);
      burnAmount = BigInt(account.amount.toString());
      if (burnAmount < 0) {
        burnAmount = BigInt(0);
      }
    } catch (error) {
      // ATA が存在しない場合は 0
      console.warn('ATA not found or error getting account:', error);
      burnAmount = BigInt(0);
    }
  }

  // burn 命令を追加（残高が 0 より大きい場合のみ）
  if (burnAmount > 0) {
    try {
      tx.add(
        createBurnInstruction(
          userAta, // account: 燃やすトークンアカウント
          dummyMint, // mint: トークンのmint
          recipientPubkey, // owner: トークンアカウントの所有者（signer）
          Number(burnAmount), // amount (u64)
          [], // multiSigners（単一署名者の場合は空）
          TOKEN_PROGRAM_ID
        )
      );
    } catch (error) {
      console.error('Failed to create burn instruction:', error);
      throw new Error('Burn命令の作成に失敗しました');
    }
  }

  // recentBlockhash を取得
  let recentBlockhash: string | null = null;
  try {
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    recentBlockhash = blockhash;
    tx.recentBlockhash = blockhash;
  } catch (error) {
    console.warn('Failed to get recent blockhash:', error);
  }

  // feePayer を設定
  tx.feePayer = recipientPubkey;

  return {
    tx,
    meta: {
      feePayer: recipientPubkey,
      recentBlockhash,
      instructionCount: tx.instructions.length,
      mint: dummyMint,
      userAta,
      amount: burnAmount,
    },
  };
}
