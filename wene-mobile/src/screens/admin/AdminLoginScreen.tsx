import React, { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button, Card } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { isSchoolApiEnabled } from '../../config/api';
import { apiAdminLogin, apiAdminLogout } from '../../api/adminApiClient';

export const AdminLoginScreen: React.FC = () => {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiAdminLogin(passcode);
      if (res.ok) {
        router.replace('/admin' as any);
        return;
      }
      setError('パスコードが違います');
    } catch (e) {
      setError('パスコードが違います');
    } finally {
      setLoading(false);
    }
  };

  const onPasscodeChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    setPasscode(digits);
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await apiAdminLogout();
      router.replace('/admin/login' as any);
    } catch {
      setError('ログアウトに失敗しました');
    }
  };

  if (!isSchoolApiEnabled()) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            管理者モード
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            API 未設定のためログインは不要です
          </AppText>
          <Button
            title="管理者として続行"
            variant="secondary"
            onPress={() => router.replace('/admin' as any)}
            tone="dark"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h2" style={styles.title}>
          管理者ログイン
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          8桁の数字パスコードを入力してください
        </AppText>

        <TextInput
          style={styles.input}
          placeholder="12345678"
          placeholderTextColor={adminTheme.colors.textTertiary}
          value={passcode}
          onChangeText={onPasscodeChange}
          keyboardType="number-pad"
          maxLength={8}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        {error ? (
          <AppText variant="caption" style={styles.errorText}>
            {error}
          </AppText>
        ) : null}

        <Button
          title={loading ? 'ログイン中…' : 'ログイン'}
          onPress={handleLogin}
          disabled={loading || passcode.length !== 8}
          tone="dark"
        />
        <Button
          title="ログアウト（cookie を削除）"
          variant="secondary"
          onPress={handleLogout}
          style={styles.secondaryButton}
          tone="dark"
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.background,
  },
  content: {
    flex: 1,
    padding: adminTheme.spacing.lg,
  },
  title: {
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.xs,
  },
  subtitle: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.lg,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.lg,
  },
  cardText: {
    color: adminTheme.colors.textSecondary,
  },
  secondaryButton: {
    marginTop: adminTheme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.md,
    minHeight: 48,
  },
  errorText: {
    color: '#e57373',
    marginBottom: adminTheme.spacing.sm,
  },
});
