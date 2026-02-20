import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { Ionicons } from '@expo/vector-icons';
import { setCompleted } from '../../data/participationStore';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';
import { useRecipientTicketStore } from '../../store/recipientTicketStore';
import { getSchoolDeps } from '../../api/createSchoolDeps';
import type { SchoolEvent } from '../../types/school';

export const UserSuccessScreen: React.FC = () => {
  const router = useRouter();
  const { eventId: targetEventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });
  const { tx, receipt, already, confirmationCode, status, mint, reflected, onchainBlocked } = useLocalSearchParams<{
    tx?: string;
    receipt?: string;
    already?: string;
    confirmationCode?: string;
    status?: string;
    mint?: string;
    reflected?: string;
    onchainBlocked?: string;
  }>();

  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const { addTicket, getTicketByEventId } = useRecipientTicketStore();
  const txSignature = typeof tx === 'string' && tx.trim() ? tx.trim() : undefined;
  const receiptPubkey = typeof receipt === 'string' && receipt.trim() ? receipt.trim() : undefined;
  const mintAddress = typeof mint === 'string' && mint.trim() ? mint.trim() : undefined;
  const reflectedOnchain = reflected === '1';
  const onchainBlockedByPeriod = onchainBlocked === '1';
  const storedTicket = targetEventId ? getTicketByEventId(targetEventId) : undefined;
  const resolvedTx = txSignature ?? storedTicket?.txSignature;
  const resolvedReceipt = receiptPubkey ?? storedTicket?.receiptPubkey;

  useEffect(() => {
    if (!targetEventId) return;
    setCompleted(targetEventId).catch(() => { });
  }, [targetEventId]);

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
          });
        }
      })
      .catch(() => { if (!cancelled) setEvent(null); });
    return () => { cancelled = true; };
  }, [targetEventId, addTicket, txSignature, receiptPubkey]);

  const isAlready = already === '1' || status === 'already';
  const explorerTxUrl = resolvedTx ? `https://explorer.solana.com/tx/${resolvedTx}?cluster=devnet` : null;
  const explorerReceiptUrl = resolvedReceipt ? `https://explorer.solana.com/address/${resolvedReceipt}?cluster=devnet` : null;
  const explorerMintUrl = mintAddress ? `https://explorer.solana.com/address/${mintAddress}?cluster=devnet` : null;

  if (!isValid) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <AppText variant="h1" style={styles.checkmark}>✓</AppText>
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

        {/* 確認コード */}
        {confirmationCode && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>確認コード</AppText>
            <AppText variant="h2" style={styles.code} selectable>
              #{confirmationCode}
            </AppText>
            <AppText variant="small" style={styles.codeHint}>
              このコードは後で確認に使えます
            </AppText>
          </Card>
        )}

        {/* Solana トランザクション情報（将来の Web3 連携用） */}
        {resolvedTx && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              トランザクション署名
            </AppText>
            <AppText variant="small" style={styles.value} selectable>
              {resolvedTx}
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
            <AppText variant="small" style={styles.value} selectable>
              {resolvedReceipt}
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

        {mintAddress && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              配布トークン Mint
            </AppText>
            <AppText variant="small" style={styles.value} selectable>
              {mintAddress}
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
        {!confirmationCode && !resolvedTx && !resolvedReceipt && !mintAddress && (
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
  checkmark: {
    fontSize: 48,
    color: '#38b000',
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
});
