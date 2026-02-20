import { Transaction } from '@solana/web3.js';
import { getConnection } from './anchorClient';

/**
 * DEV のみ: simulate 失敗時に UI に err/logs を渡すためのエラー。
 * Android RN ではカスタム class が undefined になることがあるため、
 * class は使わず plain Error + プロパティ追加。判定は構造チェックのみ。
 */
export type SimulationFailedLike = Error & {
  simErr?: unknown;
  simLogs?: string[] | null;
  unitsConsumed?: number;
};

export const createSimulationFailedError = (
  message: string,
  simErr: unknown,
  simLogs: string[] | null,
  unitsConsumed?: number
): SimulationFailedLike => {
  const e = new Error(message) as SimulationFailedLike;
  e.name = 'SimulationFailedError';
  e.simErr = simErr;
  e.simLogs = simLogs;
  e.unitsConsumed = unitsConsumed;
  return e;
};

export const isSimulationFailedError = (e: unknown): e is SimulationFailedLike =>
  !!e &&
  typeof e === 'object' &&
  'simErr' in e &&
  'simLogs' in e;

/**
 * 確定確認に使う blockhash / lastValidBlockHeight（buildClaimTx で取得したものを渡す）
 */
export interface ConfirmContext {
  blockhash: string;
  lastValidBlockHeight: number;
}

/**
 * 送信エラーメッセージをユーザー向けに整形
 */
export function formatSendError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('network error')
  ) {
    return 'ネットワークエラーが発生しました。通信状態を確認して再試行してください';
  }
  if (lower.includes('insufficient funds')) {
    return '手数料SOLが不足しています';
  }
  if (lower.includes('blockhash not found') || lower.includes('block height exceeded') || lower.includes('blockhash expired')) {
    return '署名後に期限切れになりました。もう一度お試しください';
  }
  if (lower.includes('transaction simulation failed')) {
    return '送信に失敗しました（事前検証で失敗）。ログを確認してください';
  }
  return message;
}

/**
 * 一時的なネットワーク障害かどうか
 */
export function isTransientNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('network error') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('503') ||
    lower.includes('429')
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 署名が confirmed/finalized になるまで短時間ポーリングする。
 * processed のみでは成功扱いにしない。
 */
async function waitForConfirmedSignature(
  signature: string,
  maxAttempts: number = 8,
  intervalMs: number = 900
): Promise<boolean> {
  const connection = getConnection();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0] ?? null;
    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return true;
    }
    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }
  return false;
}

/** Blockhash 期限切れ系エラーかどうか（自動再試行の判定用） */
export function isBlockhashExpiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('blockhash not found') ||
    lower.includes('block height exceeded') ||
    lower.includes('blockhash expired') ||
    lower.includes('署名後に期限切れ')
  );
}

/**
 * 署名済みトランザクションを送信し、confirm まで完了させる
 * @param tx 署名済みトランザクション
 * @param confirmContext buildClaimTx で取得した blockhash / lastValidBlockHeight（handleClaim から常に渡す。無い場合のみ signature 単体で confirm）
 * @returns signature
 */
export async function sendSignedTx(
  tx: Transaction,
  confirmContext?: ConfirmContext | null
): Promise<string> {
  const connection = getConnection();
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const rpcEndpoint = connection.rpcEndpoint;
    console.log('[RPC] sendSignedTx() connection.rpcEndpoint=', rpcEndpoint);
    console.log('[CLUSTER_CHECK]', { rpcEndpoint, expected: 'devnet' });
  }

  if (!tx.recentBlockhash) {
    throw new Error('Transaction blockhash is missing');
  }

  if (tx.instructions.length === 0) {
    throw new Error('Transaction has no instructions');
  }

  // 1) [DEV のみ] sendRawTransaction 直前に simulate。err があれば送信せず createSimulationFailedError で終了
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[RPC] sendSignedTx() simulate 直前 rpcEndpoint=', connection.rpcEndpoint);
    console.log('[CLUSTER_CHECK]', { rpcEndpoint: connection.rpcEndpoint, expected: 'devnet' });
    try {
      const sim = await connection.simulateTransaction(tx);
      const err = sim.value?.err ?? null;
      const logs = sim.value?.logs ?? null;
      const unitsConsumed = sim.value?.unitsConsumed;
      if (err != null) {
        const logsCap = Array.isArray(logs) && logs.length > 50 ? logs.slice(-50) : logs ?? [];
        throw createSimulationFailedError(
          'SIMULATION FAILED',
          err,
          Array.isArray(logsCap) ? logsCap : [String(logsCap)],
          unitsConsumed
        );
      }
    } catch (e) {
      if (isSimulationFailedError(e)) throw e;
      console.warn('[sendSignedTx] simulateTransaction threw (non-fail):', e);
      // シミュレーション API の例外（ネットワーク等）は無視して送信へ
    }
  }

  // 2) serialize → rawTx（安全側: requireAllSignatures=false で環境差による落ちを防ぐ）
  let raw: Buffer;
  try {
    raw = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
  } catch (error) {
    console.error('Failed to serialize transaction:', error);
    throw new Error('トランザクションのシリアライズに失敗しました');
  }

  // 3) sendRawTransaction（オプション固定）
  const sendOpts = {
    skipPreflight: false,
    preflightCommitment: 'confirmed' as const,
    maxRetries: 3,
  };
  const NETWORK_RETRY_MAX = 3;

  let sig: string | null = null;
  for (let attempt = 1; attempt <= NETWORK_RETRY_MAX; attempt += 1) {
    try {
      sig = await connection.sendRawTransaction(raw, sendOpts);
      break;
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      if (isTransientNetworkError(rawMsg) && attempt < NETWORK_RETRY_MAX) {
        console.warn(`[sendSignedTx] sendRawTransaction network retry ${attempt}/${NETWORK_RETRY_MAX}:`, rawMsg);
        await sleep(attempt * 800);
        continue;
      }
      console.error('Failed to send transaction:', error);
      throw new Error(formatSendError(rawMsg));
    }
  }
  if (!sig) {
    throw new Error('送信に失敗しました。時間をおいて再試行してください');
  }

  // 4) confirmTransaction（confirmContext を優先。無い場合のみ signature 単体の API で確定）
  let confirmError: unknown = null;
  for (let attempt = 1; attempt <= NETWORK_RETRY_MAX; attempt += 1) {
    try {
      if (confirmContext?.blockhash && confirmContext?.lastValidBlockHeight != null) {
        const confirmation = await connection.confirmTransaction(
          {
            signature: sig,
            blockhash: confirmContext.blockhash,
            lastValidBlockHeight: confirmContext.lastValidBlockHeight,
          },
          'confirmed'
        );
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
      } else {
        // フォールバック: blockhash を捏造せず、signature だけの API で確定
        const confirmation = await connection.confirmTransaction(sig, 'confirmed');
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
      }
      confirmError = null;
      break;
    } catch (e) {
      confirmError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (isTransientNetworkError(msg) && attempt < NETWORK_RETRY_MAX) {
        console.warn(`[sendSignedTx] confirmTransaction network retry ${attempt}/${NETWORK_RETRY_MAX}:`, msg);
        await sleep(attempt * 800);
        continue;
      }
      break;
    }
  }
  if (confirmError) {
    try {
      // 最終保険: confirm が throw しても、confirmed/finalized まで到達したら成功扱い
      const ok = await waitForConfirmedSignature(sig);
      if (ok) {
        console.warn('[sendSignedTx] confirmTransaction threw but signature reached confirmed/finalized:', sig);
        return sig;
      }
    } catch (statusError) {
      const statusMsg = statusError instanceof Error ? statusError.message : String(statusError);
      console.warn('[sendSignedTx] waitForConfirmedSignature fallback failed:', statusMsg);
    }
    const rawMsg = confirmError instanceof Error ? confirmError.message : String(confirmError);
    console.error('Failed to confirm transaction:', confirmError);
    throw new Error(formatSendError(rawMsg));
  }

  return sig;
}
