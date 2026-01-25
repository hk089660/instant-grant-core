import { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * We-ne Mobile App Configuration
 * 
 * Universal Links (iOS) and App Links (Android) are configured to handle
 * https://wene.app/r/* URLs. Custom scheme (wene://) is also supported.
 * 
 * For Universal Links to work, you need to deploy:
 * - iOS: https://wene.app/.well-known/apple-app-site-association
 * - Android: https://wene.app/.well-known/assetlinks.json
 * 
 * See README.md for detailed setup instructions.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  // 開発時に自動的にバージョンを更新（更新を強制するため）
  const timestamp = process.env.NODE_ENV === 'development' 
    ? Date.now().toString().slice(-6) 
    : undefined;
  
  // versionCode をタイムスタンプベースで生成（ビルドごとに増加）
  // タイムスタンプの下6桁を数値に変換（例: 419100 → 419100）
  // ただし、versionCode は整数で、大きすぎるとエラーになるため、適切な範囲に収める
  const versionCode = timestamp 
    ? parseInt(timestamp, 10) 
    : 1;
  
  return {
    ...config,
    name: 'wene-mobile',
    slug: 'wene-mobile',
    scheme: 'wene', // Custom scheme for deeplink (wene://r/*)
    version: timestamp ? `1.0.0-${timestamp}` : '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'jp.wene.app',
    // Universal Links: enables https://wene.app/r/* to open the app
    // Requires AASA file at https://wene.app/.well-known/apple-app-site-association
    associatedDomains: ['applinks:wene.app'],
  },
  android: {
    versionCode,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'jp.wene.app',
    intentFilters: [
      // Custom scheme (wene://) for deeplink
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'wene',
            host: '*',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
      // Universal Links (https://wene.app/r/*)
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'wene.app',
            pathPrefix: '/r',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
  ],
  experiments: {
    typedRoutes: true,
  },
  };
};
