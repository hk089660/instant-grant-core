import '../src/polyfills';
import { Stack, usePathname } from 'expo-router';
import { Linking } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { processPhantomUrl } from '../src/utils/phantomDeeplinkListener';
import { AuthProvider } from '../src/contexts/AuthContext';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../src/ui/theme';

const headerPillStyle = {
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
  },
  pillLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
};

export default function RootLayout() {
  const pathname = usePathname();

  // コールドスタート時のdeeplink処理（listener は polyfills で登録済み）
  useEffect(() => {
    const checkInitialURL = async () => {
      try {
        const initialURL = await Linking.getInitialURL();
        console.log('[DEEPLINK] initial getInitialURL:', initialURL ?? '(null)');
        if (initialURL && initialURL.startsWith('wene://phantom/')) {
          await processPhantomUrl(initialURL, 'initial');
        }
      } catch (error) {
        console.error('[DEEPLINK] getInitialURL error:', error);
      }
    };
    checkInitialURL();
  }, []);

  // Web: 管理者画面と利用者画面で favicon を切り替える
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const iconPath = pathname?.startsWith('/admin')
      ? '/favicon-admin-circle.png'
      : '/ticket-token-symbol-circle.png';
    let iconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      document.head.appendChild(iconLink);
    }
    if (iconLink.getAttribute('href') !== iconPath) {
      iconLink.setAttribute('href', iconPath);
      iconLink.setAttribute('type', 'image/png');
    }
  }, [pathname]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="(drawer)" />
          <Stack.Screen
            name="r/[campaignId]"
            options={({ navigation }) => ({
              headerShown: true,
              headerTitle: '',
              headerStyle: { backgroundColor: theme.colors.background },
              headerShadowVisible: false,
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => navigation.navigate('(drawer)')}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 8 }}
                >
                  <View style={headerPillStyle.pill}>
                    <Ionicons name="settings-sharp" size={14} color="#ffffff" />
                    <Text style={headerPillStyle.pillLabel}>we-ne</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          />
          <Stack.Screen
            name="r/school/[eventId]"
            options={({ navigation }) => ({
              headerShown: true,
              headerTitle: '',
              headerStyle: { backgroundColor: theme.colors.background },
              headerShadowVisible: false,
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => navigation.navigate('(drawer)')}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 8 }}
                >
                  <View style={headerPillStyle.pill}>
                    <Ionicons name="settings-sharp" size={14} color="#ffffff" />
                    <Text style={headerPillStyle.pillLabel}>we-ne</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          />
          <Stack.Screen
            name="use/[campaignId]"
            options={({ navigation }) => ({
              headerShown: true,
              headerTitle: '',
              headerStyle: { backgroundColor: theme.colors.background },
              headerShadowVisible: false,
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => navigation.navigate('(drawer)')}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 8 }}
                >
                  <View style={headerPillStyle.pill}>
                    <Ionicons name="settings-sharp" size={14} color="#ffffff" />
                    <Text style={headerPillStyle.pillLabel}>we-ne</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          />
          <Stack.Screen name="phantom/[action]" />
          <Stack.Screen name="phantom-callback" />
          {/* 追加: ユーザー画面・管理者画面 */}
          <Stack.Screen name="u" />
          <Stack.Screen name="admin" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
