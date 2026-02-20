import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { AppText } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import { schoolRoutes } from '../../src/lib/schoolRoutes';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';

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
  const router = useRouter();
  return (
    <View style={styles.container}>
      <WebOnlyBanner />
      <AuthGate>
        <Stack screenOptions={{
          headerShown: true,
          headerTitle: '',
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.replace('/')}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.pill}>
                <Ionicons name="settings-sharp" size={14} color="#ffffff" />
                <AppText variant="body" style={styles.pillLabel}>we-ne</AppText>
              </View>
            </TouchableOpacity>
          ),
        }} />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.gray600,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    marginLeft: Platform.OS === 'web' ? theme.spacing.md : 0,
  },
  pillLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
