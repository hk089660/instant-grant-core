import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button, Loading } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';
import { processPhantomUrl } from '../../src/utils/phantomDeeplinkListener';
import { rejectPendingSignTx } from '../../src/utils/phantomSignTxPending';
import { consumePhantomWebReturnPath } from '../../src/utils/phantomWebReturnPath';

const SAFE_TIMEOUT_MS = 10_000;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildPhantomDeepLinkFromParams(params: Record<string, string | string[] | undefined>): string | null {
  const actionRaw = firstParam(params.action);
  if (!actionRaw) return null;
  const query = Object.entries(params)
    .filter(([key, value]) => key !== 'action' && value != null)
    .map(([key, value]) => {
      const v = firstParam(value);
      if (v == null) return null;
      return `${encodeURIComponent(key)}=${encodeURIComponent(v)}`;
    })
    .filter((line): line is string => Boolean(line))
    .join('&');

  return query ? `wene://phantom/${actionRaw}?${query}` : `wene://phantom/${actionRaw}`;
}

export default function PhantomRedirectScreen() {
  const rawParams = useLocalSearchParams();
  const params = rawParams as Record<string, string | string[] | undefined>;
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('Phantomコールバックを処理しています…');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const action = useMemo(() => firstParam(params.action) ?? '', [params.action]);
  const fallbackUrlFromParams = useMemo(() => buildPhantomDeepLinkFromParams(params), [params]);
  const returnPath = useMemo(() => {
    const defaultPath = action.startsWith('connect') ? '/wallet' : '/u';
    if (Platform.OS === 'web') {
      return consumePhantomWebReturnPath() ?? defaultPath;
    }
    return defaultPath;
  }, [action]);

  useEffect(() => {
    let cancelled = false;

    const setSafeStatus = (next: 'loading' | 'done' | 'error', msg?: string) => {
      if (cancelled) return;
      setStatus(next);
      if (msg != null) setMessage(msg);
    };

    const process = async () => {
      timeoutRef.current = setTimeout(() => {
        const timeoutMsg = 'コールバック処理がタイムアウトしました。もう一度署名を実行してください。';
        if (action.startsWith('sign')) {
          rejectPendingSignTx(new Error(timeoutMsg));
        }
        setSafeStatus('error', timeoutMsg);
      }, SAFE_TIMEOUT_MS);

      try {
        let handled = false;

        if (fallbackUrlFromParams?.includes('wene://phantom/')) {
          await processPhantomUrl(fallbackUrlFromParams, 'initial');
          handled = true;
        }

        if (!handled) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && initialUrl.startsWith('wene://phantom/')) {
            await processPhantomUrl(initialUrl, 'initial');
            handled = true;
          }
        }

        if (!handled) {
          const msg = 'PhantomのコールバックURLを取得できませんでした。署名を再試行してください。';
          if (action.startsWith('sign')) {
            rejectPendingSignTx(new Error(msg));
          }
          setSafeStatus('error', msg);
          return;
        }

        setSafeStatus('done', 'コールバック処理が完了しました。画面に戻ります…');
        setTimeout(() => {
          if (cancelled) return;
          router.replace(returnPath as any);
        }, 200);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'コールバック処理に失敗しました。';
        if (action.startsWith('sign')) {
          rejectPendingSignTx(new Error(msg));
        }
        setSafeStatus('error', msg);
      } finally {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    process();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [action, fallbackUrlFromParams, router, returnPath]);

  return (
    <View style={styles.container}>
      {status === 'loading' ? (
        <Loading message={message} />
      ) : status === 'done' ? (
        <AppText variant="body" style={styles.message}>
          {message}
        </AppText>
      ) : (
        <View style={styles.errorWrap}>
          <AppText variant="h3" style={styles.title}>
            処理に失敗しました
          </AppText>
          <AppText variant="body" style={styles.message}>
            {message}
          </AppText>
          <Button
            title="参加画面へ戻る"
            onPress={() => router.replace(returnPath as any)}
            variant="secondary"
            style={styles.button}
          />
          <Button
            title="ホームへ戻る"
            onPress={() => router.replace('/' as any)}
            variant="secondary"
            style={styles.button}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  errorWrap: {
    width: '100%',
    maxWidth: 420,
  },
  title: {
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  button: {
    marginTop: theme.spacing.xs,
  },
});
