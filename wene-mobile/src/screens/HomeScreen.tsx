import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button } from '../ui/components';
import { theme } from '../ui/theme';
import { getClaimMode } from '../config/claimMode';
import { schoolRoutes } from '../lib/schoolRoutes';

export const HomeScreen: React.FC = () => {
  const router = useRouter();
  const isSchoolMode = getClaimMode() === 'school';

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.push('/wallet')}
          style={styles.settingsButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

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
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    zIndex: 10,
  },
  settingsButton: {
    padding: theme.spacing.xs,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    // ヘッダー分だけ上にずらす調整（任意だが、中央寄せを維持したければマイナスマージンなどで調整も可。今回は自然な配置でいく）
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
});
