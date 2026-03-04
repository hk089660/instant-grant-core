import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button, Loading } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';
import { processPhantomUrl } from '../../src/utils/phantomDeeplinkListener';
import { rejectPendingSignTx } from '../../src/utils/phantomSignTxPending';
import { consumePhantomWebReturnPath } from '../../src/utils/phantomWebReturnPath';
import { sendSignedTx } from '../../src/solana/sendTx';
import { useRecipientStore } from '../../src/store/recipientStore';
import { useRecipientTicketStore } from '../../src/store/recipientTicketStore';
import { schoolRoutes } from '../../src/lib/schoolRoutes';
import { claimEventWithUser } from '../../src/api/userApi';
import { consumePhantomWebUserOnchainSyncContext } from '../../src/utils/phantomWebUserOnchainSync';
import {
  publishPhantomWebSignError,
  publishPhantomWebSignSuccess,
} from '../../src/utils/phantomWebSignBridge';

const SAFE_TIMEOUT_MS = 10_000;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildPhantomDeepLinkFromParams(params: Record<string, string | string[] | undefined>): string | null {
  const actionRaw = firstParam(params.action);
  if (!actionRaw) return null;
  const query = Object.entries(params)
    .filter(([key, value]) => key !== 'action' && value != null)
    .map(([key, value]) => {
      const v = firstParam(value);
      if (v == null) return null;
      return `${encodeURIComponent(key)}=${encodeURIComponent(v)}`;
    })
    .filter((line): line is string => Boolean(line))
    .join('&');

  return query ? `wene://phantom/${actionRaw}?${query}` : `wene://phantom/${actionRaw}`;
}

function parseEventIdFromReturnPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://wene.local');
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    if (normalizedPath !== '/u/confirm') return null;
    const eventId = parsed.searchParams.get('eventId')?.trim() ?? '';
    return eventId || null;
  } catch {
    return null;
  }
}

function buildExplorerTxUrl(txSignature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(txSignature)}?cluster=devnet`;
}

export default function PhantomRedirectScreen() {
  const rawParams = useLocalSearchParams();
  const params = rawParams as Record<string, string | string[] | undefined>;
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('Phantomコールバックを処理しています…');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const action = useMemo(() => firstParam(params.action) ?? '', [params.action]);
  const fallbackUrlFromParams = useMemo(() => buildPhantomDeepLinkFromParams(params), [params]);
  const returnPath = useMemo(() => {
    const defaultPath = action.startsWith('connect') ? '/wallet' : '/u';
    if (Platform.OS === 'web') {
      return consumePhantomWebReturnPath() ?? defaultPath;
    }
    return defaultPath;
  }, [action]);

  useEffect(() => {
    let cancelled = false;

    const setSafeStatus = (next: 'loading' | 'done' | 'error', msg?: string) => {
      if (cancelled) return;
      setStatus(next);
      if (msg != null) setMessage(msg);
    };

    const process = async () => {
      timeoutRef.current = setTimeout(() => {
        const timeoutMsg = 'コールバック処理がタイムアウトしました。もう一度署名を実行してください。';
        if (action.startsWith('sign')) {
          rejectPendingSignTx(new Error(timeoutMsg));
        }
        setSafeStatus('error', timeoutMsg);
      }, SAFE_TIMEOUT_MS);

      try {
        let handled = false;
        let processed:
          | Awaited<ReturnType<typeof processPhantomUrl>>
          | null = null;

        if (fallbackUrlFromParams?.includes('wene://phantom/')) {
          processed = await processPhantomUrl(fallbackUrlFromParams, 'initial');
          handled = true;
        }

        if (!handled) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && initialUrl.startsWith('wene://phantom/')) {
            processed = await processPhantomUrl(initialUrl, 'initial');
            handled = true;
          }
        }

        if (!handled) {
          const msg = 'PhantomのコールバックURLを取得できませんでした。署名を再試行してください。';
          if (action.startsWith('sign')) {
            rejectPendingSignTx(new Error(msg));
          }
          setSafeStatus('error', msg);
          return;
        }

        if (action.startsWith('sign') && Platform.OS === 'web' && processed?.kind === 'sign') {
          if (!processed.ok) {
            publishPhantomWebSignError(processed.error);
            setSafeStatus('error', processed.error);
            return;
          }

          const hasOpener =
            typeof window !== 'undefined' &&
            Boolean(window.opener) &&
            !window.opener.closed;

          if (hasOpener) {
            publishPhantomWebSignSuccess(processed.tx);
          } else {
            try {
              setSafeStatus('loading', '署名済みトランザクションを送信しています…');
              const signature = await sendSignedTx(processed.tx);
              const recipientStore = useRecipientStore.getState();
              recipientStore.setLastSignature(signature);
              recipientStore.setLastDoneAt(Date.now());
              recipientStore.setState('Done');

              // same-tab 復帰では元画面の Promise が失われる場合があるため、
              // callback 側でチケット反映と成功画面遷移を完了させる。
              const eventIdFromReturnPath = parseEventIdFromReturnPath(returnPath);
              const syncContext = consumePhantomWebUserOnchainSyncContext({
                eventId: eventIdFromReturnPath ?? undefined,
              });
              const eventId = eventIdFromReturnPath ?? syncContext?.eventId ?? null;
              if (eventId) {
                const ticketStore = useRecipientTicketStore.getState();
                if (syncContext?.userId && ticketStore.activeUserId !== syncContext.userId) {
                  await ticketStore.setActiveUser(syncContext.userId);
                }
                const scopedTicketStore = useRecipientTicketStore.getState();
                const existing = scopedTicketStore.getTicketByEventId(eventId);

                let syncedClaimResult: Awaited<ReturnType<typeof claimEventWithUser>> | null = null;
                if (syncContext) {
                  try {
                    syncedClaimResult = await claimEventWithUser(
                      eventId,
                      syncContext.userId,
                      syncContext.pin,
                      {
                        walletAddress: syncContext.walletAddress,
                        txSignature: signature,
                        receiptPubkey: syncContext.receiptPubkey,
                      }
                    );
                  } catch (syncErr) {
                    console.warn('[phantom callback] failed to sync user on-chain proof:', syncErr);
                  }
                }

                const receiptPubkey =
                  syncedClaimResult?.receiptPubkey ??
                  existing?.receiptPubkey ??
                  syncContext?.receiptPubkey;
                const confirmationCode =
                  syncedClaimResult?.confirmationCode ??
                  existing?.confirmationCode ??
                  syncContext?.confirmationCode;
                const auditReceiptId =
                  syncedClaimResult?.ticketReceipt?.receiptId ??
                  existing?.auditReceiptId ??
                  syncContext?.auditReceiptId;
                const auditReceiptHash =
                  syncedClaimResult?.ticketReceipt?.receiptHash ??
                  existing?.auditReceiptHash ??
                  syncContext?.auditReceiptHash;
                const mintAddress = existing?.mintAddress ?? syncContext?.mintAddress;
                const popEntryHash = existing?.popEntryHash ?? syncContext?.popEntryHash;
                const popAuditHash = existing?.popAuditHash ?? syncContext?.popAuditHash;
                const popSigner = existing?.popSigner ?? syncContext?.popSigner;
                const explorerTxUrl = syncedClaimResult?.explorerTxUrl ?? buildExplorerTxUrl(signature);

                await scopedTicketStore.addTicket({
                  eventId,
                  eventName: existing?.eventName ?? syncContext?.eventName ?? eventId,
                  joinedAt: Date.now(),
                  txSignature: signature,
                  receiptPubkey,
                  confirmationCode,
                  mintAddress,
                  popEntryHash,
                  popAuditHash,
                  popSigner,
                  auditReceiptId,
                  auditReceiptHash,
                });
                setSafeStatus('done', '署名と送信が完了しました。結果画面へ移動します…');
                setTimeout(() => {
                  if (cancelled) return;
                  router.replace(
                    schoolRoutes.success(eventId, {
                      tx: signature,
                      explorerTxUrl,
                      receipt: receiptPubkey,
                      confirmationCode,
                      mint: mintAddress,
                      popEntryHash,
                      popAuditHash,
                      popSigner,
                      auditReceiptId,
                      auditReceiptHash,
                    }) as any
                  );
                }, 200);
                return;
              }
            } catch (sendErr) {
              const msg = sendErr instanceof Error ? sendErr.message : '署名後の送信に失敗しました';
              publishPhantomWebSignError(msg);
              setSafeStatus('error', msg);
              return;
            }
          }
        }

        if (processed && !processed.ok) {
          setSafeStatus('error', processed.error);
          return;
        }

        const doneMessage = action.startsWith('connect')
          ? 'ウォレット接続が完了しました。画面に戻ります…'
          : action.startsWith('sign')
            ? '署名が完了しました。画面に戻ります…'
            : 'コールバック処理が完了しました。画面に戻ります…';
        setSafeStatus('done', doneMessage);
        setTimeout(() => {
          if (cancelled) return;
          if (
            Platform.OS === 'web' &&
            action.startsWith('sign') &&
            typeof window !== 'undefined' &&
            window.opener &&
            !window.opener.closed
          ) {
            setSafeStatus('done', '署名結果を送信しました。このウィンドウは次の署名で再利用されます。');
            return;
          }
          router.replace(returnPath as any);
        }, 200);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'コールバック処理に失敗しました。';
        if (action.startsWith('sign')) {
          rejectPendingSignTx(new Error(msg));
        }
        setSafeStatus('error', msg);
      } finally {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    process();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [action, fallbackUrlFromParams, router, returnPath]);

  return (
    <View style={styles.container}>
      {status === 'loading' ? (
        <Loading message={message} />
      ) : status === 'done' ? (
        <AppText variant="body" style={styles.message}>
          {message}
        </AppText>
      ) : (
        <View style={styles.errorWrap}>
          <AppText variant="h3" style={styles.title}>
            処理に失敗しました
          </AppText>
          <AppText variant="body" style={styles.message}>
            {message}
          </AppText>
          <Button
            title="参加画面へ戻る"
            onPress={() => router.replace(returnPath as any)}
            variant="secondary"
            style={styles.button}
          />
          <Button
            title="ホームへ戻る"
            onPress={() => router.replace('/' as any)}
            variant="secondary"
            style={styles.button}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  errorWrap: {
    width: '100%',
    maxWidth: 420,
  },
  title: {
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  button: {
    marginTop: theme.spacing.xs,
  },
});
