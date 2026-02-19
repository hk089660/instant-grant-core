import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button } from '../ui/components';
import { theme } from '../ui/theme';
import { schoolRoutes } from '../lib/schoolRoutes';

export const HomeScreen: React.FC = () => {
  const router = useRouter();

  const handleGoToEvents = () => {
    router.push(schoolRoutes.events as any);
  };

  const handleScanQR = () => {
    router.push(schoolRoutes.scan as any);
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

        <Button
          title="参加券を見る"
          onPress={handleGoToEvents}
          variant="primary"
          disabled={false}
          style={styles.mainButton}
        />

        <TouchableOpacity onPress={handleScanQR} style={styles.scanLink}>
          <Ionicons name="qr-code-outline" size={18} color={theme.colors.textSecondary} />
          <AppText variant="small" style={styles.scanLinkText}>
            QRを読み取って参加する
          </AppText>
        </TouchableOpacity>
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
  scanLink: {
    padding: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanLinkText: {
    color: theme.colors.textSecondary,
  },
});
