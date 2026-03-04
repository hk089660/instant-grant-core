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
import { submitSchoolClaim } from '../../src/api/schoolClaim';
import { consumePhantomWebUserOnchainSyncContext } from '../../src/utils/phantomWebUserOnchainSync';
import { consumePhantomWebWalletOnchainSyncContext } from '../../src/utils/phantomWebWalletOnchainSync';
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

function isUserConfirmReturnPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, 'https://wene.local');
    return parsed.pathname.replace(/\/+$/, '') === '/u/confirm';
  } catch {
    return false;
  }
}

function parseCampaignIdFromReturnPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://wene.local');
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    const match = normalizedPath.match(/^\/r\/(?:school\/)?([^/]+)$/);
    if (!match) return null;
    const campaignId = decodeURIComponent(match[1] ?? '').trim();
    return campaignId || null;
  } catch {
    return null;
  }
}

function isWalletReceiveReturnPath(path: string): boolean {
  return parseCampaignIdFromReturnPath(path) !== null;
}

function buildExplorerTxUrl(txSignature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(txSignature)}?cluster=devnet`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function deriveWalletAddressFromSignedTx(tx: {
  feePayer?: { toBase58: () => string } | null;
  signatures?: Array<{ publicKey?: { toBase58: () => string } | null }>;
}): string | undefined {
  const fromFeePayer = normalizeOptionalString(tx.feePayer?.toBase58());
  if (fromFeePayer) return fromFeePayer;
  if (Array.isArray(tx.signatures)) {
    for (const signatureEntry of tx.signatures) {
      const candidate = normalizeOptionalString(signatureEntry.publicKey?.toBase58());
      if (candidate) return candidate;
    }
  }
  return undefined;
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
              const fallbackWalletAddressFromTx = deriveWalletAddressFromSignedTx(processed.tx);
              const recipientStore = useRecipientStore.getState();
              recipientStore.setLastSignature(signature);
              recipientStore.setLastDoneAt(Date.now());
              recipientStore.setState('Done');

              // same-tab 復帰では元画面の Promise が失われる場合があるため、
              // callback 側でチケット反映と監査同期を完了させる。
              const eventIdFromReturnPath = parseEventIdFromReturnPath(returnPath);
              const campaignIdFromReturnPath = parseCampaignIdFromReturnPath(returnPath);
              const userSyncContext = consumePhantomWebUserOnchainSyncContext({
                eventId: eventIdFromReturnPath ?? undefined,
              });
              const walletSyncContext = consumePhantomWebWalletOnchainSyncContext({
                campaignId: campaignIdFromReturnPath ?? undefined,
              });
              const hasUserReturnPath = isUserConfirmReturnPath(returnPath);
              const hasWalletReturnPath = isWalletReceiveReturnPath(returnPath);
              const eventId = eventIdFromReturnPath ?? userSyncContext?.eventId ?? null;
              const campaignId = campaignIdFromReturnPath ?? walletSyncContext?.campaignId ?? null;
              const shouldHandleUser =
                (hasUserReturnPath && Boolean(eventId)) ||
                (!hasWalletReturnPath && Boolean(eventId));
              const shouldHandleWallet =
                (!shouldHandleUser && hasWalletReturnPath && Boolean(campaignId)) ||
                (!shouldHandleUser && !hasUserReturnPath && Boolean(campaignId));

              if (shouldHandleUser && eventId) {
                const resolvedUserSyncContext =
                  userSyncContext && userSyncContext.eventId === eventId
                    ? userSyncContext
                    : null;
                const ticketStore = useRecipientTicketStore.getState();
                if (resolvedUserSyncContext?.userId && ticketStore.activeUserId !== resolvedUserSyncContext.userId) {
                  await ticketStore.setActiveUser(resolvedUserSyncContext.userId);
                }
                const scopedTicketStore = useRecipientTicketStore.getState();
                const existing = scopedTicketStore.getTicketByEventId(eventId);

                let syncedClaimResult: Awaited<ReturnType<typeof claimEventWithUser>> | null = null;
                if (resolvedUserSyncContext) {
                  const syncWalletAddress =
                    resolvedUserSyncContext.walletAddress ??
                    recipientStore.walletPubkey ??
                    fallbackWalletAddressFromTx ??
                    undefined;
                  const syncConfirmationCode =
                    resolvedUserSyncContext.confirmationCode ??
                    existing?.confirmationCode;
                  const syncReceiptPubkey =
                    resolvedUserSyncContext.receiptPubkey ??
                    existing?.receiptPubkey;
                  let lastSyncError: unknown = null;
                  try {
                    for (let attempt = 0; attempt < 2; attempt += 1) {
                      try {
                        syncedClaimResult = await claimEventWithUser(
                          eventId,
                          resolvedUserSyncContext.userId,
                          resolvedUserSyncContext.pin,
                          {
                            walletAddress: syncWalletAddress,
                            confirmationCode: syncConfirmationCode,
                            txSignature: signature,
                            receiptPubkey: syncReceiptPubkey,
                          }
                        );
                        break;
                      } catch (syncErr) {
                        lastSyncError = syncErr;
                        if (attempt === 0) {
                          await sleep(250);
                        }
                      }
                    }
                  } catch (syncErr) {
                    lastSyncError = syncErr;
                  }
                  if (!syncedClaimResult && lastSyncError) {
                    console.warn('[phantom callback] failed to sync user on-chain proof:', lastSyncError);
                  }
                }

                const receiptPubkey =
                  syncedClaimResult?.receiptPubkey ??
                  existing?.receiptPubkey ??
                  resolvedUserSyncContext?.receiptPubkey;
                const confirmationCode =
                  syncedClaimResult?.confirmationCode ??
                  existing?.confirmationCode ??
                  resolvedUserSyncContext?.confirmationCode;
                const auditReceiptId =
                  syncedClaimResult?.ticketReceipt?.receiptId ??
                  existing?.auditReceiptId ??
                  resolvedUserSyncContext?.auditReceiptId;
                const auditReceiptHash =
                  syncedClaimResult?.ticketReceipt?.receiptHash ??
                  existing?.auditReceiptHash ??
                  resolvedUserSyncContext?.auditReceiptHash;
                const mintAddress = existing?.mintAddress ?? resolvedUserSyncContext?.mintAddress;
                const popEntryHash = existing?.popEntryHash ?? resolvedUserSyncContext?.popEntryHash;
                const popAuditHash = existing?.popAuditHash ?? resolvedUserSyncContext?.popAuditHash;
                const popSigner = existing?.popSigner ?? resolvedUserSyncContext?.popSigner;
                const explorerTxUrl = syncedClaimResult?.explorerTxUrl ?? buildExplorerTxUrl(signature);

                await scopedTicketStore.addTicket({
                  eventId,
                  eventName: existing?.eventName ?? resolvedUserSyncContext?.eventName ?? eventId,
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

              if (shouldHandleWallet && campaignId) {
                const resolvedWalletSyncContext =
                  walletSyncContext && walletSyncContext.campaignId === campaignId
                    ? walletSyncContext
                    : null;
                const ticketStore = useRecipientTicketStore.getState();
                const existing = ticketStore.getTicketByEventId(campaignId);
                const walletAddress =
                  resolvedWalletSyncContext?.walletAddress ??
                  recipientStore.walletPubkey ??
                  fallbackWalletAddressFromTx ??
                  undefined;
                const receiptPubkeyCandidate =
                  resolvedWalletSyncContext?.receiptPubkey ??
                  existing?.receiptPubkey ??
                  undefined;

                let syncedClaimResult: Awaited<ReturnType<typeof submitSchoolClaim>> | null = null;
                let lastSyncError: unknown = null;
                for (let attempt = 0; attempt < 2; attempt += 1) {
                  try {
                    const syncCandidate = await submitSchoolClaim(campaignId, {
                      walletAddress,
                      txSignature: signature,
                      receiptPubkey: receiptPubkeyCandidate,
                    });
                    if (syncCandidate.success) {
                      syncedClaimResult = syncCandidate;
                      break;
                    }
                    lastSyncError = syncCandidate.error;
                  } catch (syncErr) {
                    lastSyncError = syncErr;
                  }
                  if (attempt === 0) {
                    await sleep(250);
                  }
                }
                if (!syncedClaimResult && lastSyncError) {
                  console.warn('[phantom callback] failed to sync wallet on-chain proof:', lastSyncError);
                }

                const syncedReceiptPubkey =
                  syncedClaimResult && syncedClaimResult.success
                    ? syncedClaimResult.receiptPubkey
                    : undefined;
                const syncedConfirmationCode =
                  syncedClaimResult && syncedClaimResult.success
                    ? syncedClaimResult.confirmationCode
                    : undefined;
                const syncedAuditReceiptId =
                  syncedClaimResult && syncedClaimResult.success
                    ? syncedClaimResult.ticketReceipt?.receiptId
                    : undefined;
                const syncedAuditReceiptHash =
                  syncedClaimResult && syncedClaimResult.success
                    ? syncedClaimResult.ticketReceipt?.receiptHash
                    : undefined;

                await ticketStore.addTicket({
                  eventId: campaignId,
                  eventName: existing?.eventName ?? resolvedWalletSyncContext?.eventName ?? campaignId,
                  joinedAt: Date.now(),
                  txSignature: signature,
                  receiptPubkey: syncedReceiptPubkey ?? receiptPubkeyCandidate,
                  mintAddress: existing?.mintAddress ?? resolvedWalletSyncContext?.mintAddress,
                  confirmationCode:
                    syncedConfirmationCode ??
                    existing?.confirmationCode ??
                    resolvedWalletSyncContext?.confirmationCode,
                  auditReceiptId:
                    syncedAuditReceiptId ??
                    existing?.auditReceiptId ??
                    resolvedWalletSyncContext?.auditReceiptId,
                  auditReceiptHash:
                    syncedAuditReceiptHash ??
                    existing?.auditReceiptHash ??
                    resolvedWalletSyncContext?.auditReceiptHash,
                });
                setSafeStatus('done', '署名と送信が完了しました。画面へ戻ります…');
                setTimeout(() => {
                  if (cancelled) return;
                  router.replace(returnPath as any);
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
