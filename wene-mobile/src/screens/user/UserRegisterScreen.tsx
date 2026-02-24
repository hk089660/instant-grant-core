/**
 * 利用者登録（ID + ニックネーム + PIN）
 * 登録後 /u/scan へ
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button } from '../../ui/components';
import { theme } from '../../ui/theme';
import { useAuth } from '../../contexts/AuthContext';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { registerUser } from '../../api/userApi';
import { HttpError } from '../../api/http/httpClient';

const USER_ID_MIN = 3;
const USER_ID_MAX = 32;
const USER_ID_REGEX = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 32;
const PIN_MIN = 4;
const PIN_MAX = 6;
const PIN_REGEX = /^\d{4,6}$/;

export const UserRegisterScreen: React.FC = () => {
  const router = useRouter();
  const { clearUser, setUserId, setDisplayName } = useAuth();
  const [userId, setUserIdLocal] = useState('');
  const [displayName, setDisplayNameLocal] = useState('');
  const [pin, setPinLocal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = useCallback(async () => {
    const normalizedUserId = userId.trim().toLowerCase();
    const name = displayName.trim();
    const pinVal = pin.trim();
    setError(null);

    if (!USER_ID_REGEX.test(normalizedUserId)) {
      setError(`IDは${USER_ID_MIN}〜${USER_ID_MAX}文字、英小文字・数字・._-で入力してください`);
      return;
    }
    if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
      setError(`ニックネームは${DISPLAY_NAME_MIN}〜${DISPLAY_NAME_MAX}文字で入力してください`);
      return;
    }
    if (!PIN_REGEX.test(pinVal)) {
      setError(`PINは${PIN_MIN}〜${PIN_MAX}桁の数字で入力してください`);
      return;
    }

    setLoading(true);
    try {
      const res = await registerUser(normalizedUserId, name, pinVal);
      await clearUser();
      await setUserId(res.userId);
      setDisplayName(name);
      router.replace(schoolRoutes.scan as any);
    } catch (e: unknown) {
      if (e instanceof HttpError) {
        const body = e.body as { code?: unknown; error?: unknown };
        if (e.status === 409 && body?.code === 'duplicate_user_id') {
          setError('このIDは既に使われています。IDを再設定してください');
          return;
        }
        if (typeof body?.error === 'string' && body.error.trim()) {
          setError(body.error);
          return;
        }
      }
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '登録に失敗しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, displayName, pin, clearUser, setUserId, setDisplayName, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <AppText variant="h2" style={styles.title}>
            参加登録
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            ID・ニックネーム・PINを設定してください（PINは4〜6桁の数字）
          </AppText>

          <AppText variant="caption" style={styles.label}>
            ID
          </AppText>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={(text) => setUserIdLocal(text.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, USER_ID_MAX))}
            placeholder="例: user_001"
            placeholderTextColor={theme.colors.textTertiary}
            maxLength={USER_ID_MAX}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <AppText variant="caption" style={styles.label}>
            ニックネーム
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
          <AppText variant="caption" style={styles.pinNotice}>
            参加券・トークン受け取り時にPIN入力が必須です。絶対に忘れないように控えてください。
          </AppText>

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
        </ScrollView>
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
    flexGrow: 1,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
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
  pinNotice: {
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
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
