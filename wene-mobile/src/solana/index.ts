/**
 * Solana Module Index
 * 
 * 【推奨インポート方法】
 * import { getConnection, getProgram, GRANT_PROGRAM_ID } from '@/solana';
 * 
 * 【安定性のポイント】
 * - singleton.ts の関数を優先的にエクスポート
 * - 後方互換性のために anchorClient.ts も維持
 */

// ============================================================
// 推奨: Singleton 関数（一度生成したら再利用）
// ============================================================
export {
  // Connection / Provider / Program
  getConnection,
  getProvider,
  getProgram,
  getReadonlyKeypair,
  // 定数（cluster 経由）
  CLUSTER,
  RPC_URL,
  // ステータス確認（デバッグ用）
  getSingletonStatus,
  resetSingletons,
} from './singleton';

// Cluster 定義（devnet 完全固定）
export {
  DEFAULT_CLUSTER,
  DEVNET_RPC_FIXED,
  getRpcUrl,
  type SolanaCluster,
} from './cluster';

// ============================================================
// 定数
// ============================================================
export { GRANT_PROGRAM_ID } from './config';

// ============================================================
// PDA 計算・トランザクション構築
// ============================================================
export {
  getGrantPda,
  getVaultPda,
  getReceiptPda,
  calculatePeriodIndex,
} from './grantProgram';

// ============================================================
// トランザクション送信
// ============================================================
export {
  sendSignedTx,
  isBlockhashExpiredError,
  formatSendError,
  type ConfirmContext,
} from './sendTx';

// ============================================================
// トランザクションビルダー
// ============================================================
export {
  buildClaimTx,
  buildUseTx,
  type BuildClaimTxParams,
  type BuildClaimTxResult,
  type BuildUseTxParams,
  type BuildUseTxResult,
} from './txBuilders';

// ============================================================
// ウォレット残高（SOL / SPL）
// ============================================================
export {
  getSolBalance,
  getTokenBalances,
  fetchSplBalance,
  fetchAnyPositiveSplBalance,
  formatAmountForDisplay,
  formatMintShort,
  SPL_USDC_MINT,
  type TokenBalanceItem,
  type FetchSplBalanceResult,
} from './wallet';
