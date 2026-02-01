/**
 * Devnet 用 Grant 設定（devnetConfig）
 *
 * 【役割】
 * - DEV かつ cluster=devnet のとき、buildClaimTx が本物の authority/mint/grantId を使う
 * - _RAW が未設定（空）のときは null を返し、dummy にフォールバック
 *
 * 【設定方法】
 * 1) 環境変数（推奨・本番では差し替え可能）: EXPO_PUBLIC_WENE_DEVNET_AUTHORITY, EXPO_PUBLIC_WENE_DEVNET_MINT,
 *    EXPO_PUBLIC_WENE_DEVNET_GRANT_ID, EXPO_PUBLIC_WENE_DEVNET_START_TS, EXPO_PUBLIC_WENE_DEVNET_PERIOD_SECONDS
 * 2) フォールバック: grant_program の devnet_setup 実行後、出力された _RAW をそのまま貼り付け
 *
 * SECURITY_REVIEW H2: 本番では環境変数で上書きすること。
 */

import { PublicKey } from '@solana/web3.js';

export interface DevnetGrantConfig {
  authority: PublicKey;
  mint: PublicKey;
  grantId: bigint;
  /** start_ts（unix timestamp）period_index 計算用 */
  startTs: bigint;
  /** period_seconds（30日 = 2592000） */
  periodSeconds: bigint;
}

/** 環境変数から取得（Expo: EXPO_PUBLIC_ がクライアントに渡る） */
function _fromEnv(): Partial<{ authority: string; mint: string; grantId: string; startTs: string; periodSeconds: string }> {
  const env = typeof process !== 'undefined' ? process.env : {};
  const authority = env.EXPO_PUBLIC_WENE_DEVNET_AUTHORITY ?? '';
  const mint = env.EXPO_PUBLIC_WENE_DEVNET_MINT ?? '';
  if (!authority || !mint) return {};
  return {
    authority,
    mint,
    grantId: env.EXPO_PUBLIC_WENE_DEVNET_GRANT_ID ?? '1',
    startTs: env.EXPO_PUBLIC_WENE_DEVNET_START_TS ?? String(Math.floor(Date.now() / 1000) - 86400),
    periodSeconds: env.EXPO_PUBLIC_WENE_DEVNET_PERIOD_SECONDS ?? '2592000',
  };
}

/**
 * devnet_setup.ts の _RAW 出力をそのまま貼り付け（環境変数未設定時のフォールバック）
 */
const _RAW = {
  authority: '6MVimhATeGJrvNWYJcozsxMCWQK78oEM1sd6KqpMq3Kz',
  mint: '9g6BSqJBefXHLPhhdBTyGXNBuRPNqmJ9BedNc8ENnHL',
  grantId: '1',
  startTs: '1738281600',
  periodSeconds: '2592000',
};

function _parseConfig(): DevnetGrantConfig | null {
  const fromEnv = _fromEnv();
  const authority = fromEnv.authority ?? _RAW.authority;
  const mint = fromEnv.mint ?? _RAW.mint;
  const grantId = fromEnv.grantId ?? _RAW.grantId;
  const startTs = fromEnv.startTs ?? _RAW.startTs;
  const periodSeconds = fromEnv.periodSeconds ?? _RAW.periodSeconds;

  if (!authority || !mint) {
    return null;
  }
  try {
    return {
      authority: new PublicKey(authority),
      mint: new PublicKey(mint),
      grantId: BigInt(grantId || '1'),
      startTs: BigInt(startTs || String(Math.floor(Date.now() / 1000) - 86400)),
      periodSeconds: BigInt(periodSeconds || '2592000'),
    };
  } catch {
    return null;
  }
}

/** Devnet 時のみ有効。未設定時は null */
export const DEVNET_GRANT_CONFIG: DevnetGrantConfig | null = _parseConfig();
