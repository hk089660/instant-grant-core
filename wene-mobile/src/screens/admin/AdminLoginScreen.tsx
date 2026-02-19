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

import { verifyAdminPassword } from '../../api/adminApi';

// ...

export const AdminLoginScreen: React.FC = () => {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!passcode.trim()) {
      setError('パスコードを入力してください');
      return;
    }
    setLoading(true);

    // API による認証
    try {
      const isValid = await verifyAdminPassword(passcode);
      if (isValid) {
        router.replace('/admin' as any);
      } else {
        setError('パスコードが正しくありません');
      }
    } catch (e) {
      setError('認証エラーが発生しました');
    }
    setLoading(false);
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

        {/* Demo Login Button */}
        <View style={styles.demoContainer}>
          <View style={styles.divider} />
          <AppText variant="caption" style={styles.demoNote}>
            ※審査・デモ環境用
          </AppText>
          <Button
            title="デモ管理者としてログイン"
            onPress={() => router.replace('/admin' as any)}
            style={styles.demoButton}
          />
        </View>
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
  demoContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: adminTheme.colors.border,
    opacity: 0.3,
    marginBottom: 20,
  },
  demoNote: {
    color: adminTheme.colors.textTertiary,
    marginBottom: 8,
    fontSize: 12,
  },
  demoButton: {
    backgroundColor: '#2c3e50', // Slightly lighter drak grey for demo
    width: '100%',
    borderWidth: 0,
    height: 44,
  },
});
