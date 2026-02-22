/**
 * Admin ログイン画面
 * 管理者パスコードを入力して管理画面に進む
 */
import React, { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button, Card } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';

import { loginAdmin } from '../../api/adminApi';
import { saveAdminSession } from '../../lib/adminAuth';

// ...

export const AdminLoginScreen: React.FC = () => {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const performLogin = async (password: string, source: 'password' | 'demo') => {
    setError(null);
    if (!password.trim()) {
      setError('パスコードを入力してください');
      return;
    }
    setLoading(true);

    try {
      const result = await loginAdmin(password);
      if (result.success && result.role) {
        const infoName = typeof result.info?.name === 'string' ? result.info.name.trim() : '';
        const infoAdminId = typeof result.info?.adminId === 'string' ? result.info.adminId.trim() : '';
        const resolvedName =
          infoName || (result.role === 'master' ? 'Master Operator' : 'Admin Operator');
        await saveAdminSession({
          token: password,
          role: result.role,
          source,
          adminName: resolvedName,
          adminId: infoAdminId || undefined,
          createdAt: new Date().toISOString(),
        });
        router.replace('/admin' as any);
      } else {
        setError('パスコードが正しくありません');
      }
    } catch {
      setError('認証エラーが発生しました');
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    await performLogin(passcode, 'password');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <AppText variant="h2" style={styles.title}>
            管理者ログイン
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            管理用パスコードを入力してください
          </AppText>
        </View>

        <Card style={styles.card}>
          <AppText variant="caption" style={styles.label}>パスワード</AppText>
          <TextInput
            style={styles.input}
            value={passcode}
            onChangeText={setPasscode}
            placeholder="パスワードを入力"
            placeholderTextColor={adminTheme.colors.textTertiary}
            secureTextEntry
            keyboardType="default"
            onSubmitEditing={handleLogin}
          />
          {error ? (
            <AppText variant="small" style={styles.errorText}>{error}</AppText>
          ) : null}
        </Card>

        <Button
          title={loading ? 'ログイン中…' : '管理者としてログイン'}
          onPress={handleLogin}
          loading={loading}
          disabled={loading}
          style={styles.loginButton}
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
    justifyContent: 'center',
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  titleBlock: {
    marginBottom: adminTheme.spacing.lg,
  },
  title: {
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.xs,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: adminTheme.colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    borderWidth: 1,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.lg,
    marginBottom: adminTheme.spacing.lg,
  },
  label: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    fontSize: 16,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.background,
    height: 48,
  },
  errorText: {
    color: '#ff6b6b',
    marginTop: adminTheme.spacing.sm,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    height: 50,
    justifyContent: 'center',
  },
});
