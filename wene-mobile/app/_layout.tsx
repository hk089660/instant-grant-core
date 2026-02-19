import '../src/polyfills';
import { Stack } from 'expo-router';
import { Linking } from 'react-native';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePhantomStore } from '../src/store/phantomStore';
import { useRecipientStore } from '../src/store/recipientStore';
import { processPhantomUrl } from '../src/utils/phantomDeeplinkListener';
import { AuthProvider } from '../src/contexts/AuthContext';

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
          <Stack.Screen name="r/[campaignId]" />
          <Stack.Screen name="r/school/[eventId]" />
          <Stack.Screen name="use/[campaignId]" />
          <Stack.Screen name="phantom/[action]" />
          <Stack.Screen name="phantom-callback" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
