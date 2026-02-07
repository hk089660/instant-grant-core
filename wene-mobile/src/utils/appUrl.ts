import { Platform } from 'react-native';

/**
 * アプリのベースURL（Web: 現在オリジン、Native: 環境変数またはデフォルト）
 * 管理者のQRコードで参加者に配布するスキャンURLの基点に使用する。
 */
export function getBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return (process.env.EXPO_PUBLIC_APP_URL as string) || 'https://wene.app';
}

/**
 * イベントの参加用スキャンURL（QRコードにエンコードする値）
 * 参加者がこのURLを開くと /u/scan?eventId=xxx に遷移する。
 */
export function getEventScanUrl(eventId: string): string {
  const base = getBaseUrl().replace(/\/$/, '');
  return `${base}/u/scan?eventId=${encodeURIComponent(eventId)}`;
}

/**
 * イベントの参加用URL（token 付き。サーバ発行トークンで /u/join に直接遷移）
 * API 有効時は印刷QRにこのURLを使用する。
 */
export function getEventJoinUrl(eventId: string, token: string): string {
  const base = getBaseUrl().replace(/\/$/, '');
  return `${base}/u/join?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`;
}
