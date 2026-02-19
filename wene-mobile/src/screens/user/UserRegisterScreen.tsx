/**
 * 利用者登録（名前 + PIN）
 * 登録後 /u/scan へ
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button } from '../../ui/components';
import { theme } from '../../ui/theme';
import { useAuth } from '../../contexts/AuthContext';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { registerUser } from '../../api/userApi';

const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 32;
const PIN_MIN = 4;
const PIN_MAX = 6;
const PIN_REGEX = /^\d{4,6}$/;

export const UserRegisterScreen: React.FC = () => {
  const router = useRouter();
  const { setUserId, setDisplayName } = useAuth();
  const [displayName, setDisplayNameLocal] = useState('');
  const [pin, setPinLocal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = useCallback(async () => {
    const name = displayName.trim();
    const pinVal = pin.trim();
    setError(null);

    if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
      setError(`名前は${DISPLAY_NAME_MIN}〜${DISPLAY_NAME_MAX}文字で入力してください`);
      return;
    }
    if (!PIN_REGEX.test(pinVal)) {
      setError(`PINは${PIN_MIN}〜${PIN_MAX}桁の数字で入力してください`);
      return;
    }

    setLoading(true);
    try {
      const res = await registerUser(name, pinVal);
      setUserId(res.userId);
      setDisplayName(name);
      router.replace(schoolRoutes.scan as any);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '登録に失敗しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [displayName, pin, setUserId, setDisplayName, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            参加登録
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            名前とPINを設定してください（PINは4〜6桁の数字）
          </AppText>

          <AppText variant="caption" style={styles.label}>
            名前
          </AppText>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayNameLocal}
            placeholder="表示名（1〜32文字）"
            placeholderTextColor={theme.colors.textTertiary}
            maxLength={DISPLAY_NAME_MAX}
            editable={!loading}
            autoCapitalize="none"
          />

          <AppText variant="caption" style={styles.label}>
            PIN
          </AppText>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(t) => setPinLocal(t.replace(/\D/g, '').slice(0, PIN_MAX))}
            placeholder="4〜6桁の数字"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={PIN_MAX}
            editable={!loading}
          />

          {error ? (
            <AppText variant="caption" style={styles.errorText}>
              {error}
            </AppText>
          ) : null}

          <View style={styles.actionGroup}>
            <Button
              title={loading ? '登録中…' : '登録する'}
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
            />
            <TouchableOpacity
              onPress={() => router.push(schoolRoutes.login as any)}
              style={styles.loginLink}
            >
              <AppText variant="caption" style={styles.loginLinkText}>
                既に登録済みの方はこちら
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
  loginLink: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  loginLinkText: {
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
