import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button } from '../ui/components';
import { theme } from '../ui/theme';
import { schoolRoutes } from '../lib/schoolRoutes';
import { useAuth } from '../contexts/AuthContext';

export const HomeScreen: React.FC = () => {
  const router = useRouter();
  const { userId, displayName, clearUser } = useAuth();

  const handleGoToEvents = () => {
    router.push(schoolRoutes.events as any);
  };

  const handleScanQR = () => {
    router.push(schoolRoutes.scan as any);
  };

  const handleRegister = () => {
    router.push(schoolRoutes.register as any);
  };

  const handleLogin = () => {
    router.push(schoolRoutes.login as any);
  };

  const handleLogout = () => {
    void clearUser();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <AppText variant="h1" style={styles.title}>
          We-ne
        </AppText>
        <AppText variant="bodyLarge" style={styles.description}>
          学校イベントの参加を記録するアプリ
        </AppText>

        {/* メインアクション */}
        <View style={styles.actions}>
          <Button
            title="参加券を見る"
            onPress={handleGoToEvents}
            variant="primary"
            disabled={false}
            style={styles.mainButton}
          />

          <TouchableOpacity onPress={handleScanQR} style={styles.scanLink}>
            <Ionicons name="qr-code-outline" size={18} color={theme.colors.textSecondary} />
            <AppText variant="caption" style={styles.scanLinkText}>
              QRを読み取って参加する
            </AppText>
          </TouchableOpacity>
        </View>

        {/* 登録/ログイン案内 */}
        {!userId ? (
          <View style={styles.authSection}>
            <View style={styles.divider} />
            <AppText variant="caption" style={styles.authHint}>
              はじめての方はこちら
            </AppText>
            <View style={styles.authButtons}>
              <TouchableOpacity onPress={handleRegister} style={styles.authLink}>
                <Ionicons name="person-add-outline" size={16} color={theme.colors.text} />
                <AppText variant="body" style={styles.authLinkText}>参加登録</AppText>
              </TouchableOpacity>
              <View style={styles.authDot} />
              <TouchableOpacity onPress={handleLogin} style={styles.authLink}>
                <Ionicons name="log-in-outline" size={16} color={theme.colors.text} />
                <AppText variant="body" style={styles.authLinkText}>ログイン</AppText>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.loggedInSection}>
            <View style={styles.userBadge}>
              <Ionicons name="person-circle-outline" size={16} color={theme.colors.textSecondary} />
              <AppText variant="small" style={styles.userBadgeText}>
                {displayName ?? `ID: ${userId}`}
              </AppText>
            </View>
            <Button
              title="ログアウト"
              variant="secondary"
              onPress={handleLogout}
              style={styles.logoutButton}
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.sm,
  },
  description: {
    marginBottom: theme.spacing.xxl,
    textAlign: 'center',
    color: theme.colors.textSecondary,
  },
  actions: {
    alignItems: 'center',
    width: '100%',
  },
  mainButton: {
    marginBottom: theme.spacing.md,
  },
  scanLink: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanLinkText: {
    color: theme.colors.textSecondary,
  },
  // 登録/ログイン案内
  authSection: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    width: 120,
    marginBottom: theme.spacing.md,
  },
  authHint: {
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  authButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  authLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  authLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  authDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.gray300,
  },
  // ログイン済みバッジ
  loggedInSection: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.gray100,
    borderRadius: 20,
  },
  userBadgeText: {
    color: theme.colors.textSecondary,
  },
  logoutButton: {
    marginTop: theme.spacing.sm,
    minWidth: 120,
  },
});
