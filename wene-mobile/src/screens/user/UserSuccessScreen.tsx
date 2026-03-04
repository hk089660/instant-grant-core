import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity, Animated, Easing, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { Ionicons } from '@expo/vector-icons';
import { setCompleted } from '../../data/participationStore';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';
import { useRecipientTicketStore } from '../../store/recipientTicketStore';
import { useRecipientStore } from '../../store/recipientStore';
import { useAuth } from '../../contexts/AuthContext';
import { getSchoolDeps } from '../../api/createSchoolDeps';
import type { SchoolEvent } from '../../types/school';
import { copyTextWithFeedback } from '../../utils/copyText';
import {
  fetchExpectedPopSignerPubkeyFromRuntime,
  fetchPopConfigReadiness,
} from '../../solana/popConfigReadiness';

function shortenCode(value: string, head = 8, tail = 8): string {
  const normalized = value.trim();
  if (!normalized) return '-';
  if (normalized.length <= head + tail + 1) return normalized;
  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type OnchainTxTab = 'tx_hash' | 'explorer';

type OnchainTxHistoryItem = {
  txSignature: string;
  receiptPubkey?: string;
  claimedAt: number;
  txExplorerUrl: string;
};

function normalizeOnchainTxHistory(
  candidates: Array<{ txSignature?: string; receiptPubkey?: string; claimedAt?: number }>
): OnchainTxHistoryItem[] {
  const deduped = new Map<string, { txSignature: string; receiptPubkey?: string; claimedAt: number }>();
  for (const candidate of candidates) {
    const txSignature = candidate.txSignature?.trim();
    if (!txSignature) continue;
    const receiptPubkey = candidate.receiptPubkey?.trim() || undefined;
    const claimedAt = Number.isFinite(candidate.claimedAt) ? (candidate.claimedAt as number) : 0;
    const existing = deduped.get(txSignature);
    if (!existing) {
      deduped.set(txSignature, {
        txSignature,
        receiptPubkey,
        claimedAt,
      });
      continue;
    }
    deduped.set(txSignature, {
      txSignature,
      receiptPubkey: existing.receiptPubkey ?? receiptPubkey,
      claimedAt: Math.max(existing.claimedAt, claimedAt),
    });
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.claimedAt - a.claimedAt)
    .map((item) => ({
      ...item,
      txExplorerUrl: `https://explorer.solana.com/tx/${item.txSignature}?cluster=devnet`,
    }));
}

export const UserSuccessScreen: React.FC = () => {
  const router = useRouter();
  const { userId } = useAuth();
  const walletPubkey = useRecipientStore((s) => s.walletPubkey);
  const { eventId: targetEventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });
  const {
    tx,
    receipt,
    already,
    confirmationCode,
    status,
    mint,
    reflected,
    onchainBlocked,
    popEntryHash: popEntryHashRaw,
    popAuditHash: popAuditHashRaw,
    popSigner: popSignerRaw,
    auditReceiptId: auditReceiptIdRaw,
    auditReceiptHash: auditReceiptHashRaw,
  } = useLocalSearchParams<{
    tx?: string | string[];
    receipt?: string | string[];
    already?: string | string[];
    confirmationCode?: string | string[];
    status?: string | string[];
    mint?: string | string[];
    reflected?: string | string[];
    onchainBlocked?: string | string[];
    popEntryHash?: string | string[];
    popAuditHash?: string | string[];
    popSigner?: string | string[];
    auditReceiptId?: string | string[];
    auditReceiptHash?: string | string[];
  }>();

  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const [onchainReadinessChecked, setOnchainReadinessChecked] = useState(false);
  const [onchainReady, setOnchainReady] = useState<boolean>(false);
  const [onchainUnavailableReason, setOnchainUnavailableReason] = useState<string | null>(null);
  const [onchainTxTab, setOnchainTxTab] = useState<OnchainTxTab>('tx_hash');
  const { addTicket, getTicketByEventId } = useRecipientTicketStore();
  const txParam = firstParam(tx);
  const receiptParam = firstParam(receipt);
  const alreadyParam = firstParam(already);
  const statusParam = firstParam(status);
  const confirmationCodeParam = firstParam(confirmationCode);
  const mintParam = firstParam(mint);
  const reflectedParam = firstParam(reflected);
  const onchainBlockedParam = firstParam(onchainBlocked);
  const popEntryHashParam = firstParam(popEntryHashRaw);
  const popAuditHashParam = firstParam(popAuditHashRaw);
  const popSignerParam = firstParam(popSignerRaw);
  const auditReceiptIdParam = firstParam(auditReceiptIdRaw);
  const auditReceiptHashParam = firstParam(auditReceiptHashRaw);
  const txSignature = typeof txParam === 'string' && txParam.trim() ? txParam.trim() : undefined;
  const receiptPubkey = typeof receiptParam === 'string' && receiptParam.trim() ? receiptParam.trim() : undefined;
  const mintAddress = typeof mintParam === 'string' && mintParam.trim() ? mintParam.trim() : undefined;
  const popEntryHash = typeof popEntryHashParam === 'string' && popEntryHashParam.trim() ? popEntryHashParam.trim() : undefined;
  const popAuditHash = typeof popAuditHashParam === 'string' && popAuditHashParam.trim() ? popAuditHashParam.trim() : undefined;
  const popSigner = typeof popSignerParam === 'string' && popSignerParam.trim() ? popSignerParam.trim() : undefined;
  const auditReceiptId =
    typeof auditReceiptIdParam === 'string' && auditReceiptIdParam.trim() ? auditReceiptIdParam.trim() : undefined;
  const auditReceiptHash =
    typeof auditReceiptHashParam === 'string' && auditReceiptHashParam.trim() ? auditReceiptHashParam.trim() : undefined;
  const reflectedOnchain = reflectedParam === '1';
  const onchainBlockedByPeriod = onchainBlockedParam === '1';
  const storedTicket = targetEventId ? getTicketByEventId(targetEventId) : undefined;
  const fallbackTx = txSignature ?? storedTicket?.txSignature;
  const fallbackReceipt = receiptPubkey ?? storedTicket?.receiptPubkey;
  const resolvedMintAddress = mintAddress ?? storedTicket?.mintAddress;
  const resolvedConfirmationCode =
    (typeof confirmationCodeParam === 'string' && confirmationCodeParam.trim() ? confirmationCodeParam.trim() : undefined) ??
    storedTicket?.confirmationCode;
  const resolvedAuditReceiptId = auditReceiptId ?? storedTicket?.auditReceiptId;
  const resolvedAuditReceiptHash = auditReceiptHash ?? storedTicket?.auditReceiptHash;
  const resolvedPopEntryHash = popEntryHash ?? storedTicket?.popEntryHash;
  const resolvedPopAuditHash = popAuditHash ?? storedTicket?.popAuditHash;
  const resolvedPopSigner = popSigner ?? storedTicket?.popSigner;
  const isWalletConnected = Boolean(walletPubkey);
  const isUserLoggedIn = Boolean(userId);
  const txParamClaimedAt = useRef(Date.now()).current;
  const onchainTxHistory = useMemo(
    () =>
      normalizeOnchainTxHistory([
        ...(storedTicket?.onchainReceipts ?? []),
        {
          txSignature: storedTicket?.txSignature,
          receiptPubkey: storedTicket?.receiptPubkey,
          claimedAt: storedTicket?.joinedAt,
        },
        {
          txSignature,
          receiptPubkey,
          claimedAt: txParamClaimedAt,
        },
      ]),
    [
      storedTicket?.onchainReceipts,
      storedTicket?.txSignature,
      storedTicket?.receiptPubkey,
      storedTicket?.joinedAt,
      txSignature,
      receiptPubkey,
      txParamClaimedAt,
    ]
  );
  const resolvedTx = onchainTxHistory[0]?.txSignature ?? fallbackTx;
  const resolvedReceipt = onchainTxHistory[0]?.receiptPubkey ?? fallbackReceipt;
  const checkScale = useRef(new Animated.Value(0.7)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.75)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!targetEventId) return;
    setCompleted(targetEventId, userId).catch(() => { });
  }, [targetEventId, userId]);

  useEffect(() => {
    checkScale.setValue(0.7);
    checkOpacity.setValue(0);
    ringScale.setValue(0.75);
    ringOpacity.setValue(0);
    glowOpacity.setValue(0);

    const animation = Animated.parallel([
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(90),
        Animated.timing(ringOpacity, {
          toValue: 0.45,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.38,
            duration: 620,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 620,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.2,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.04,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start();
    return () => animation.stop();
  }, [checkScale, checkOpacity, ringScale, ringOpacity, glowOpacity]);

  // イベント情報を取得して表示 & ストアに追加
  useEffect(() => {
    if (!targetEventId) return;
    let cancelled = false;
    getSchoolDeps()
      .eventProvider.getById(targetEventId)
      .then((ev) => {
        if (!cancelled && ev) {
          setEvent(ev);
          // ストアに参加チケットを追加して一覧に反映
          addTicket({
            eventId: ev.id,
            eventName: ev.title,
            joinedAt: Date.now(),
            txSignature: resolvedTx,
            receiptPubkey: resolvedReceipt,
            popEntryHash: resolvedPopEntryHash,
            popAuditHash: resolvedPopAuditHash,
            popSigner: resolvedPopSigner,
            mintAddress: resolvedMintAddress,
            confirmationCode: resolvedConfirmationCode,
            auditReceiptId: resolvedAuditReceiptId,
            auditReceiptHash: resolvedAuditReceiptHash,
          });
        }
      })
      .catch(() => { if (!cancelled) setEvent(null); });
    return () => { cancelled = true; };
  }, [
    targetEventId,
    addTicket,
    resolvedTx,
    resolvedReceipt,
    resolvedPopEntryHash,
    resolvedPopAuditHash,
    resolvedPopSigner,
    resolvedMintAddress,
    resolvedConfirmationCode,
    resolvedAuditReceiptId,
    resolvedAuditReceiptHash,
  ]);

  const isAlready = alreadyParam === '1' || statusParam === 'already';
  const explorerTxUrl = onchainTxHistory[0]?.txExplorerUrl ?? (resolvedTx ? `https://explorer.solana.com/tx/${resolvedTx}?cluster=devnet` : null);
  const explorerReceiptUrl = resolvedReceipt ? `https://explorer.solana.com/address/${resolvedReceipt}?cluster=devnet` : null;
  const explorerMintUrl = resolvedMintAddress ? `https://explorer.solana.com/address/${resolvedMintAddress}?cluster=devnet` : null;
  const hasOffchainReceipt = Boolean(
    resolvedConfirmationCode || resolvedAuditReceiptId || resolvedAuditReceiptHash
  );
  const hasOnchainReceipt = onchainTxHistory.length > 0;
  const eventSupportsOnchainReceive = Boolean(
    event?.solanaMint && event?.solanaAuthority && event?.solanaGrantId
  );
  useEffect(() => {
    let cancelled = false;
    const authority = event?.solanaAuthority?.trim() ?? '';
    if (!eventSupportsOnchainReceive || !authority) {
      setOnchainReadinessChecked(false);
      setOnchainReady(false);
      setOnchainUnavailableReason(null);
      return () => {
        cancelled = true;
      };
    }

    setOnchainReadinessChecked(false);
    setOnchainReady(false);
    setOnchainUnavailableReason(null);
    fetchExpectedPopSignerPubkeyFromRuntime()
      .then((expectedSignerPubkey) => fetchPopConfigReadiness(authority, { expectedSignerPubkey }))
      .then((status) => {
        if (cancelled) return;
        setOnchainReadinessChecked(true);
        setOnchainReady(status.ready);
        if (status.ready) {
          setOnchainUnavailableReason(null);
          return;
        }
        if (status.reason === 'missing') {
          setOnchainUnavailableReason('このイベントのPoP設定が未初期化です。運営に再発行を依頼してください。');
          return;
        }
        if (status.reason === 'owner_mismatch') {
          setOnchainUnavailableReason('このイベントのPoP設定が不整合です。運営に再発行を依頼してください。');
          return;
        }
        if (status.reason === 'signer_mismatch') {
          setOnchainUnavailableReason('このイベントのPoP署名鍵が旧設定です。運営に再発行を依頼してください。');
          return;
        }
        setOnchainUnavailableReason('オンチェーン受け取りの準備状態を確認できませんでした。時間をおいて再試行してください。');
      })
      .catch(() => {
        if (cancelled) return;
        setOnchainReadinessChecked(true);
        setOnchainReady(false);
        setOnchainUnavailableReason('オンチェーン受け取りの準備状態を確認できませんでした。時間をおいて再試行してください。');
      });

    return () => {
      cancelled = true;
    };
  }, [event?.solanaAuthority, eventSupportsOnchainReceive]);
  const showOnchainReceiveCard = Boolean(
    targetEventId &&
    hasOffchainReceipt &&
    !hasOnchainReceipt &&
    eventSupportsOnchainReceive &&
    onchainReadinessChecked &&
    onchainReady
  );
  const showOnchainReadinessChecking = Boolean(
    targetEventId &&
    hasOffchainReceipt &&
    !hasOnchainReceipt &&
    eventSupportsOnchainReceive &&
    !onchainReadinessChecked
  );
  const showOnchainUnavailableCard = Boolean(
    targetEventId &&
    hasOffchainReceipt &&
    !hasOnchainReceipt &&
    eventSupportsOnchainReceive &&
    onchainReadinessChecked &&
    !onchainReady
  );
  useEffect(() => {
    if (onchainTxHistory.length === 0 && onchainTxTab !== 'tx_hash') {
      setOnchainTxTab('tx_hash');
    }
  }, [onchainTxHistory.length, onchainTxTab]);

  const handleCopyPopProof = useCallback(async () => {
    const payload = [
      'PoP Proof',
      `eventId: ${targetEventId ?? '-'}`,
      `signer: ${resolvedPopSigner ?? '-'}`,
      `entry_hash: ${resolvedPopEntryHash ?? '-'}`,
      `audit_hash: ${resolvedPopAuditHash ?? '-'}`,
    ].join('\n');

    await copyTextWithFeedback(payload, {
      successMessage: 'PoP証跡をコピーしました',
    });
  }, [targetEventId, resolvedPopSigner, resolvedPopEntryHash, resolvedPopAuditHash]);

  const handleCopyAuditReceipt = useCallback(async () => {
    const payload = [
      'Participation Audit Receipt',
      `eventId: ${targetEventId ?? '-'}`,
      `confirmation_code: ${resolvedConfirmationCode ?? '-'}`,
      `receipt_id: ${resolvedAuditReceiptId ?? '-'}`,
      `receipt_hash: ${resolvedAuditReceiptHash ?? '-'}`,
      'verify_api: /api/audit/receipts/verify-code',
    ].join('\n');

    await copyTextWithFeedback(payload, {
      successMessage: '監査レシート情報をコピーしました',
    });
  }, [targetEventId, resolvedConfirmationCode, resolvedAuditReceiptId, resolvedAuditReceiptHash]);

  const handleNavigateOnchainReceive = useCallback(() => {
    if (!targetEventId) return;
    if (!isUserLoggedIn) {
      router.push(schoolRoutes.login as any);
      return;
    }
    router.push(schoolRoutes.confirm(targetEventId, { mode: 'onchain' }) as any);
  }, [targetEventId, isUserLoggedIn, router]);

  const handleConnectWallet = useCallback(() => {
    router.push('/wallet' as any);
  }, [router]);

  if (!isValid) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconWrap}>
          <View style={styles.checkAnimFrame}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.checkRing,
                {
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.checkGlow, { opacity: glowOpacity }]}
            />
            <Animated.View
              style={[
                styles.checkBadge,
                {
                  opacity: checkOpacity,
                  transform: [{ scale: checkScale }],
                },
              ]}
            >
              <Ionicons name="checkmark" size={34} color="#ffffff" />
            </Animated.View>
          </View>
        </View>

        <AppText variant="h2" style={styles.title}>
          {isAlready ? '参加済み' : '参加完了！'}
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          {isAlready ? '既に参加登録済みです' : '参加が正常に記録されました'}
        </AppText>

        {/* イベント情報 */}
        {event && (
          <Card style={styles.eventCard}>
            <AppText variant="h3">{event.title}</AppText>
            <AppText variant="caption" style={styles.eventMeta}>{event.datetime}</AppText>
            <AppText variant="caption" style={styles.eventMeta}>主催: {event.host}</AppText>
          </Card>
        )}

        {/* 優先表示: 監査レシート */}
        {(resolvedAuditReceiptId || resolvedAuditReceiptHash) && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              監査レシート（参加券）
            </AppText>
            {resolvedAuditReceiptId && (
              <AppText variant="small" style={styles.value}>
                receipt_id: {shortenCode(resolvedAuditReceiptId)}
              </AppText>
            )}
            {resolvedAuditReceiptHash && (
              <AppText variant="small" style={styles.value}>
                receipt_hash: {shortenCode(resolvedAuditReceiptHash)}
              </AppText>
            )}
            <AppText variant="small" style={styles.codeHint}>
              第三者は verify-code API で監査チェーン整合性を検証できます。
            </AppText>
            <Button
              title="監査レシートをコピー"
              variant="secondary"
              size="medium"
              onPress={handleCopyAuditReceipt}
              style={styles.copyButton}
            />
          </Card>
        )}

        {/* Solana オンチェーン受け取り履歴（受け取り済み時は最優先で表示） */}
        {onchainTxHistory.length > 0 && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              オンチェーン受け取り署名
            </AppText>
            <View style={styles.onchainTabs}>
              <TouchableOpacity
                onPress={() => setOnchainTxTab('tx_hash')}
                style={[styles.onchainTabButton, onchainTxTab === 'tx_hash' && styles.onchainTabButtonActive]}
              >
                <AppText
                  variant="small"
                  style={[styles.onchainTabLabel, onchainTxTab === 'tx_hash' && styles.onchainTabLabelActive]}
                >
                  tx hash
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setOnchainTxTab('explorer')}
                style={[styles.onchainTabButton, onchainTxTab === 'explorer' && styles.onchainTabButtonActive]}
              >
                <AppText
                  variant="small"
                  style={[styles.onchainTabLabel, onchainTxTab === 'explorer' && styles.onchainTabLabelActive]}
                >
                  explorer
                </AppText>
              </TouchableOpacity>
            </View>
            <View style={styles.onchainTabPanel}>
              {onchainTxTab === 'tx_hash'
                ? onchainTxHistory.map((item) => (
                    <View key={item.txSignature} style={styles.onchainCompactRow}>
                      <AppText variant="small" style={styles.onchainCompactMono}>
                        {shortenCode(item.txSignature, 10, 8)}
                      </AppText>
                    </View>
                  ))
                : onchainTxHistory.map((item, idx) => (
                    <TouchableOpacity
                      key={item.txSignature}
                      onPress={() => Linking.openURL(item.txExplorerUrl)}
                      style={styles.onchainExplorerRow}
                    >
                      <AppText variant="small" style={styles.onchainExplorerLabel}>
                        #{idx + 1} {shortenCode(item.txSignature, 7, 6)}
                      </AppText>
                      <Ionicons name="open-outline" size={14} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
            </View>
            {onchainTxTab === 'explorer' && explorerTxUrl && (
              <Button
                title="最新TxをExplorerで開く"
                variant="secondary"
                onPress={() => Linking.openURL(explorerTxUrl)}
                style={styles.explorerButton}
              />
            )}
          </Card>
        )}

        {showOnchainReceiveCard && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              オンチェーン受け取り
            </AppText>
            <AppText variant="small" style={styles.codeHint}>
              この参加券はオフチェーン記録済みです。ウォレット受け取りを実行するとオンチェーンにも反映されます。
            </AppText>
            <Button
              title={
                isWalletConnected
                  ? (isUserLoggedIn ? 'オンチェーンで受け取る' : 'ログインして受け取る')
                  : 'Walletを接続する'
              }
              onPress={
                isWalletConnected
                  ? handleNavigateOnchainReceive
                  : handleConnectWallet
              }
              variant={isWalletConnected && isUserLoggedIn ? 'primary' : 'secondary'}
              style={styles.onchainReceiveButton}
            />
            {isWalletConnected ? (
              <AppText variant="small" style={styles.codeHint}>
                次の画面でPINを入力して受け取りを確定してください。
              </AppText>
            ) : null}
          </Card>
        )}

        {showOnchainReadinessChecking && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              オンチェーン受け取り
            </AppText>
            <AppText variant="small" style={styles.codeHint}>
              受け取り準備を確認中です…
            </AppText>
          </Card>
        )}

        {showOnchainUnavailableCard && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              オンチェーン受け取り
            </AppText>
            <AppText variant="small" style={styles.warningText}>
              {onchainUnavailableReason ?? 'オンチェーン受け取りを開始できません。'}
            </AppText>
            <AppText variant="small" style={styles.codeHint}>
              オフチェーン参加券は有効です。運営側の設定完了後に再試行してください。
            </AppText>
          </Card>
        )}

        {/* 確認コード */}
        {resolvedConfirmationCode && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>確認コード</AppText>
            <AppText variant="h2" style={styles.code} selectable>
              #{resolvedConfirmationCode}
            </AppText>
            <AppText variant="small" style={styles.codeHint}>
              このコードは後で確認に使えます
            </AppText>
          </Card>
        )}

        {resolvedReceipt && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              Receipt Pubkey
            </AppText>
            <AppText variant="small" style={styles.value}>
              {shortenCode(resolvedReceipt)}
            </AppText>
            {explorerReceiptUrl && (
              <Button
                title="Explorer で見る（Receipt）"
                variant="secondary"
                onPress={() => Linking.openURL(explorerReceiptUrl)}
                style={styles.explorerButton}
              />
            )}
          </Card>
        )}

        {(resolvedPopEntryHash || resolvedPopAuditHash || resolvedPopSigner) && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              PoP証跡（Proof of Process）
            </AppText>
            {resolvedPopSigner && (
              <AppText variant="small" style={styles.value}>
                signer: {shortenCode(resolvedPopSigner)}
              </AppText>
            )}
            {resolvedPopEntryHash && (
              <AppText variant="small" style={styles.value}>
                entry_hash: {shortenCode(resolvedPopEntryHash)}
              </AppText>
            )}
            {resolvedPopAuditHash && (
              <AppText variant="small" style={styles.value}>
                audit_hash: {shortenCode(resolvedPopAuditHash)}
              </AppText>
            )}
            <AppText variant="small" style={styles.codeHint}>
              この値はAPI監査連鎖とオンチェーン検証に使われたPoP証跡です。
            </AppText>
            <Button
              title="PoP証跡をコピー"
              variant="secondary"
              size="medium"
              onPress={handleCopyPopProof}
              style={styles.copyButton}
            />
          </Card>
        )}

        {resolvedMintAddress && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              配布トークン Mint
            </AppText>
            <AppText variant="small" style={styles.value}>
              {shortenCode(resolvedMintAddress)}
            </AppText>
            <AppText variant="small" style={styles.codeHint}>
              {reflectedOnchain
                ? 'オンチェーン残高を確認しました。Phantom側の表示更新に数十秒かかる場合があります。'
                : onchainBlockedByPeriod
                  ? 'この期間はオンチェーン配布上限に達しているため、追加配布は行われません。'
                  : 'トークン反映中です。Phantomでネットワークがdevnetになっているか確認してください。'}
            </AppText>
            {explorerMintUrl && (
              <Button
                title="Explorer で見る（Mint）"
                variant="secondary"
                onPress={() => Linking.openURL(explorerMintUrl)}
                style={styles.explorerButton}
              />
            )}
          </Card>
        )}

        {/* confirmationCode もない、tx/receipt もない場合 */}
        {!resolvedConfirmationCode && onchainTxHistory.length === 0 && !resolvedReceipt && !resolvedMintAddress && !resolvedPopEntryHash && !resolvedPopAuditHash && !resolvedPopSigner && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>参加記録</AppText>
            <AppText variant="small" style={styles.codeHint}>
              イベント ID: {targetEventId}
            </AppText>
          </Card>
        )}

        {/* アクションボタン群 */}
        <View style={styles.actionGroup}>
          <Button title="参加券一覧へ" onPress={() => router.replace(schoolRoutes.events as any)} />
          <Button
            title="続けて別のイベントに参加"
            variant="secondary"
            onPress={() => router.replace(schoolRoutes.scan as any)}
            style={styles.secondaryButton}
          />
        </View>

        <TouchableOpacity
          onPress={() => router.replace(schoolRoutes.home as any)}
          style={styles.homeLink}
        >
          <Ionicons name="home-outline" size={14} color={theme.colors.textTertiary} />
          <AppText variant="small" style={styles.homeLinkText}>ホームに戻る</AppText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  checkAnimFrame: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  checkRing: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: '#74d892',
  },
  checkGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#7bdc95',
  },
  checkBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2fb15a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2fb15a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 6,
  },
  title: {
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  eventCard: {
    marginBottom: theme.spacing.md,
  },
  eventMeta: {
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  card: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  code: {
    marginTop: theme.spacing.sm,
    letterSpacing: 4,
  },
  codeHint: {
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
  warningText: {
    color: theme.colors.error,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  secondaryButton: {
    marginTop: theme.spacing.sm,
  },
  actionGroup: {
    marginTop: theme.spacing.sm,
  },
  homeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  homeLinkText: {
    color: theme.colors.textTertiary,
  },
  label: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.textSecondary,
  },
  value: {
    color: theme.colors.text,
    fontFamily: 'monospace',
    marginBottom: theme.spacing.sm,
  },
  onchainTabs: {
    width: '100%',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: theme.spacing.xs,
  },
  onchainTabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  onchainTabButtonActive: {
    backgroundColor: theme.colors.text,
  },
  onchainTabLabel: {
    color: theme.colors.textSecondary,
  },
  onchainTabLabelActive: {
    color: theme.colors.background,
  },
  onchainTabPanel: {
    width: '100%',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  onchainCompactRow: {
    width: '100%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  onchainCompactMono: {
    color: theme.colors.text,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  onchainExplorerRow: {
    width: '100%',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onchainExplorerLabel: {
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
  },
  explorerButton: {
    marginTop: theme.spacing.xs,
  },
  copyButton: {
    marginTop: theme.spacing.sm,
    minWidth: 160,
  },
  onchainReceiveButton: {
    marginTop: theme.spacing.sm,
    minWidth: 220,
  },
});
