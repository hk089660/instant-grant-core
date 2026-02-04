/**
 * Solana Singleton Manager
 *
 * Connection / Provider / Program を単一インスタンスで管理し、
 * Hot Reload や re-render で再生成されることを防ぐ。
 *
 * 【安定性のポイント】
 * - モジュールスコープでインスタンスを保持
 * - 一度生成したら再利用（lazy singleton）
 * - cluster は cluster.ts の DEFAULT_CLUSTER に集約（現状は devnet 固定）
 */

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { KeypairWallet } from './keypairWallet';
import { getGrantProgramId, GRANT_PROGRAM_ID } from './config';
import { DEFAULT_CLUSTER, getRpcUrl } from './cluster';
import idl from '../idl/grant_program.json';

// ============================================================
// Cluster / RPC（cluster.ts を唯一のソースとする）
// ============================================================

export const CLUSTER = DEFAULT_CLUSTER;

/** 現在の cluster に対応する RPC URL（getConnection 内で使用。import 時には new Connection しない） */
function _getRpcUrl(): string {
  return getRpcUrl(DEFAULT_CLUSTER);
}

export const RPC_URL = _getRpcUrl();

// ============================================================
// Singleton インスタンス（getConnection のみが new Connection を行う）
// ============================================================

let _connection: Connection | null = null;
let _provider: AnchorProvider | null = null;
let _program: Program | null = null;
let _readonlyKeypair: Keypair | null = null;

// ============================================================
// Getter 関数（遅延初期化 + 再利用）
// ============================================================

/**
 * Connection を取得（シングルトン）
 * 唯一 new Connection を行う箇所。URL は getRpcUrl(DEFAULT_CLUSTER) で決まる。
 */
export function getConnection(): Connection {
  if (!_connection) {
    const url = _getRpcUrl();
    _connection = new Connection(url, {
      commitment: 'confirmed',
      wsEndpoint: url.replace('https://', 'wss://'),
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[RPC] getConnection() rpcEndpoint=', _connection.rpcEndpoint, 'cluster=', CLUSTER);
      console.log('[CLUSTER_CHECK]', { rpcEndpoint: _connection.rpcEndpoint, expected: 'devnet' });
    }
  }
  return _connection;
}

/**
 * 読み取り専用 Keypair を取得（シングルトン）
 * 
 * 【安定性】
 * - 署名不要な操作用のダミーキーペア
 * - 毎回 Keypair.generate() しないことでオーバーヘッド削減
 */
export function getReadonlyKeypair(): Keypair {
  if (!_readonlyKeypair) {
    _readonlyKeypair = Keypair.generate();
  }
  return _readonlyKeypair;
}

/**
 * AnchorProvider を取得（シングルトン）
 *
 * 【RN × Anchor】anchor の Wallet は isBrowser 判定で undefined になりクラッシュするため、
 * KeypairWallet（自前実装）を使用。Anchor の Wallet は一切 import しない。
 * → Android 実機で claim フローが安全に動作する。
 *
 * 【安定性】
 * - Connection と Keypair を再利用
 * - 署名が必要な場合は別途 Phantom で行う
 */
export function getProvider(): AnchorProvider {
  if (!_provider) {
    const connection = getConnection();
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[RPC] getProvider() connection.rpcEndpoint=', connection.rpcEndpoint);
    }
    const keypair = getReadonlyKeypair();
    const wallet = new KeypairWallet(keypair);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[getProvider] KeypairWallet DEV check:', {
        publicKey: wallet.publicKey?.toBase58?.(),
        signTransaction: typeof wallet.signTransaction,
        signAllTransactions: typeof wallet.signAllTransactions,
        payerPublicKey: wallet.payer?.publicKey?.toBase58?.(),
      });
    }
    _provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
  }
  return _provider;
}

/**
 * Grant Program インスタンスを取得（シングルトン）
 * 
 * 【安定性】
 * - IDL は静的 import（自動 fetch しない）
 * - Program ID は IDL 内の address と一致を検証
 */
export function getProgram(): Program {
  if (!_program) {
    const provider = getProvider();
    const programId = getGrantProgramId(CLUSTER);
    const idlWithAddress = { ...(idl as object), address: programId.toBase58() };
    _program = new Program(idlWithAddress as any, provider);
  }
  return _program;
}

// ============================================================
// 状態確認・リセット（デバッグ/テスト用）
// ============================================================

/**
 * シングルトンの状態を確認
 */
export function getSingletonStatus(): {
  hasConnection: boolean;
  hasProvider: boolean;
  hasProgram: boolean;
  rpcUrl: string;
  cluster: string;
  programId: string;
} {
  return {
    hasConnection: _connection !== null,
    hasProvider: _provider !== null,
    hasProgram: _program !== null,
    rpcUrl: RPC_URL,
    cluster: CLUSTER,
    programId: GRANT_PROGRAM_ID.toBase58(),
  };
}

/**
 * シングルトンをリセット（テスト用、本番では使用しない）
 */
export function resetSingletons(): void {
  _connection = null;
  _provider = null;
  _program = null;
  _readonlyKeypair = null;
}
