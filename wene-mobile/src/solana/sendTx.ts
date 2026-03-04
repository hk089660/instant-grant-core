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

export type SendTxErrorWithSignature = Error & {
  txSignature?: string;
};

export function getSendTxErrorSignature(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('txSignature' in error)) return undefined;
  const candidate = (error as { txSignature?: unknown }).txSignature;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function attachTxSignatureToError(error: unknown, txSignature: string): SendTxErrorWithSignature {
  const normalizedTxSignature = txSignature.trim();
  if (error instanceof Error) {
    (error as SendTxErrorWithSignature).txSignature = normalizedTxSignature;
    return error as SendTxErrorWithSignature;
  }
  const wrapped = new Error(String(error)) as SendTxErrorWithSignature;
  wrapped.txSignature = normalizedTxSignature;
  return wrapped;
}

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
 * 送信エラー（simulate/raw/preflight）を再試行判定向けに展開する。
 */
export function buildSendErrorDebugText(error: unknown): string {
  const lines: string[] = [];
  const txSignature = getSendTxErrorSignature(error);
  if (txSignature) {
    lines.push(`txSignature: ${txSignature}`);
  }
  if (error && typeof error === 'object' && 'message' in error) {
    lines.push(String((error as { message?: unknown }).message ?? ''));
  } else if (error != null) {
    lines.push(String(error));
  }
  if (isSimulationFailedError(error)) {
    if (error.simErr != null) {
      if (typeof error.simErr === 'string') {
        lines.push(error.simErr);
      } else {
        try {
          lines.push(JSON.stringify(error.simErr));
        } catch {
          lines.push(String(error.simErr));
        }
      }
    }
    if (Array.isArray(error.simLogs) && error.simLogs.length > 0) {
      lines.push(error.simLogs.join('\n'));
    }
  }
  return lines.filter(Boolean).join('\n');
}

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
  if (
    lower.includes('popgenesismismatch') ||
    lower.includes('pophashchainbroken') ||
    lower.includes('popstreamchainbroken') ||
    lower.includes('popproofexpired') ||
    lower.includes('invalidperiodindex')
  ) {
    return '受け取り状態の同期で失敗しました。もう一度受け取りを実行してください';
  }
  if (lower.includes('accountownedbywrongprogram') && lower.includes('pop_config')) {
    return 'PoP設定の整合性確認に失敗しました。受け取りを再試行してください';
  }
  if (lower.includes('blockhash not found') || lower.includes('block height exceeded') || lower.includes('blockhash expired')) {
    return '署名後に期限切れになりました。もう一度お試しください';
  }
  if (lower.includes('transaction simulation failed')) {
    const compact = message.replace(/.*transaction simulation failed:?/i, '').trim();
    if (compact.length > 0) {
      return `送信に失敗しました（事前検証で失敗）。${compact}`;
    }
    return '送信に失敗しました（事前検証で失敗）。ログを確認してください';
  }
  return message;
}

type SendErrorWithLogs = Error & {
  logs?: string[];
  getLogs?: (connection: ReturnType<typeof getConnection>) => Promise<string[]>;
};

async function extractSimulationLogs(error: unknown): Promise<string[] | null> {
  const asError = error as SendErrorWithLogs | null | undefined;
  if (!asError || typeof asError !== 'object') return null;

  if (Array.isArray(asError.logs) && asError.logs.length > 0) {
    return asError.logs.map((line) => String(line));
  }

  if (typeof asError.getLogs === 'function') {
    try {
      const connection = getConnection();
      const fetched = await asError.getLogs(connection);
      if (Array.isArray(fetched) && fetched.length > 0) {
        return fetched.map((line) => String(line));
      }
    } catch {
      // no-op
    }
  }

  return null;
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
 * 事前検証エラーのうち、buildClaimTx から再構築・再署名で回復できる可能性が高いもの。
 */
export function isRecoverableClaimBuildError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('invalidperiodindex') ||
    lower.includes('error code: invalidperiodindex') ||
    lower.includes('error number: 6005') ||
    lower.includes('popproofexpired') ||
    lower.includes('error code: popproofexpired') ||
    lower.includes('error number: 6024') ||
    lower.includes('pophashchainbroken') ||
    lower.includes('error code: pophashchainbroken') ||
    lower.includes('error number: 6026') ||
    lower.includes('popstreamchainbroken') ||
    lower.includes('error code: popstreamchainbroken') ||
    lower.includes('error number: 6027') ||
    lower.includes('popgenesismismatch') ||
    lower.includes('error code: popgenesismismatch') ||
    lower.includes('error number: 6028') ||
    lower.includes('custom program error: 0x1788') ||
    lower.includes('custom program error: 0x178a') ||
    lower.includes('custom program error: 0x178b') ||
    lower.includes('custom program error: 0x178c') ||
    (lower.includes('accountownedbywrongprogram') && lower.includes('pop_config')) ||
    (lower.includes('error number: 3007') && lower.includes('pop_config')) ||
    lower.includes('custom program error: 0xbbf')
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
      const simLogs = await extractSimulationLogs(error);
      if (isTransientNetworkError(rawMsg) && attempt < NETWORK_RETRY_MAX) {
        console.warn(`[sendSignedTx] sendRawTransaction network retry ${attempt}/${NETWORK_RETRY_MAX}:`, rawMsg);
        await sleep(attempt * 800);
        continue;
      }
      if (
        rawMsg.toLowerCase().includes('transaction simulation failed') &&
        Array.isArray(simLogs) &&
        simLogs.length > 0
      ) {
        const capped = simLogs.length > 50 ? simLogs.slice(-50) : simLogs;
        console.error('Failed to send transaction (preflight logs):', capped);
        throw createSimulationFailedError(
          formatSendError(rawMsg),
          rawMsg,
          capped
        );
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
    throw attachTxSignatureToError(new Error(formatSendError(rawMsg)), sig);
  }

  return sig;
}
