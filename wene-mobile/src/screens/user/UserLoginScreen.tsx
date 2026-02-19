/**
 * PIN再入力で利用者を確認（省略可・PoC用）
 * 確認後 /u/scan へ
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button } from '../../ui/components';
import { theme } from '../../ui/theme';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { getBaseUrl } from '../../api/userApi';

const PIN_REGEX = /^\d{4,6}$/;

export const UserLoginScreen: React.FC = () => {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = useCallback(async () => {
    const pinVal = pin.trim();
    setError(null);
    if (!PIN_REGEX.test(pinVal)) {
      setError('PINは4〜6桁の数字で入力してください');
      return;
    }
    setLoading(true);
    try {
      const base = getBaseUrl();
      const url = `${base}/api/auth/verify`;
      const { getUserId } = await import('../../lib/userStorage');
      const userId = getUserId();
      if (!userId) {
        setError('登録がありません。はじめに参加登録を行ってください。');
        setLoading(false);
        return;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin: pinVal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error === 'invalid pin' ? 'PINが正しくありません' : '確認に失敗しました');
        setLoading(false);
        return;
      }
      router.replace(schoolRoutes.scan as any);
    } catch {
      setError('接続に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [pin, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            PINで確認
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            登録したPINを入力してください
          </AppText>

          <AppText variant="caption" style={styles.label}>
            PIN
          </AppText>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="4〜6桁の数字"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            editable={!loading}
          />

          {error ? (
            <AppText variant="caption" style={styles.errorText}>
              {error}
            </AppText>
          ) : null}

          <View style={styles.actionGroup}>
            <Button
              title={loading ? '確認中…' : '確認する'}
              onPress={handleVerify}
              loading={loading}
              disabled={loading}
            />
            <Button
              title="戻る"
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />
            <TouchableOpacity
              onPress={() => router.push(schoolRoutes.register as any)}
              style={styles.registerLink}
            >
              <AppText variant="caption" style={styles.registerLinkText}>
                まだ登録していない方はこちら
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboard: {
    flex: 1,
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
  label: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  errorText: {
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  actionGroup: {
    marginTop: theme.spacing.md,
  },
  backButton: {
    marginTop: theme.spacing.sm,
  },
  registerLink: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  registerLinkText: {
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
