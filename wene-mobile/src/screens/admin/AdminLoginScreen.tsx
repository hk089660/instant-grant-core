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

// TODO: 本番では API による認証に切り替え
const ADMIN_PASSCODE = '1234';

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
    // 簡易パスコード認証（本番では API に置き換え）
    await new Promise((r) => setTimeout(r, 300));
    if (passcode === ADMIN_PASSCODE) {
      router.replace('/admin' as any);
    } else {
      setError('パスコードが正しくありません');
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
          <AppText variant="caption" style={styles.label}>パスコード</AppText>
          <TextInput
            style={styles.input}
            value={passcode}
            onChangeText={setPasscode}
            placeholder="4桁のパスコード"
            placeholderTextColor={adminTheme.colors.textTertiary}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={8}
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
    fontSize: 20,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.background,
    textAlign: 'center',
    letterSpacing: 8,
  },
  errorText: {
    color: '#ff6b6b',
    marginTop: adminTheme.spacing.sm,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: adminTheme.colors.text,
  },
});
