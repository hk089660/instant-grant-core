import React, { useEffect } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { setCompleted } from '../../data/participationStore';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';

export const UserSuccessScreen: React.FC = () => {
  const router = useRouter();
  const { eventId: targetEventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });
  const { tx, receipt, already } = useLocalSearchParams<{
    tx?: string;
    receipt?: string;
    already?: string;
  }>();

  useEffect(() => {
    if (!targetEventId) return;
    setCompleted(targetEventId).catch(() => {});
  }, [targetEventId]);

  const isAlready = already === '1';
  const explorerTxUrl = tx ? `https://explorer.solana.com/tx/${tx}?cluster=devnet` : null;
  const explorerReceiptUrl = receipt ? `https://explorer.solana.com/address/${receipt}?cluster=devnet` : null;

  if (!isValid) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h2" style={styles.title}>
          完了
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          {isAlready ? '既に参加済みです（運用上完了）' : '参加券を保存しました'}
        </AppText>

        {tx && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              トランザクション署名
            </AppText>
            <AppText variant="small" style={styles.value} selectable>
              {tx}
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

        {receipt && (
          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              Receipt Pubkey
            </AppText>
            <AppText variant="small" style={styles.value} selectable>
              {receipt}
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

        {!tx && !receipt && (
          <Card style={styles.card}>
            <AppText variant="caption">確認コード</AppText>
            <AppText variant="h2" style={styles.code}>
              #A7F3
            </AppText>
          </Card>
        )}

        <Button title="完了" onPress={() => router.replace(schoolRoutes.events as any)} />
        <Button
          title="もう一度読み取る"
          variant="secondary"
          onPress={() => targetEventId && router.replace(`${schoolRoutes.scan}?eventId=${targetEventId}` as any)}
          style={styles.secondaryButton}
        />
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
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  card: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  code: {
    marginTop: theme.spacing.sm,
  },
  secondaryButton: {
    marginTop: theme.spacing.sm,
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
