/**
 * Phantom deeplink callback をアプリ全体で1か所で受け取る listener。
 * connect / sign で分岐し、sign では必ず resolvePendingSignTx / rejectPendingSignTx を呼ぶ。
 * リストナーは unmount で remove しない（永続）。
 */
import { Linking, Platform, AppState, AppStateStatus } from 'react-native';
import { ToastAndroid } from 'react-native';
import { usePhantomStore } from '../store/phantomStore';
import { useRecipientStore } from '../store/recipientStore';
import { handlePhantomConnectRedirect, handleRedirect, isAllowedPhantomRedirectUrl } from './phantom';
import { devLog, devWarn, devError } from './devLog';

async function waitForDappSecretKey(timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const store = usePhantomStore.getState();
    if (store.dappSecretKey) return true;
    if (!store.encryptionKeyPair) {
      await store.loadKeyPair();
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export async function processPhantomUrl(url: string, source: 'event' | 'initial'): Promise<void> {
  if (!isAllowedPhantomRedirectUrl(url)) return;
  devLog('[DEEPLINK]', source, 'received, URL (dev only)');

  const phantomStore = usePhantomStore.getState();
  const recipientStore = useRecipientStore.getState();

  if (!phantomStore.dappSecretKey && !phantomStore.encryptionKeyPair) {
    await phantomStore.loadKeyPair();
  }
  const hasKey = await waitForDappSecretKey(5000);
  if (!hasKey) {
    recipientStore.setError('キーが利用できません');
    if (Platform.OS === 'android') ToastAndroid.show('接続エラー: キーが利用できません', ToastAndroid.LONG);
    return;
  }

  const { dappSecretKey } = usePhantomStore.getState();
  if (!dappSecretKey) {
    recipientStore.setError('キーが利用できません');
    if (Platform.OS === 'android') ToastAndroid.show('接続エラー: キーが利用できません', ToastAndroid.LONG);
    return;
  }

  try {
    // connect と sign でパス分離。connect を先に判定（sign が consume されないよう）
    if (url.includes('/phantom/connect')) {
      const result = handlePhantomConnectRedirect(url, dappSecretKey);
      if (result.ok) {
        await phantomStore.savePhantomConnectResult(result.result.publicKey, result.result.session, result.phantomPublicKey);
        phantomStore.setPhantomEncryptionPublicKey(result.phantomPublicKey);
        recipientStore.setWalletPubkey(result.result.publicKey);
        recipientStore.setPhantomSession(result.result.session);
        recipientStore.setState('Connected');
        devLog('[PhantomDeeplink] connect success');
        if (Platform.OS === 'android') ToastAndroid.show('Phantomに接続しました', ToastAndroid.SHORT);
      } else {
        const msg = `[${result.stage}] ${result.error}`;
        recipientStore.setError(msg);
        if (Platform.OS === 'android') ToastAndroid.show(`接続エラー: ${msg}`, ToastAndroid.LONG);
      }
    } else if (url.includes('/phantom/sign')) {
      devLog('[PhantomDeeplink] sign callback');
      const phantomPk = usePhantomStore.getState().phantomEncryptionPublicKey;
      const result = handleRedirect(url, dappSecretKey, phantomPk ?? undefined);
      if (result.ok) {
        devLog('[PhantomDeeplink] sign resolvePendingSignTx done');
      } else {
        devError('[PhantomDeeplink] sign failed:', result.error);
        recipientStore.setError(result.error);
        if (Platform.OS === 'android') ToastAndroid.show(`署名エラー: ${result.error}`, ToastAndroid.LONG);
      }
    } else {
      devWarn('[PhantomDeeplink] unknown path');
      recipientStore.setError('不明なリダイレクトです');
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    devError('[PhantomDeeplink] exception:', msg);
    recipientStore.setError(msg);
    if (Platform.OS === 'android') ToastAndroid.show(`エラー: ${msg.substring(0, 50)}`, ToastAndroid.LONG);
  } finally {
    const current = useRecipientStore.getState().state;
    if (current === 'Connecting') {
      devLog('[PhantomDeeplink] finally: clearing Connecting state');
      useRecipientStore.getState().setState('Idle');
    }
  }
}

/**
 * Phantom deeplink listener を1回だけ登録する。remove しない。
 * event と initialURL の両方で受信する。
 */
export function setupPhantomDeeplinkListener(): void {
  const handleUrl = (url: string, source: 'event' | 'initial') => {
    processPhantomUrl(url, source);
  };

  Linking.addEventListener('url', (event: { url: string }) => {
    devLog('[DEEPLINK] event received');
    handleUrl(event.url, 'event');
  });
  devLog('[PhantomDeeplink] event listener registered (persistent, no remove)');

  // AppState active 時に getInitialURL を確認（event で届かない場合のフォールバック）
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      Linking.getInitialURL()
        .then((url) => {
          devLog('[DEEPLINK] initial (AppState active):', url ? 'present' : '(null)');
          if (url && isAllowedPhantomRedirectUrl(url)) {
            handleUrl(url, 'initial');
          }
        })
        .catch((e) => devWarn('[DEEPLINK] getInitialURL error:', e));
    }
  });

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    Linking.canOpenURL('wene://ping')
      .then((r) => devLog('[DEEPLINK] canOpenURL(wene://ping):', r))
      .catch((e) => devWarn('[DEEPLINK] canOpenURL error:', e));
  }
}
