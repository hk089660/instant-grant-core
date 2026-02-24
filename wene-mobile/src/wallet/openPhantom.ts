import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { isLikelyMobileWebBrowser, openPhantomWebPopup } from '../utils/phantomWebPopup';

export interface OpenPhantomOptions {
  /**
   * Web のみ: 可能なら新規タブを使って元タブのJS状態を維持する。
   * （署名待機中Promiseを保持するため）
   */
  preferPopup?: boolean;
}

function buildPhantomCustomProtocolUrl(url: string): string | null {
  if (!url) {
    return null;
  }
  const normalized = url.trim();
  const prefix = 'https://phantom.app/ul/';
  if (normalized.startsWith(prefix)) {
    return `phantom://${normalized.slice(prefix.length)}`;
  }
  return null;
}

function buildPhantomCustomProtocolFallbackUrl(url: string): string | null {
  if (!url) {
    return null;
  }
  const normalized = url.trim();
  const prefix = 'https://phantom.app/ul/';
  if (normalized.startsWith(prefix)) {
    return `phantom://ul/${normalized.slice(prefix.length)}`;
  }
  return null;
}

function buildPhantomAndroidIntentUrl(url: string): string | null {
  if (!url) {
    return null;
  }
  const normalized = url.trim();
  const prefix = 'https://phantom.app/';
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  const rest = normalized.slice(prefix.length);
  return `intent://phantom.app/${rest}#Intent;scheme=https;package=app.phantom;end`;
}

// ToastAndroidはAndroid専用のため、条件付きで使用
const getToastAndroid = () => {
  if (Platform.OS === 'android') {
    return require('react-native').ToastAndroid;
  }
  return null;
};

/**
 * Phantom Connect URLを開く
 * canOpenURL依存を排除し、必ずopenURLを試す + フォールバックを入れる
 * 
 * @param url Phantom Connect URL
 * @returns Promise<void> - 成功時はresolve、失敗時はreject
 */
export async function openPhantomConnect(url: string, options: OpenPhantomOptions = {}): Promise<void> {
  // URLの検証（空文字/undefined対策）
  if (!url || url.trim() === '') {
    const error = new Error('URLが空です');
    console.error('[openPhantomConnect]', error.message);
    throw error;
  }

  const urlPreview = url.length > 50 ? url.substring(0, 50) + '...' : url;
  console.log('[openPhantomConnect] URL:', urlPreview);

  // Web署名時は新規タブ優先。元タブの pending promise を保持する。
  if (
    Platform.OS === 'web' &&
    options.preferPopup &&
    typeof window !== 'undefined' &&
    typeof window.open === 'function'
  ) {
    if (isLikelyMobileWebBrowser()) {
      // モバイルWebはまず同一タブの universal link を優先（OSがPhantomアプリへ遷移しやすい）
      try {
        await Linking.openURL(url);
        console.log('[openPhantomConnect] mobile-web direct deeplink succeeded');
        return;
      } catch (e) {
        console.warn('[openPhantomConnect] mobile-web direct deeplink failed, fallback popup:', e);
      }
    }
    const opened = openPhantomWebPopup(url);
    if (opened) {
      console.log('[openPhantomConnect] web popup open/reuse succeeded');
      return;
    }
    throw new Error('ポップアップがブロックされました。ブラウザでこのサイトのポップアップを許可してください。');
  }

  // Native は Phantom custom protocol を優先して直接アプリを開く（ブラウザ経由を回避）
  if (Platform.OS !== 'web') {
    const androidIntentUrl = Platform.OS === 'android' ? buildPhantomAndroidIntentUrl(url) : null;
    const customProtocolUrl = buildPhantomCustomProtocolUrl(url);
    const fallbackCustomProtocolUrl = buildPhantomCustomProtocolFallbackUrl(url);
    const nativeCandidates = [androidIntentUrl, customProtocolUrl, fallbackCustomProtocolUrl].filter((v): v is string => Boolean(v));
    if (nativeCandidates.length > 0) {
      let lastError: unknown = null;
      for (const candidate of nativeCandidates) {
        try {
          await Linking.openURL(candidate);
          console.log('[openPhantomConnect] Phantom custom protocol open succeeded:', candidate.substring(0, 40));
          return;
        } catch (e) {
          lastError = e;
          console.warn('[openPhantomConnect] Phantom custom protocol open failed:', candidate.substring(0, 40), e);
        }
      }
      const error = new Error('Phantomアプリを起動できませんでした。Phantomがインストール済みか確認してください。');
      console.error('[openPhantomConnect] all Phantom custom protocol candidates failed', lastError);
      if (Platform.OS === 'android') {
        const ToastAndroid = getToastAndroid();
        if (ToastAndroid) {
          ToastAndroid.show('Phantomアプリを起動できませんでした', ToastAndroid.LONG);
        }
      }
      throw error;
    }
  }

  // canOpenURL を必ず事前確認（ログ用。AndroidではfalseでもopenURLを試す）
  try {
    const canOpen = await Linking.canOpenURL(url);
    console.log('[openPhantomConnect] canOpenURL:', canOpen);
  } catch (e) {
    console.log('[openPhantomConnect] canOpenURL error:', e);
  }

  // Linking.openURLを試す
  try {
    await Linking.openURL(url);
    console.log('[openPhantomConnect] Linking.openURL succeeded');
    return;
  } catch (e) {
    console.log('[openPhantomConnect] Linking.openURL failed:', e);
    // フォールバックに進む
  }

  // 2. WebBrowser.openBrowserAsyncを試す（フォールバック）
  try {
    await WebBrowser.openBrowserAsync(url);
    console.log('[openPhantomConnect] WebBrowser.openBrowserAsync succeeded');
    return;
  } catch (e) {
    console.log('[openPhantomConnect] WebBrowser.openBrowserAsync failed:', e);
    // 最後のフォールバックに進む
  }

  // 3. すべて失敗した場合
  const error = new Error('Phantomを開けませんでした');
  console.error('[openPhantomConnect] All methods failed');
  
  // Androidの場合、ToastAndroidで表示
  if (Platform.OS === 'android') {
    const ToastAndroid = getToastAndroid();
    if (ToastAndroid) {
      ToastAndroid.show('Phantomを開けませんでした', ToastAndroid.LONG);
    }
  }
  
  throw error;
}
