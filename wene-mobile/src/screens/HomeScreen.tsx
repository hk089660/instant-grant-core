import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button } from '../ui/components';
import { theme } from '../ui/theme';
import { schoolRoutes } from '../lib/schoolRoutes';
import { useAuth } from '../contexts/AuthContext';

export const HomeScreen: React.FC = () => {
  const router = useRouter();
  const { userId, displayName, clearUser } = useAuth();
  const appIcon = require('../../assets/icon.png');
  const logoReveal = useRef(new Animated.Value(0)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;
  const floatLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const introAnimation = Animated.timing(logoReveal, {
      toValue: 1,
      duration: 760,
      easing: Easing.out(Easing.back(2.3)),
      useNativeDriver: true,
    });

    introAnimation.start(({ finished }) => {
      if (!finished) return;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(logoFloat, {
            toValue: 1,
            duration: 1450,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(logoFloat, {
            toValue: 0,
            duration: 1450,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      floatLoopRef.current = loop;
      loop.start();
    });

    return () => {
      introAnimation.stop();
      floatLoopRef.current?.stop();
      logoReveal.stopAnimation();
      logoFloat.stopAnimation();
    };
  }, [logoReveal, logoFloat]);

  const logoScale = logoReveal.interpolate({
    inputRange: [0, 0.42, 0.7, 1],
    outputRange: [0.62, 1.08, 0.96, 1],
  });
  const logoRotate = logoReveal.interpolate({
    inputRange: [0, 0.45, 0.7, 0.86, 1],
    outputRange: ['-13deg', '7deg', '-3deg', '1.2deg', '0deg'],
  });
  const logoLiftIn = logoReveal.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });
  const logoFloatY = logoFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });
  const logoTranslateY = Animated.add(logoLiftIn, logoFloatY);
  const popRingScale = logoReveal.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.7, 1.36, 1],
  });
  const popRingOpacity = logoReveal.interpolate({
    inputRange: [0, 0.18, 0.58, 1],
    outputRange: [0, 0.28, 0.08, 0],
  });

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.logoPing,
              {
                opacity: popRingOpacity,
                transform: [{ scale: popRingScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.logoWrap,
              {
                opacity: logoReveal,
                transform: [
                  { translateY: logoTranslateY },
                  { rotate: logoRotate },
                  { scale: logoScale },
                ],
              },
            ]}
          >
            <Image source={appIcon} style={styles.logoImage} resizeMode="contain" />
          </Animated.View>
          <AppText variant="h2" style={styles.title}>
            We-ne
          </AppText>
          <AppText variant="body" style={styles.description}>
            学校イベントの参加を記録するアプリ
          </AppText>
          {userId ? (
            <View style={styles.userBadge}>
              <Ionicons name="person-circle-outline" size={16} color={theme.colors.textSecondary} />
              <AppText variant="small" style={styles.userBadgeText}>
                {displayName ?? `ID: ${userId}`}
              </AppText>
            </View>
          ) : (
            <View style={styles.guestBadge}>
              <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.textSecondary} />
              <AppText variant="small" style={styles.guestBadgeText}>
                登録済みIDとPINでいつでもログイン可能
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <AppText variant="caption" style={styles.sectionTitle}>
            参加アクション
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
            <AppText variant="caption" style={styles.scanLinkText}>
              QRを読み取って参加する
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* 登録/ログイン案内 */}
        {!userId ? (
          <View style={styles.sectionCard}>
            <AppText variant="caption" style={styles.sectionTitle}>
              アカウント
            </AppText>
            <AppText variant="small" style={styles.authHint}>
              はじめての方は参加登録、登録済みの方はログインへ進んでください
            </AppText>
            <View style={styles.authButtons}>
              <TouchableOpacity onPress={handleRegister} style={styles.authLink}>
                <View style={styles.authLinkLeft}>
                  <Ionicons name="person-add-outline" size={16} color={theme.colors.text} />
                  <AppText variant="body" style={styles.authLinkText}>参加登録</AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogin} style={styles.authLink}>
                <View style={styles.authLinkLeft}>
                  <Ionicons name="log-in-outline" size={16} color={theme.colors.text} />
                  <AppText variant="body" style={styles.authLinkText}>ログイン</AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <AppText variant="caption" style={styles.sectionTitle}>
              アカウント
            </AppText>
            <Button
              title="ログアウト"
              variant="secondary"
              onPress={handleLogout}
              style={styles.logoutButton}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'stretch',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  heroCard: {
    width: '100%',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  logoWrap: {
    width: '54%',
    maxWidth: 220,
    minWidth: 168,
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPing: {
    position: 'absolute',
    top: theme.spacing.lg + theme.spacing.xs,
    width: 176,
    height: 176,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: theme.colors.gray300,
    backgroundColor: 'transparent',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    letterSpacing: 0.4,
    marginBottom: theme.spacing.xs,
  },
  description: {
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    color: theme.colors.textSecondary,
  },
  guestBadge: {
    marginTop: theme.spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    backgroundColor: theme.colors.gray50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guestBadgeText: {
    color: theme.colors.textSecondary,
  },
  sectionCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  mainButton: {
    width: '100%',
    minWidth: 0,
  },
  scanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
  },
  scanLinkText: {
    flex: 1,
    marginLeft: theme.spacing.xs,
    color: theme.colors.textSecondary,
  },
  // 登録/ログイン案内
  authHint: {
    color: theme.colors.textTertiary,
  },
  authButtons: {
    gap: theme.spacing.sm,
  },
  authLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
  },
  authLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  authLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // ログイン済みバッジ
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.gray100,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
  },
  userBadgeText: {
    color: theme.colors.textSecondary,
  },
  logoutButton: {
    width: '100%',
    minWidth: 0,
  },
});
