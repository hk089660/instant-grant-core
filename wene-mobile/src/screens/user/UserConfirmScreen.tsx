import React, { useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, Loading } from '../../ui/components';
import { theme } from '../../ui/theme';
import { setStarted } from '../../data/participationStore';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';
import { useAuth } from '../../contexts/AuthContext';
import { claimEventWithUser } from '../../api/userApi';
import { HttpError } from '../../api/http/httpClient';
import { getSchoolDeps } from '../../api/createSchoolDeps';
import type { SchoolEvent } from '../../types/school';

export const UserConfirmScreen: React.FC = () => {
  const router = useRouter();
  const { eventId: targetEventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });
  const { userId, clearUser } = useAuth();
  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);

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

  const handleParticipate = useCallback(async () => {
    if (!targetEventId || !userId) return;

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

    setStatus('loading');
    setError(null);

    try {
      const result = await claimEventWithUser(targetEventId, userId, pinVal);

      router.push(
        schoolRoutes.success(targetEventId, {
          already: result.status === 'already',
          status: result.status,
          confirmationCode: result.confirmationCode,
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
      }

      if (e && typeof e === 'object' && 'message' in e) {
        const msg = String((e as { message: string }).message);
        if (msg.includes('invalid pin')) {
          setError('PINが正しくありません');
        } else {
          setError(msg);
        }
      } else {
        setError('参加処理に失敗しました。再試行してください。');
      }
    }
  }, [targetEventId, userId, pin, showPinInput, router]);

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
            disabled={status === 'loading' || !event || (event.state != null && event.state !== 'published')}
          />
          {!showPinInput && event && event.state === 'published' && (
            <AppText variant="small" style={styles.actionHint}>
              PINを入力して参加を確定します
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
});
