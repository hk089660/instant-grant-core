import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { AppText } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import { schoolRoutes } from '../../src/lib/schoolRoutes';

/**
 * Web で表示。生徒用は専用アプリ利用を案内（Webは管理者・補助用）
 */
function WebOnlyBanner() {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={styles.banner}>
      <AppText variant="caption" style={styles.bannerText}>
        生徒用は専用アプリ（iOS TestFlight / Android APK）をご利用ください。{'\n'}Webは管理者・補助用です。
      </AppText>
    </View>
  );
}

/** /u/register, /u/login 以外で userId が無い場合は /u/register へ */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { userId, isReady } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    const isRegister = pathname === '/u/register' || pathname === '/u/register/';
    const isLogin = pathname === '/u/login' || pathname === '/u/login/';
    if (isRegister || isLogin) return;
    if (!userId) {
      router.replace(schoolRoutes.register as any);
    }
  }, [isReady, userId, pathname, router]);

  return <>{children}</>;
}

export default function ULayout() {
  return (
    <View style={styles.container}>
      <WebOnlyBanner />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthGate>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.gray100,
  },
  bannerText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
