import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { setCompleted } from '../../data/participationStore';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';

export const UserSuccessScreen: React.FC = () => {
  const router = useRouter();
  const { eventId: targetEventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });

  useEffect(() => {
    if (!targetEventId) return;
    setCompleted(targetEventId).catch(() => {});
  }, [targetEventId]);

  if (!isValid) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="body" style={styles.subtitle}>
            リダイレクト中…
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h2" style={styles.title}>
          完了
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          参加券を保存しました
        </AppText>

        <Card style={styles.card}>
          <AppText variant="caption">確認コード</AppText>
          <AppText variant="h2" style={styles.code}>
            #A7F3
          </AppText>
        </Card>

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
});
