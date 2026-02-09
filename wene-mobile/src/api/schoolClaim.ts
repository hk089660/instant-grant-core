/**
 * 学校向け参加券 API
 *
 * PoC: devnet で実際のトランザクションを送信。
 * buildClaimTx / signTransaction / sendSignedTx を使って devnet tx を実際に出す。
 *
 * 実装は schoolClaimClient で差し替え可能。
 */

import { Transaction, PublicKey } from '@solana/web3.js';
import type { SchoolClaimResult } from '../types/school';
import { createMockSchoolClaimClient } from './schoolClaimClient.mock';
import { schoolEventProvider } from './schoolEvents';
import { getEventById } from './schoolEvents';
import { usePhantomStore } from '../store/phantomStore';
import { useRecipientStore } from '../store/recipientStore';
import { useRecipientTicketStore } from '../store/recipientTicketStore';
import { signTransaction } from '../utils/phantom';
import { sendSignedTx, isBlockhashExpiredError } from '../solana/sendTx';
import { getConnection } from '../solana/anchorClient';

const client = createMockSchoolClaimClient(schoolEventProvider);

/**
 * 学校参加券用の簡易トランザクションを構築（空のトランザクション）
 */
async function buildSchoolClaimTx(recipientPubkey: PublicKey): Promise<{
  tx: Transaction;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}> {
  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = recipientPubkey;
  // 空のトランザクション（PoC最小実装）
  return { tx, recentBlockhash: blockhash, lastValidBlockHeight };
}

/**
 * 学校参加券を送信
 *
 * @param eventId QR から取得したイベントID（parseEventId で検証済みを推奨）
 * @returns 成功/失敗を統一形式で返す
 */
export async function submitSchoolClaim(eventId: string): Promise<SchoolClaimResult> {
  try {
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return {
        success: false,
        error: { code: 'invalid', message: 'イベントIDが無効です' },
      };
    }

    const event = getEventById(eventId.trim());
    if (!event) {
      return {
        success: false,
        error: { code: 'not_found', message: 'イベントが見つかりません' },
      };
    }

    // eligibility チェック: event.state が published 以外はエラー
    if (event.state && event.state !== 'published') {
      return {
        success: false,
        error: { code: 'eligibility', message: 'このイベントは参加できません' },
      };
    }

    // already-claim チェック（store から確認）
    const { isJoined } = useRecipientTicketStore.getState();
    if (isJoined(eventId.trim())) {
      // already-claim は成功扱い
      return {
        success: true,
        eventName: event.title,
        alreadyJoined: true,
      };
    }

    // Phantom 接続状態を確認
    const { walletPubkey, phantomSession } = useRecipientStore.getState();
    const { dappEncryptionPublicKey, dappSecretKey, phantomEncryptionPublicKey } = usePhantomStore.getState();

    if (!walletPubkey || !phantomSession || !dappEncryptionPublicKey || !dappSecretKey || !phantomEncryptionPublicKey) {
      return {
        success: false,
        error: { code: 'retryable', message: 'Phantomに接続してください' },
      };
    }

    // トランザクション構築・署名・送信
    const recipientPubkey = new PublicKey(walletPubkey);
    let txResult = await buildSchoolClaimTx(recipientPubkey);
    let signedTx: Transaction;

    try {
      signedTx = await Promise.race([
        signTransaction({
          tx: txResult.tx,
          session: phantomSession,
          dappEncryptionPublicKey,
          dappSecretKey,
          phantomEncryptionPublicKey,
          redirectLink: 'wene://phantom/sign?cluster=devnet',
          cluster: 'devnet',
          appUrl: 'https://wene.app',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Phantom署名がタイムアウトしました')), 120000)
        ),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // user_cancel 検知（4001/キャンセル文言）
      if (msg.includes('4001') || msg.includes('キャンセル') || msg.includes('cancel')) {
        return {
          success: false,
          error: { code: 'user_cancel', message: '署名がキャンセルされました' },
        };
      }
      // その他のエラーは retryable
      return {
        success: false,
        error: { code: 'retryable', message: msg || '署名に失敗しました' },
      };
    }

    // 送信
    let signature: string;
    try {
      signature = await sendSignedTx(signedTx, {
        blockhash: txResult.recentBlockhash,
        lastValidBlockHeight: txResult.lastValidBlockHeight,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // blockhash 期限切れは再試行
      if (isBlockhashExpiredError(msg)) {
        // 1回だけ再試行
        txResult = await buildSchoolClaimTx(recipientPubkey);
        try {
          signedTx = await Promise.race([
            signTransaction({
              tx: txResult.tx,
              session: phantomSession,
              dappEncryptionPublicKey,
              dappSecretKey,
              phantomEncryptionPublicKey,
              redirectLink: 'wene://phantom/sign?cluster=devnet',
              cluster: 'devnet',
              appUrl: 'https://wene.app',
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Phantom署名がタイムアウトしました')), 120000)
            ),
          ]);
          signature = await sendSignedTx(signedTx, {
            blockhash: txResult.recentBlockhash,
            lastValidBlockHeight: txResult.lastValidBlockHeight,
          });
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          return {
            success: false,
            error: { code: 'retryable', message: retryMsg || '送信に失敗しました' },
          };
        }
      } else {
        return {
          success: false,
          error: { code: 'retryable', message: msg || '送信に失敗しました' },
        };
      }
    }

    // 成功: store に保存
    const { addTicket } = useRecipientTicketStore.getState();
    await addTicket({
      eventId: eventId.trim(),
      eventName: event.title,
      joinedAt: Date.now(),
    });

    // Explorer URL を生成
    const explorerTxUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    // receiptPubkey は簡易実装のため null（将来の拡張用）
    const receiptPubkey = undefined;
    const explorerReceiptUrl = receiptPubkey
      ? `https://explorer.solana.com/address/${receiptPubkey}?cluster=devnet`
      : undefined;

    return {
      success: true,
      eventName: event.title,
      txSignature: signature,
      receiptPubkey,
      explorerTxUrl,
      explorerReceiptUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: { code: 'retryable', message: msg || '参加に失敗しました' },
    };
  }
}

export type { SchoolClaimResult } from '../types/school';
