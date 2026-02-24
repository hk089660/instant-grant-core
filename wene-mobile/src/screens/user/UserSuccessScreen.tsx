import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity, Animated, Easing } from 'react-native';
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

function shortenCode(value: string, head = 8, tail = 8): string {
  const normalized = value.trim();
  if (!normalized) return '-';
  if (normalized.length <= head + tail + 1) return normalized;
  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`;
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
    tx?: string;
    receipt?: string;
    already?: string;
    confirmationCode?: string;
    status?: string;
    mint?: string;
    reflected?: string;
    onchainBlocked?: string;
    popEntryHash?: string;
    popAuditHash?: string;
    popSigner?: string;
    auditReceiptId?: string;
    auditReceiptHash?: string;
  }>();

  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const { addTicket, getTicketByEventId } = useRecipientTicketStore();
  const txSignature = typeof tx === 'string' && tx.trim() ? tx.trim() : undefined;
  const receiptPubkey = typeof receipt === 'string' && receipt.trim() ? receipt.trim() : undefined;
  const mintAddress = typeof mint === 'string' && mint.trim() ? mint.trim() : undefined;
  const popEntryHash = typeof popEntryHashRaw === 'string' && popEntryHashRaw.trim() ? popEntryHashRaw.trim() : undefined;
  const popAuditHash = typeof popAuditHashRaw === 'string' && popAuditHashRaw.trim() ? popAuditHashRaw.trim() : undefined;
  const popSigner = typeof popSignerRaw === 'string' && popSignerRaw.trim() ? popSignerRaw.trim() : undefined;
  const auditReceiptId =
    typeof auditReceiptIdRaw === 'string' && auditReceiptIdRaw.trim() ? auditReceiptIdRaw.trim() : undefined;
  const auditReceiptHash =
    typeof auditReceiptHashRaw === 'string' && auditReceiptHashRaw.trim() ? auditReceiptHashRaw.trim() : undefined;
  const reflectedOnchain = reflected === '1';
  const onchainBlockedByPeriod = onchainBlocked === '1';
  const storedTicket = targetEventId ? getTicketByEventId(targetEventId) : undefined;
  const resolvedTx = txSignature ?? storedTicket?.txSignature;
  const resolvedReceipt = receiptPubkey ?? storedTicket?.receiptPubkey;
  const resolvedMintAddress = mintAddress ?? storedTicket?.mintAddress;
  const resolvedConfirmationCode =
    (typeof confirmationCode === 'string' && confirmationCode.trim() ? confirmationCode.trim() : undefined) ??
    storedTicket?.confirmationCode;
  const resolvedAuditReceiptId = auditReceiptId ?? storedTicket?.auditReceiptId;
  const resolvedAuditReceiptHash = auditReceiptHash ?? storedTicket?.auditReceiptHash;
  const resolvedPopEntryHash = popEntryHash ?? storedTicket?.popEntryHash;
  const resolvedPopAuditHash = popAuditHash ?? storedTicket?.popAuditHash;
  const resolvedPopSigner = popSigner ?? storedTicket?.popSigner;
  const isWalletConnected = Boolean(walletPubkey);
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
            txSignature,
            receiptPubkey,
            popEntryHash,
            popAuditHash,
            popSigner,
            mintAddress,
            confirmationCode: typeof confirmationCode === 'string' ? confirmationCode : undefined,
            auditReceiptId,
            auditReceiptHash,
          });
        }
      })
      .catch(() => { if (!cancelled) setEvent(null); });
    return () => { cancelled = true; };
  }, [
    targetEventId,
    addTicket,
    txSignature,
    receiptPubkey,
    popEntryHash,
    popAuditHash,
    popSigner,
    mintAddress,
    confirmationCode,
    auditReceiptId,
    auditReceiptHash,
  ]);

  const isAlready = already === '1' || status === 'already';
  const explorerTxUrl = resolvedTx ? `https://explorer.solana.com/tx/${resolvedTx}?cluster=devnet` : null;
  const explorerReceiptUrl = resolvedReceipt ? `https://explorer.solana.com/address/${resolvedReceipt}?cluster=devnet` : null;
  const explorerMintUrl = resolvedMintAddress ? `https://explorer.solana.com/address/${resolvedMintAddress}?cluster=devnet` : null;
  const hasOffchainReceipt = Boolean(
    resolvedConfirmationCode || resolvedAuditReceiptId || resolvedAuditReceiptHash
  );
  const hasOnchainReceipt = Boolean(resolvedTx && resolvedReceipt);
  const eventSupportsOnchainReceive = Boolean(
    event?.solanaMint && event?.solanaAuthority && event?.solanaGrantId
  );
  const showOnchainReceiveCard = Boolean(
    targetEventId &&
    hasOffchainReceipt &&
    !hasOnchainReceipt &&
    eventSupportsOnchainReceive
  );

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
    router.push(schoolRoutes.confirm(targetEventId) as any);
  }, [targetEventId, router]);

  const handleConnectWallet = useCallback(() => {
    router.push('/wallet' as any);
  }, [router]);

  if (!isValid) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
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

        {showOnchainReceiveCard && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              オンチェーン受け取り
            </AppText>
            <AppText variant="small" style={styles.codeHint}>
              この参加券はオフチェーン記録済みです。ウォレット受け取りを実行するとオンチェーンにも反映されます。
            </AppText>
            <Button
              title={isWalletConnected ? 'オンチェーンで受け取る' : 'Walletを接続する'}
              onPress={isWalletConnected ? handleNavigateOnchainReceive : handleConnectWallet}
              variant={isWalletConnected ? 'primary' : 'secondary'}
              style={styles.onchainReceiveButton}
            />
            {isWalletConnected ? (
              <AppText variant="small" style={styles.codeHint}>
                次の画面でPINを入力して受け取りを確定してください。
              </AppText>
            ) : null}
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

        {/* Solana トランザクション情報（将来の Web3 連携用） */}
        {resolvedTx && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              トランザクション署名
            </AppText>
            <AppText variant="small" style={styles.value}>
              {shortenCode(resolvedTx)}
            </AppText>
            {explorerTxUrl && (
              <Button
                title="Explorer で見る（Tx）"
                variant="secondary"
                onPress={() => Linking.openURL(explorerTxUrl)}
                style={styles.explorerButton}
              />
            )}
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
        {!resolvedConfirmationCode && !resolvedTx && !resolvedReceipt && !resolvedMintAddress && !resolvedPopEntryHash && !resolvedPopAuditHash && !resolvedPopSigner && (
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
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
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
