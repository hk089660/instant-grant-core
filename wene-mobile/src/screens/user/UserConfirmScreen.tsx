import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { setStarted } from '../../data/participationStore';
import { getClaimMode } from '../../config/claimMode';
import { useSchoolClaim } from '../../hooks/useSchoolClaim';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';

export const UserConfirmScreen: React.FC = () => {
  const router = useRouter();
  const { eventId: targetEventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });
  const isSchoolMode = getClaimMode() === 'school';
  const onClaimSuccess = useCallback(
    (result: { txSignature?: string; receiptPubkey?: string; alreadyJoined?: boolean }) => {
      if (!targetEventId) return;
      router.push(
        schoolRoutes.success(targetEventId, {
          tx: result.txSignature,
          receipt: result.receiptPubkey,
          already: result.alreadyJoined,
        }) as any
      );
    },
    [router, targetEventId]
  );
  const { status, error, isRetryable, event, handleClaim } = useSchoolClaim(targetEventId ?? undefined, {
    onSuccess: onClaimSuccess,
  });

  useEffect(() => {
    if (!targetEventId) return;
    setStarted(targetEventId).catch(() => {});
  }, [targetEventId]);

  const handleParticipate = () => {
    if (!targetEventId) return;
    if (isSchoolMode) {
      handleClaim();
    } else {
      router.push(schoolRoutes.success(targetEventId) as any);
    }
  };

  if (!isValid) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h2" style={styles.title}>
          内容を確認
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          参加内容を確認して参加してください
        </AppText>

        <Card style={styles.card}>
          <AppText variant="h3">{event?.title ?? '地域清掃ボランティア'}</AppText>
          <AppText variant="caption">{event?.datetime ?? '2026/02/02 09:00-10:30'}</AppText>
          <AppText variant="caption">主催: {event?.host ?? '生徒会'}</AppText>
        </Card>

        {error ? (
          <AppText variant="caption" style={styles.apiErrorText}>
            {error}
          </AppText>
        ) : null}

        <Button
          title={status === 'loading' ? '処理中…' : status === 'error' && isRetryable ? '再試行' : '参加する'}
          onPress={handleParticipate}
          loading={status === 'loading'}
          disabled={status === 'loading'}
        />
        <Button
          title="戻る"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.secondaryButton}
        />

        {/* TODO: 受付時間外時のみ表示。現状はモックのため非表示 */}
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
    marginBottom: theme.spacing.lg,
  },
  secondaryButton: {
    marginTop: theme.spacing.sm,
  },
  apiErrorText: {
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
});
