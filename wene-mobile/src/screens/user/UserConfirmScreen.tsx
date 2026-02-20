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
import { sendSignedTx, isBlockhashExpiredError } from '../../solana/sendTx';
import { signTransaction } from '../../utils/phantom';
import { rejectPendingSignTx } from '../../utils/phantomSignTxPending';
import { setPhantomWebReturnPath } from '../../utils/phantomWebReturnPath';
import type { SchoolEvent } from '../../types/school';

const SIGN_TIMEOUT_MS = 120_000;

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

  const runOnchainClaim = useCallback(async (): Promise<{ txSignature: string; receiptPubkey: string }> => {
    if (!targetEventId || !event) {
      throw new Error('イベント情報が不足しています');
    }
    if (!walletPubkey || !phantomSession || !phantomEncryptionPublicKey || !dappEncryptionPublicKey || !dappSecretKey) {
      throw new Error('Phantomウォレットを接続してください');
    }

    const recipientPubkey = new PublicKey(walletPubkey);
    let built = await buildClaimTx({
      campaignId: targetEventId,
      recipientPubkey,
      solanaMint: event.solanaMint,
      solanaAuthority: event.solanaAuthority,
      solanaGrantId: event.solanaGrantId,
    });

    let retried = false;
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
        };
      } catch (sendError) {
        const msg = sendError instanceof Error ? sendError.message : String(sendError);
        if (!retried && isBlockhashExpiredError(msg)) {
          retried = true;
          built = await buildClaimTx({
            campaignId: targetEventId,
            recipientPubkey,
            solanaMint: event.solanaMint,
            solanaAuthority: event.solanaAuthority,
            solanaGrantId: event.solanaGrantId,
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
    if (!walletReady) {
      setError('Phantomウォレットを接続してください');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      // 1) PIN 検証だけ先に行う（off-chain claim の副作用を先に発生させない）
      await verifyUserPin(userId, pinVal);

      // 2) on-chain claim（ここが成功してから off-chain 参加記録を確定）
      let txSignature: string | undefined;
      let receiptPubkey: string | undefined;
      let result: Awaited<ReturnType<typeof claimEventWithUser>> | null = null;

      try {
        const onchain = await runOnchainClaim();
        txSignature = onchain.txSignature;
        receiptPubkey = onchain.receiptPubkey;
      } catch (onchainError) {
        // on-chain が「既に受給済み」の場合は off-chain 側も already か確認してから復元
        const storedTicket = getTicketByEventId(targetEventId);
        const onchainMsg = onchainError instanceof Error ? onchainError.message : String(onchainError);
        const mayBeAlreadyClaimed =
          onchainMsg.includes('既に受給済み') ||
          onchainMsg.includes('already in use') ||
          onchainMsg.includes('custom program error');
        if (!(mayBeAlreadyClaimed && storedTicket?.txSignature)) {
          throw onchainError;
        }

        result = await claimEventWithUser(targetEventId, userId, pinVal);
        if (result.status !== 'already') {
          throw new Error('オンチェーン上限に達しています。管理者の受給設定とオンチェーン設定を確認してください。');
        }
        txSignature = storedTicket.txSignature;
        receiptPubkey = storedTicket.receiptPubkey;
      }

      // 3) off-chain claim 記録（ネットワーク一時障害でも tx は保持して成功遷移）
      if (!result) {
        try {
          result = await claimEventWithUser(targetEventId, userId, pinVal);
        } catch (syncError) {
          if (syncError instanceof HttpError && syncError.status === 401) {
            throw syncError;
          }
          console.warn('[UserConfirmScreen] off-chain claim sync failed after on-chain success:', syncError);
        }
      }

      router.push(
        schoolRoutes.success(targetEventId, {
          already: result?.status === 'already',
          status: result?.status ?? 'created',
          confirmationCode: result?.confirmationCode,
          tx: txSignature,
          receipt: receiptPubkey,
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
        } else if (msg.includes('既に受給済み')) {
          setError('このウォレットは現在期間のオンチェーン配布を受給済みです。次回期間までお待ちください。');
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
    getTicketByEventId,
    clearUser,
    router,
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
              オンチェーン記録のため、先にPhantomウォレット接続が必要です
            </AppText>
            <Button
              title="Phantomを接続する"
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
              (showPinInput && !walletReady)
            }
          />
          {!showPinInput && event && event.state === 'published' && walletReady && (
            <AppText variant="small" style={styles.actionHint}>
              PINを入力して参加を確定します
            </AppText>
          )}
          {!walletReady && (
            <AppText variant="small" style={styles.actionHint}>
              Phantom接続後に参加を確定できます
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
