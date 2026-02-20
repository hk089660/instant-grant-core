import '../src/polyfills';
import { Stack } from 'expo-router';
import { Linking } from 'react-native';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePhantomStore } from '../src/store/phantomStore';
import { useRecipientStore } from '../src/store/recipientStore';
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
  const initRef = useRef(false);
  const { loadKeyPair, loadPhantomConnectResult, setPhantomEncryptionPublicKey } = usePhantomStore();
  const { setWalletPubkey, setPhantomSession, setState } = useRecipientStore();

  // 初期化: 保存された接続結果を読み込む（一度だけ実行）
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const loadSavedConnection = async () => {
      await loadKeyPair();
      const saved = await loadPhantomConnectResult();
      if (saved) {
        console.log('[RootLayout] Loaded saved connection:', saved.publicKey.substring(0, 8) + '...');
        setWalletPubkey(saved.publicKey);
        setPhantomSession(saved.session);
        setPhantomEncryptionPublicKey(saved.phantomPublicKey);
        setState('Connected');
      }
    };
    loadSavedConnection();
  }, []);

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
