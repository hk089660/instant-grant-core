import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button } from '../ui/components';
import { theme } from '../ui/theme';
import { getClaimMode } from '../config/claimMode';
import { schoolRoutes } from '../lib/schoolRoutes';
import { getStudentSession } from '../utils/studentSession';

/** 学校モード時: 初回起動（未登録）なら登録フローへリダイレクト。登録済み・再起動後はログイン情報を反映してホームを表示。 */
export const HomeScreen: React.FC = () => {
  const router = useRouter();
  const isSchoolMode = getClaimMode() === 'school';
  const [registrationCheck, setRegistrationCheck] = useState<'pending' | 'redirect_to_register' | 'registered'>(
    isSchoolMode ? 'pending' : 'registered'
  );

  useEffect(() => {
    if (!isSchoolMode) {
      setRegistrationCheck('registered');
      return;
    }
    let cancelled = false;
    getStudentSession().then((session) => {
      if (cancelled) return;
      setRegistrationCheck(session ? 'registered' : 'redirect_to_register');
    });
    return () => {
      cancelled = true;
    };
  }, [isSchoolMode]);

  useEffect(() => {
    if (registrationCheck !== 'redirect_to_register') return;
    router.replace(schoolRoutes.register as any);
  }, [registrationCheck, router]);

  const handleStartReceive = () => {
    if (isSchoolMode) {
      router.push(schoolRoutes.events as any);
    } else {
      router.push('/r/demo-campaign?code=demo-invite');
    }
  };

  const handleDemoLink = () => {
    if (isSchoolMode) {
      router.push(schoolRoutes.scan as any);
    } else {
      router.push('/r/demo-campaign?code=demo-invite');
    }
  };

  if (isSchoolMode && registrationCheck === 'pending') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={[styles.content, styles.loadingContent]}>
          <ActivityIndicator size="large" color={theme.colors.active} />
          <AppText variant="caption" style={styles.loadingText}>
            読み込み中…
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (isSchoolMode && registrationCheck === 'redirect_to_register') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={[styles.content, styles.loadingContent]}>
          <ActivityIndicator size="large" color={theme.colors.active} />
          <AppText variant="caption" style={styles.loadingText}>
            登録画面へ…
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h1" style={styles.title}>
          We-ne
        </AppText>
        <AppText variant="bodyLarge" style={styles.description}>
          {isSchoolMode ? 'イベントに参加する' : '支援クレジットを受け取る'}
        </AppText>

        <Button
          title={isSchoolMode ? '参加を開始' : '受け取りを開始'}
          onPress={handleStartReceive}
          variant="primary"
          disabled={false}
          style={styles.mainButton}
        />

        <TouchableOpacity onPress={handleDemoLink} style={styles.demoLink}>
          <AppText variant="small" style={styles.demoLinkText}>
            {isSchoolMode ? 'QRを読み取る' : 'デモリンクを開く'}
          </AppText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    marginBottom: theme.spacing.md,
  },
  description: {
    marginBottom: theme.spacing.xxl,
    textAlign: 'center',
    color: theme.colors.textSecondary,
  },
  mainButton: {
    marginBottom: theme.spacing.md,
  },
  demoLink: {
    padding: theme.spacing.sm,
  },
  demoLinkText: {
    color: theme.colors.textTertiary,
    textDecorationLine: 'underline',
  },
  loadingContent: {
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
  },
});
