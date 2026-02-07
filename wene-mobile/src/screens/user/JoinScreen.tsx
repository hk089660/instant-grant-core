import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button } from '../../ui/components';
import { theme } from '../../ui/theme';
import { getStudentSession } from '../../utils/studentSession';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useRecipientTicketStore } from '../../store/recipientTicketStore';
import { setCompleted } from '../../data/participationStore';
import { getEventById } from '../../api/schoolEvents';
import { submitSchoolClaim } from '../../api/schoolClaim';

type Status = 'idle' | 'loading' | 'success' | 'error';

/**
 * QR Join ルート: /u/join?eventId=...&token=...
 * 登録済みなら recordParticipation を実行し、参加証を発行する。
 * token は PoC では未検証。将来の署名・有効期限用にパラメータを用意。
 */
export const JoinScreen: React.FC = () => {
  const router = useRouter();
  const { eventId, token } = useLocalSearchParams<{ eventId?: string; token?: string }>();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const didSubmitRef = useRef(false);
  const { addTicket } = useRecipientTicketStore();

  useEffect(() => {
    if (status !== 'idle') return;
    if (!eventId || eventId.trim() === '') {
      setStatus('error');
      setErrorMessage('イベントIDが指定されていません');
      return;
    }

    if (__DEV__) {
      console.log({ eventId, token });
    }

    let cancelled = false;

    const run = async () => {
      const session = await getStudentSession();
      if (cancelled) return;
      if (!session) {
        router.replace(schoolRoutes.register as any);
        return;
      }
      if (didSubmitRef.current) return;
      didSubmitRef.current = true;
      setStatus('loading');

      const result = await submitSchoolClaim(eventId.trim(), token ?? undefined);
      if (cancelled) return;
      if (result.success) {
        const eventName = result.eventName ?? getEventById(eventId.trim())?.title ?? eventId;
        await setCompleted(eventId.trim());
        if (cancelled) return;
        await addTicket({
          eventId: eventId.trim(),
          eventName,
          joinedAt: Date.now(),
        });
        if (cancelled) return;
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(result.error?.message ?? '参加の記録に失敗しました');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [eventId, token, status, router, addTicket]);

  if (!eventId || eventId.trim() === '') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            参加エラー
          </AppText>
          <AppText variant="bodyLarge" style={styles.muted}>
            イベントIDが指定されていません。リンクを確認するか、一覧からお選びください。
          </AppText>
          <Button
            title="イベント一覧へ"
            variant="secondary"
            onPress={() => router.replace(schoolRoutes.events as any)}
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            参加を記録しています…
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            エラー
          </AppText>
          <AppText variant="bodyLarge" style={styles.muted}>
            {errorMessage}
          </AppText>
          <Button
            title="イベント一覧へ"
            variant="secondary"
            onPress={() => router.replace(schoolRoutes.events as any)}
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'success') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            参加が記録されました
          </AppText>
          <AppText variant="bodyLarge" style={styles.muted}>
            参加証が発行されました。
          </AppText>
          <Button
            title="参加証を見る"
            onPress={() => router.push(schoolRoutes.certificates as any)}
            style={styles.button}
          />
          <Button
            title="イベント一覧へ戻る"
            variant="secondary"
            onPress={() => router.replace(schoolRoutes.events as any)}
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  return null;
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
    marginBottom: theme.spacing.sm,
  },
  muted: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  button: {
    marginBottom: theme.spacing.sm,
  },
});
