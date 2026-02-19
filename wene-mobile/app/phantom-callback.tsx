import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecipientStore } from '../src/store/recipientStore';
import { usePhantomStore } from '../src/store/phantomStore';
import { handlePhantomConnectRedirect } from '../src/utils/phantom';
import { consumePhantomWebReturnPath } from '../src/utils/phantomWebReturnPath';
import { AppText } from '../src/ui/components';
import { theme } from '../src/ui/theme';

const SAFE_TIMEOUT_MS = 3000;

/**
 * Phantom connect のコールバック専用ページ（浅い固定パス /phantom-callback）
 * - window.location から query をパースし、成功時は /u へ遷移、失敗時は説明＋再試行
 * - 無限ローディングを絶対にしない（タイムアウトで必ず error 表示へ）
 */
export default function PhantomCallbackScreen() {
  const router = useRouter();
  const { setWalletPubkey, setPhantomSession, setState, setError } = useRecipientStore();
  const { loadKeyPair, savePhantomConnectResult, setPhantomEncryptionPublicKey } = usePhantomStore();
  const [status, setStatus] = useState<'idle' | 'error' | 'done'>('idle');
  const [message, setMessage] = useState<string>('');
  const [returnPath] = useState<string>(() => {
    if (Platform.OS === 'web') {
      return consumePhantomWebReturnPath() ?? '/u';
    }
    return '/u';
  });
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    const url =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.href
        : '';

    const params = url ? new URL(url).searchParams : null;
    const dataLen = params?.get('data')?.length ?? 0;
    const nonceLen = params?.get('nonce')?.length ?? 0;
    const pkLen = params?.get('phantom_encryption_public_key')?.length ?? 0;
    const errCode = params?.get('errorCode') ?? '';
    const errMsg = params?.get('errorMessage') ?? '';

    console.log('[phantom-callback] received query lengths:', {
      dataLen,
      nonceLen,
      phantom_encryption_public_keyLen: pkLen,
      errorCode: errCode?.length ?? 0,
      errorMessage: errMsg?.length ?? 0,
    });

    if (!url || !params?.toString()) {
      setStatus('error');
      setMessage('コールバック用のパラメータがありません。接続を開始した画面から「戻れない場合はこちら」で開いてください。');
      return;
    }

    if (errCode || errMsg) {
      setStatus('error');
      setMessage(errMsg || errCode || 'Phantomで接続が拒否されました。');
      return;
    }

    const timeoutId = setTimeout(() => {
      setStatus((s) => {
        if (s === 'idle') {
          setMessage('処理がタイムアウトしました。');
          return 'error';
        }
        return s;
      });
    }, SAFE_TIMEOUT_MS);

    const run = async () => {
      try {
        await loadKeyPair();
        const dappSecretKey = usePhantomStore.getState().dappSecretKey;
        if (!dappSecretKey) {
          setStatus('error');
          setMessage('接続用のキーがありません。最初から接続をやり直してください。');
          return;
        }

        const result = handlePhantomConnectRedirect(url, dappSecretKey);

        if (result.ok) {
          doneRef.current = true;
          await savePhantomConnectResult(
            result.result.publicKey,
            result.result.session,
            result.phantomPublicKey
          );
          setPhantomEncryptionPublicKey(result.phantomPublicKey);
          setWalletPubkey(result.result.publicKey);
          setPhantomSession(result.result.session);
          setState('Connected');
          setStatus('done');
          router.replace(returnPath as any);
        } else {
          setStatus('error');
          setMessage(result.error || '接続に失敗しました。');
        }
      } catch (e) {
        setStatus('error');
        setMessage(e instanceof Error ? e.message : '接続に失敗しました。');
      } finally {
        clearTimeout(timeoutId);
      }
    };

    run();

    return () => clearTimeout(timeoutId);
  }, [loadKeyPair, savePhantomConnectResult, setPhantomEncryptionPublicKey, setWalletPubkey, setPhantomSession, setState, router, returnPath]);

  if (status === 'idle') {
    return (
      <View style={styles.container}>
        <AppText variant="body" style={styles.message}>
          処理中...
        </AppText>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <AppText variant="h3" style={styles.title}>
          接続に失敗しました
        </AppText>
        <AppText variant="body" style={styles.message}>
          {message}
        </AppText>
        <TouchableOpacity
          onPress={() => router.replace(returnPath as any)}
          style={styles.link}
        >
          <AppText variant="body" style={styles.linkText}>
            生徒トップへ戻る
          </AppText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppText variant="body" style={styles.message}>
        遷移しています...
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  link: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  linkText: {
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
});
