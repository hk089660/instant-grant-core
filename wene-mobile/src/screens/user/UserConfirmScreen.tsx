import React, { useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, Alert, Platform, ToastAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PublicKey } from '@solana/web3.js';
import { AppText, Button, Card, Loading } from '../../ui/components';
import { theme } from '../../ui/theme';
import { setStarted } from '../../data/participationStore';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';
import { useAuth } from '../../contexts/AuthContext';
import { claimEventWithUser, verifyUserPin } from '../../api/userApi';
import { HttpError } from '../../api/http/httpClient';
import { getSchoolDeps } from '../../api/createSchoolDeps';
import { useRecipientStore } from '../../store/recipientStore';
import { usePhantomStore } from '../../store/phantomStore';
import { useRecipientTicketStore } from '../../store/recipientTicketStore';
import { buildClaimTx } from '../../solana/txBuilders';
import { sendSignedTx, isBlockhashExpiredError, isSimulationFailedError } from '../../solana/sendTx';
import { getConnection } from '../../solana/singleton';
import { fetchSplBalance } from '../../solana/wallet';
import { signTransaction } from '../../utils/phantom';
import { rejectPendingSignTx } from '../../utils/phantomSignTxPending';
import { setPhantomWebReturnPath } from '../../utils/phantomWebReturnPath';
import type { SchoolEvent } from '../../types/school';

const SIGN_TIMEOUT_MS = 120_000;

function buildSendErrorDebugText(error: unknown): string {
  const lines: string[] = [];
  if (error && typeof error === 'object' && 'message' in error) {
    lines.push(String((error as { message?: unknown }).message ?? ''));
  }
  if (isSimulationFailedError(error) && Array.isArray(error.simLogs) && error.simLogs.length > 0) {
    lines.push(error.simLogs.join('\n'));
  }
  return lines.filter(Boolean).join('\n');
}

function shouldRetryWithLegacyClaim(error: unknown): boolean {
  const lower = buildSendErrorDebugText(error).toLowerCase();
  if (!lower) return false;
  if (lower.includes('instructionfallbacknotfound')) return true;
  if (lower.includes('account: token_program') && lower.includes('invalidprogramid')) return true;
  if (lower.includes('account: token_program') && lower.includes('program id was not as expected')) return true;
  return false;
}

export const UserConfirmScreen: React.FC = () => {
  const router = useRouter();
  const { eventId: targetEventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });
  const { userId, clearUser } = useAuth();
  const walletPubkey = useRecipientStore((s) => s.walletPubkey);
  const phantomSession = useRecipientStore((s) => s.phantomSession);
  const dappEncryptionPublicKey = usePhantomStore((s) => s.dappEncryptionPublicKey);
  const dappSecretKey = usePhantomStore((s) => s.dappSecretKey);
  const phantomEncryptionPublicKey = usePhantomStore((s) => s.phantomEncryptionPublicKey);
  const getTicketByEventId = useRecipientTicketStore((s) => s.getTicketByEventId);
  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [waitingForPhantom, setWaitingForPhantom] = useState(false);
  const claimIntervalDays = event?.claimIntervalDays ?? 30;
  const maxClaimsPerInterval = event?.maxClaimsPerInterval === null
    ? null
    : (event?.maxClaimsPerInterval ?? 1);
  const enforceOnchainPop = !['0', 'false', 'off', 'no'].includes(
    (process.env.EXPO_PUBLIC_ENFORCE_ONCHAIN_POP ?? 'true').trim().toLowerCase()
  );
  const eventHasOnchainConfig = Boolean(event?.solanaMint && event?.solanaAuthority && event?.solanaGrantId);
  const onchainRequired = enforceOnchainPop && eventHasOnchainConfig;
  const onchainPolicyCompatible = claimIntervalDays === 30 && maxClaimsPerInterval === 1;
  const walletReady = Boolean(
    walletPubkey &&
    phantomSession &&
    phantomEncryptionPublicKey &&
    dappEncryptionPublicKey &&
    dappSecretKey
  );

  // イベント情報を API から取得
  useEffect(() => {
    if (!targetEventId) return;
    let cancelled = false;
    setEventLoading(true);
    getSchoolDeps()
      .eventProvider.getById(targetEventId)
      .then((ev) => {
        if (!cancelled) setEvent(ev ?? null);
      })
      .catch(() => {
        if (!cancelled) setEvent(null);
      })
      .finally(() => {
        if (!cancelled) setEventLoading(false);
      });
    return () => { cancelled = true; };
  }, [targetEventId]);

  useEffect(() => {
    if (!targetEventId) return;
    setStarted(targetEventId).catch(() => { });
  }, [targetEventId]);

  const buildSignRedirectContext = useCallback((): { redirectLink: string; appUrl: string } => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && !!window.location?.origin) {
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPhantomWebReturnPath(returnPath);
      return {
        redirectLink: `${window.location.origin}/phantom/signTransaction`,
        appUrl: window.location.origin,
      };
    }

    return {
      redirectLink: 'wene://phantom/sign?cluster=devnet',
      appUrl: 'https://wene.app',
    };
  }, []);

  const handleCancelPhantomWait = useCallback(() => {
    const msg = 'Phantom署名待機を中断しました。もう一度「参加を確定する」を押してください。';
    rejectPendingSignTx(new Error(msg));
    setWaitingForPhantom(false);
    setStatus('error');
    setError(msg);
    if (Platform.OS === 'android') {
      ToastAndroid.show('署名待機を中断しました', ToastAndroid.SHORT);
    }
  }, []);

  const runOnchainClaim = useCallback(async (): Promise<{
    txSignature: string;
    receiptPubkey: string;
    mint: string;
    popEntryHash: string;
    popAuditHash: string;
    popSigner: string;
  }> => {
    if (!targetEventId || !event) {
      throw new Error('イベント情報が不足しています');
    }
    if (!walletPubkey || !phantomSession || !phantomEncryptionPublicKey || !dappEncryptionPublicKey || !dappSecretKey) {
      throw new Error('Phantomウォレットを接続してください');
    }

    const recipientPubkey = new PublicKey(walletPubkey);
    let forceLegacyClaim = false;
    let built = await buildClaimTx({
      campaignId: targetEventId,
      recipientPubkey,
      solanaMint: event.solanaMint,
      solanaAuthority: event.solanaAuthority,
      solanaGrantId: event.solanaGrantId,
      forceLegacyClaim,
    });

    let retriedForBlockhash = false;
    while (true) {
      const { redirectLink, appUrl } = buildSignRedirectContext();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let signed: Awaited<ReturnType<typeof signTransaction>>;
      try {
        setWaitingForPhantom(true);
        signed = await Promise.race([
          signTransaction({
            tx: built.tx,
            session: phantomSession,
            dappEncryptionPublicKey,
            dappSecretKey,
            phantomEncryptionPublicKey,
            redirectLink,
            cluster: 'devnet',
            appUrl,
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              const timeoutMsg = 'Phantom署名がタイムアウトしました。Phantomからこのアプリに戻って再試行してください。';
              rejectPendingSignTx(new Error(timeoutMsg));
              reject(new Error(timeoutMsg));
            }, SIGN_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        setWaitingForPhantom(false);
      }

      try {
        const txSignature = await sendSignedTx(signed, {
          blockhash: built.meta.recentBlockhash,
          lastValidBlockHeight: built.meta.lastValidBlockHeight,
        });
        return {
          txSignature,
          receiptPubkey: built.meta.receiptPda.toBase58(),
          mint: built.meta.mint.toBase58(),
          popEntryHash: built.meta.popProofEntryHash,
          popAuditHash: built.meta.popProofAuditHash,
          popSigner: built.meta.popProofSignerPubkey,
        };
      } catch (sendError) {
        const msg = sendError instanceof Error ? sendError.message : String(sendError);
        if (!retriedForBlockhash && isBlockhashExpiredError(msg)) {
          retriedForBlockhash = true;
          built = await buildClaimTx({
            campaignId: targetEventId,
            recipientPubkey,
            solanaMint: event.solanaMint,
            solanaAuthority: event.solanaAuthority,
            solanaGrantId: event.solanaGrantId,
            forceLegacyClaim,
          });
          continue;
        }
        if (!forceLegacyClaim && shouldRetryWithLegacyClaim(sendError)) {
          forceLegacyClaim = true;
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('[UserConfirmScreen] on-chain PoP claim incompatible; retry with legacy claim');
          }
          built = await buildClaimTx({
            campaignId: targetEventId,
            recipientPubkey,
            solanaMint: event.solanaMint,
            solanaAuthority: event.solanaAuthority,
            solanaGrantId: event.solanaGrantId,
            forceLegacyClaim: true,
          });
          continue;
        }
        throw sendError;
      }
    }
  }, [
    targetEventId,
    event,
    walletPubkey,
    phantomSession,
    phantomEncryptionPublicKey,
    dappEncryptionPublicKey,
    dappSecretKey,
    buildSignRedirectContext,
  ]);

  const waitForMintReflection = useCallback(async (
    mintAddress: string,
    ownerAddress: string,
    timeoutMs: number = 15_000
  ): Promise<boolean> => {
    try {
      const connection = getConnection();
      const ownerPubkey = new PublicKey(ownerAddress);
      const mintPubkey = new PublicKey(mintAddress);
      const deadline = Date.now() + timeoutMs;

      while (Date.now() <= deadline) {
        const result = await fetchSplBalance(connection, ownerPubkey, mintPubkey);
        try {
          if (BigInt(result.amount) > BigInt(0)) {
            return true;
          }
        } catch {
          // noop
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const handleParticipate = useCallback(async () => {
    if (!targetEventId || !userId || !event) return;

    // PIN が必要な場合は入力を促す
    if (!showPinInput) {
      setShowPinInput(true);
      return;
    }

    const pinVal = pin.trim();
    if (!/^\d{4,6}$/.test(pinVal)) {
      setError('PINは4〜6桁の数字で入力してください');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      // 1) PIN 検証だけ先に行う（off-chain claim の副作用を先に発生させない）
      await verifyUserPin(userId, pinVal);

      // 2) on-chain claim（失敗時は off-chain 判定へフォールバック）
      let txSignature: string | undefined;
      let receiptPubkey: string | undefined;
      let distributedMint: string | undefined;
      let popEntryHash: string | undefined;
      let popAuditHash: string | undefined;
      let popSigner: string | undefined;
      let tokenReflectedInWallet = false;
      let onchainBlockedByPeriod = false;
      let result: Awaited<ReturnType<typeof claimEventWithUser>> | null = null;
      const shouldAttemptOnchain = Boolean(
        walletReady &&
        walletPubkey &&
        eventHasOnchainConfig
      );

      if (onchainRequired && !shouldAttemptOnchain) {
        throw new Error('この参加券はオンチェーンPoP必須です。Phantomを接続してから再実行してください。');
      }

      if (shouldAttemptOnchain) {
        const ownerWallet = walletPubkey;
        if (!ownerWallet) {
          throw new Error('Phantomウォレットを接続してください');
        }
        try {
          const onchain = await runOnchainClaim();
          txSignature = onchain.txSignature;
          receiptPubkey = onchain.receiptPubkey;
          distributedMint = onchain.mint;
          popEntryHash = onchain.popEntryHash;
          popAuditHash = onchain.popAuditHash;
          popSigner = onchain.popSigner;
          tokenReflectedInWallet = await waitForMintReflection(onchain.mint, ownerWallet);
        } catch (onchainError) {
          const storedTicket = getTicketByEventId(targetEventId);
          const onchainMsg = onchainError instanceof Error ? onchainError.message : String(onchainError);
          const onchainMsgLower = onchainMsg.toLowerCase();
          const mayBeAlreadyClaimed =
            onchainMsg.includes('既に受給済み') ||
            onchainMsgLower.includes('already in use') ||
            onchainMsgLower.includes('account already in use');
          if (!mayBeAlreadyClaimed) {
            throw onchainError;
          }

          onchainBlockedByPeriod = true;
          if (storedTicket?.txSignature) {
            txSignature = storedTicket.txSignature;
            receiptPubkey = storedTicket.receiptPubkey;
            popEntryHash = storedTicket.popEntryHash;
            popAuditHash = storedTicket.popAuditHash;
            popSigner = storedTicket.popSigner;
          }
          distributedMint = event.solanaMint ?? undefined;
          if (__DEV__) {
            console.log('[UserConfirmScreen] on-chain distribution blocked by period', {
              eventId: targetEventId,
              onchainPolicyCompatible,
              hasStoredTicket: Boolean(storedTicket?.txSignature),
            });
          }
        }
      } else if (__DEV__) {
        console.log('[UserConfirmScreen] on-chain claim skipped (off-chain only mode)', {
          eventId: targetEventId,
          walletReady,
          hasWalletPubkey: Boolean(walletPubkey),
          hasOnchainConfig: Boolean(event.solanaMint && event.solanaAuthority && event.solanaGrantId),
        });
      }
      if (!onchainPolicyCompatible && __DEV__) {
        console.log('[UserConfirmScreen] custom policy active', {
          claimIntervalDays,
          maxClaimsPerInterval,
        });
      }

      // 3) off-chain claim 記録（on-chain 成功時のみ一時障害を許容）
      if (!result) {
        try {
          result = await claimEventWithUser(targetEventId, userId, pinVal, {
            walletAddress: walletPubkey ?? undefined,
            txSignature,
            receiptPubkey,
          });
        } catch (syncError) {
          if (syncError instanceof HttpError && syncError.status === 401) {
            throw syncError;
          }
          if (!txSignature) {
            throw syncError;
          }
          console.warn('[UserConfirmScreen] off-chain claim sync failed after on-chain success:', syncError);
        }
      }

      // 標準ルール時は on-chain 側 already と off-chain 判定の不整合を許容しない
      if (onchainPolicyCompatible && onchainBlockedByPeriod && result?.status !== 'already') {
        throw new Error('オンチェーン上限に達しています。管理者の受給設定とオンチェーン設定を確認してください。');
      }

      router.push(
        schoolRoutes.success(targetEventId, {
          already: result?.status === 'already',
          status: result?.status ?? 'created',
          confirmationCode: result?.confirmationCode,
          tx: txSignature,
          receipt: receiptPubkey,
          mint: distributedMint,
          reflected: tokenReflectedInWallet,
          onchainBlocked: onchainBlockedByPeriod,
          popEntryHash,
          popAuditHash,
          popSigner,
        }) as any
      );
    } catch (e: unknown) {
      setStatus('error');

      if (e instanceof HttpError && e.status === 401) {
        const body = e.body as any;
        if (body?.code === 'user_not_found') {
          Alert.alert('認証エラー', 'ユーザー登録情報が見つかりません。再登録してください。', [
            {
              text: 'OK',
              onPress: () => {
                clearUser();
              },
            },
          ]);
          return;
        }
        if (body?.code === 'invalid_pin') {
          setError('PINが正しくありません');
          return;
        }
      }

      if (e && typeof e === 'object' && 'message' in e) {
        const msg = String((e as { message: string }).message);
        if (msg.includes('invalid pin')) {
          setError('PINが正しくありません');
        } else if (msg.includes('PoP設定が未初期化')) {
          setError('このイベントのPoP設定が未初期化です。運営に再発行を依頼してください。');
        } else if (msg.includes('PoP証明の取得に失敗')) {
          setError(msg);
        } else if (msg.includes('PoP') || msg.includes('pop')) {
          setError(`オンチェーンPoP検証エラー: ${msg}`);
        } else if (msg.includes('既に受給済み')) {
          setError(
            onchainPolicyCompatible
              ? 'このウォレットは現在期間のオンチェーン配布を受給済みです。次回期間までお待ちください。'
              : 'この期間の受給上限に達しています。設定した期間を過ぎてから再試行してください。'
          );
        } else if (msg.includes('キャンセル')) {
          setError('Phantom署名がキャンセルされました');
        } else if (msg.includes('タイムアウト')) {
          setError('Phantom署名がタイムアウトしました。Phantomからこのアプリに戻って再試行してください。');
        } else {
          setError(msg);
        }
      } else {
        setError('参加処理に失敗しました。再試行してください。');
      }
    }
  }, [
    targetEventId,
    userId,
    event,
    pin,
    showPinInput,
    walletReady,
    runOnchainClaim,
    waitForMintReflection,
    getTicketByEventId,
    clearUser,
    router,
    eventHasOnchainConfig,
    onchainRequired,
    onchainPolicyCompatible,
    claimIntervalDays,
    maxClaimsPerInterval,
  ]);

  if (!isValid) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h2" style={styles.title}>
          内容を確認
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          参加するイベントの内容を確認してください
        </AppText>

        {eventLoading ? (
          <Card style={styles.card}>
            <Loading />
            <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8 }}>
              イベント情報を読み込み中…
            </AppText>
          </Card>
        ) : event ? (
          <Card style={styles.card}>
            <AppText variant="h3">{event.title}</AppText>
            <AppText variant="caption" style={styles.eventMeta}>{event.datetime}</AppText>
            <AppText variant="caption" style={styles.eventMeta}>主催: {event.host}</AppText>
            <AppText variant="caption" style={styles.eventMeta}>
              受給ルール: {claimIntervalDays}日ごと / {maxClaimsPerInterval == null ? '無制限' : `${maxClaimsPerInterval}回まで`}
            </AppText>
            {onchainRequired && (
              <AppText variant="small" style={styles.noticeText}>
                ※ この参加券はオンチェーンPoP必須です。Phantom接続と署名が必要です。
              </AppText>
            )}
            {!onchainPolicyCompatible && (
              <AppText variant="small" style={styles.noticeText}>
                ※ カスタム受給ルール時は、オンチェーン配布が同一期間で上限に達した場合にオフチェーン記録のみ更新されることがあります。
              </AppText>
            )}
            {event.state && event.state !== 'published' && (
              <AppText variant="small" style={styles.warningText}>
                ※ このイベントは現在受付していません（状態: {event.state}）
              </AppText>
            )}
          </Card>
        ) : (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.warningText}>
              イベントが見つかりません（ID: {targetEventId}）
            </AppText>
          </Card>
        )}

        {!walletReady && (
          <Card style={styles.walletCard}>
            <AppText variant="caption" style={styles.walletHint}>
              {onchainRequired
                ? 'このイベントはPhantom接続が必須です。接続後に参加を確定してください。'
                : 'Phantom未接続でも参加できます。接続するとSPL参加券がウォレットに配布されます。'}
            </AppText>
            <Button
              title={onchainRequired ? 'Phantomを接続（必須）' : 'Phantomを接続（任意）'}
              variant="secondary"
              onPress={() => router.push('/wallet' as any)}
              style={styles.walletButton}
            />
          </Card>
        )}

        {showPinInput && (
          <Card style={styles.pinCard}>
            <AppText variant="caption" style={styles.pinLabel}>
              PINを入力して参加を確定してください
            </AppText>
            <View style={styles.pinInputWrap}>
              {/* TextInput */}
              <PinInput value={pin} onChange={setPin} disabled={status === 'loading'} />
            </View>
          </Card>
        )}

        {error ? (
          <AppText variant="caption" style={styles.apiErrorText}>
            {error}
          </AppText>
        ) : null}

        {status === 'loading' && waitingForPhantom ? (
          <Card style={styles.fallbackCard}>
            <AppText variant="caption" style={styles.fallbackText}>
              Phantomで署名後にこの画面へ戻ってください。戻れない場合は待機を中断して再試行できます。
            </AppText>
            <Button
              title="署名待機を中断する"
              variant="secondary"
              onPress={handleCancelPhantomWait}
              style={styles.fallbackButton}
            />
          </Card>
        ) : null}

        {/* アクションボタン群 */}
        <View style={styles.actionGroup}>
          <Button
            title={
              status === 'loading'
                ? '処理中…'
                : showPinInput
                  ? '参加を確定する'
                  : '参加する'
            }
            onPress={handleParticipate}
            loading={status === 'loading'}
            disabled={
              status === 'loading' ||
              !event ||
              (event.state != null && event.state !== 'published') ||
              (onchainRequired && !walletReady)
            }
          />
          {!showPinInput && event && event.state === 'published' && walletReady && (
            <AppText variant="small" style={styles.actionHint}>
              PINを入力して参加を確定します
            </AppText>
          )}
          {!walletReady && (
            <AppText variant="small" style={styles.actionHint}>
              {onchainRequired
                ? 'このイベントはPhantom接続が必須です'
                : 'Phantom未接続時はオフチェーン参加として確定されます'}
            </AppText>
          )}
          <Button
            title="戻る"
            variant="secondary"
            onPress={() => router.back()}
            style={styles.backButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

/** PIN 入力用の簡易コンポーネント */
import { TextInput } from 'react-native';

function PinInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <TextInput
      style={styles.pinInput}
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
      placeholder="4〜6桁の数字"
      placeholderTextColor={theme.colors.textTertiary}
      keyboardType="number-pad"
      secureTextEntry
      maxLength={6}
      editable={!disabled}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.lg,
  },
  eventMeta: {
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  warningText: {
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
  },
  noticeText: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  walletCard: {
    marginBottom: theme.spacing.md,
  },
  walletHint: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  walletButton: {
    marginTop: theme.spacing.xs,
  },
  pinCard: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
  },
  pinLabel: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  pinInputWrap: {
    marginBottom: theme.spacing.xs,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 20,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 8,
  },
  actionGroup: {
    marginTop: theme.spacing.sm,
  },
  actionHint: {
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  backButton: {
    marginTop: theme.spacing.sm,
  },
  apiErrorText: {
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  fallbackCard: {
    marginBottom: theme.spacing.md,
  },
  fallbackText: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  fallbackButton: {
    marginTop: theme.spacing.xs,
  },
});
