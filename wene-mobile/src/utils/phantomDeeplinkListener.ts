/**
 * Phantom deeplink callback をアプリ全体で1か所で受け取る listener。
 * connect / sign で分岐し、sign では必ず resolvePendingSignTx / rejectPendingSignTx を呼ぶ。
 * リストナーは unmount で remove しない（永続）。
 */
import { Linking, Platform, AppState, AppStateStatus } from 'react-native';
import { ToastAndroid } from 'react-native';
import { Transaction } from '@solana/web3.js';
import { usePhantomStore } from '../store/phantomStore';
import { useRecipientStore } from '../store/recipientStore';
import { handlePhantomConnectRedirect, handleRedirect } from './phantom';
import { rejectPendingSignTx } from './phantomSignTxPending';

export type ProcessPhantomUrlResult =
  | { kind: 'ignored'; ok: false; error: string }
  | { kind: 'connect'; ok: true }
  | { kind: 'connect'; ok: false; error: string }
  | { kind: 'sign'; ok: true; tx: Transaction }
  | { kind: 'sign'; ok: false; error: string };

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

export async function processPhantomUrl(url: string, source: 'event' | 'initial'): Promise<ProcessPhantomUrlResult> {
  if (!url.startsWith('wene://phantom/')) {
    return { kind: 'ignored', ok: false, error: 'not phantom url' };
  }
  console.log(`[DEEPLINK] ${source} received, URL全文:`, url);

  const phantomStore = usePhantomStore.getState();
  const recipientStore = useRecipientStore.getState();

  if (!phantomStore.dappSecretKey && !phantomStore.encryptionKeyPair) {
    await phantomStore.loadKeyPair();
  }
  const hasKey = await waitForDappSecretKey(5000);
  if (!hasKey) {
    const msg = 'キーが利用できません';
    recipientStore.setError(msg);
    rejectPendingSignTx(new Error(msg));
    if (Platform.OS === 'android') ToastAndroid.show('接続エラー: キーが利用できません', ToastAndroid.LONG);
    return { kind: url.includes('/phantom/sign') ? 'sign' : 'connect', ok: false, error: msg };
  }

  const { dappSecretKey } = usePhantomStore.getState();
  if (!dappSecretKey) {
    const msg = 'キーが利用できません';
    recipientStore.setError(msg);
    rejectPendingSignTx(new Error(msg));
    if (Platform.OS === 'android') ToastAndroid.show('接続エラー: キーが利用できません', ToastAndroid.LONG);
    return { kind: url.includes('/phantom/sign') ? 'sign' : 'connect', ok: false, error: msg };
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
        console.log('[PhantomDeeplink] connect success');
        if (Platform.OS === 'android') ToastAndroid.show('Phantomに接続しました', ToastAndroid.SHORT);
        return { kind: 'connect', ok: true };
      } else {
        const msg = `[${result.stage}] ${result.error}`;
        recipientStore.setError(msg);
        if (Platform.OS === 'android') ToastAndroid.show(`接続エラー: ${msg}`, ToastAndroid.LONG);
        return { kind: 'connect', ok: false, error: msg };
      }
    } else if (url.includes('/phantom/sign')) {
      console.log('[PhantomDeeplink] sign callback');
      const phantomPk = usePhantomStore.getState().phantomEncryptionPublicKey;
      const result = handleRedirect(url, dappSecretKey, phantomPk ?? undefined);
      if (result.ok) {
        console.log('[PhantomDeeplink] sign resolvePendingSignTx done');
        return { kind: 'sign', ok: true, tx: result.tx };
      } else {
        console.error('[PhantomDeeplink] sign failed:', result.error);
        recipientStore.setError(result.error);
        if (Platform.OS === 'android') ToastAndroid.show(`署名エラー: ${result.error}`, ToastAndroid.LONG);
        return { kind: 'sign', ok: false, error: result.error };
      }
    } else {
      console.warn('[PhantomDeeplink] unknown path:', url.substring(0, 80));
      const msg = '不明なリダイレクトです';
      recipientStore.setError(msg);
      rejectPendingSignTx(new Error(msg));
      return { kind: 'ignored', ok: false, error: msg };
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[PhantomDeeplink] exception:', msg);
    recipientStore.setError(msg);
    rejectPendingSignTx(new Error(msg));
    if (Platform.OS === 'android') ToastAndroid.show(`エラー: ${msg.substring(0, 50)}`, ToastAndroid.LONG);
    return { kind: url.includes('/phantom/sign') ? 'sign' : 'connect', ok: false, error: msg };
  } finally {
    const current = useRecipientStore.getState().state;
    if (current === 'Connecting') {
      console.log('[PhantomDeeplink] finally: clearing Connecting state');
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
    console.log('[DEEPLINK] event received, URL全文:', event.url);
    handleUrl(event.url, 'event');
  });
  console.log('[PhantomDeeplink] event listener registered (persistent, no remove)');

  // AppState active 時に getInitialURL を確認（event で届かない場合のフォールバック）
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      Linking.getInitialURL()
        .then((url) => {
          console.log('[DEEPLINK] initial (AppState active):', url ?? '(null)');
          if (url && url.startsWith('wene://phantom/')) {
            handleUrl(url, 'initial');
          }
        })
        .catch((e) => console.warn('[DEEPLINK] getInitialURL error:', e));
    }
  });

  // DEV: wene:// が開けるか自己テスト
  if (__DEV__) {
    Linking.canOpenURL('wene://ping')
      .then((r) => console.log('[DEEPLINK] canOpenURL(wene://ping):', r))
      .catch((e) => console.warn('[DEEPLINK] canOpenURL error:', e));
  }
}
