import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';
import { getEventById } from '../../api/schoolEvents';

/** 再読み取り直後の同一QR連続検知を防ぐ cooldown（ms） */
const SCAN_COOLDOWN_MS = 1800;

/**
 * QRデータから eventId を抽出（URL の ?eventId= / path または生のID）
 */
function parseEventIdFromQrData(data: string): string | null {
  const trimmed = data?.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get('eventId');
      if (fromQuery && fromQuery.trim().length > 0) return fromQuery.trim();
      const path = url.pathname;
      const match = path.match(/\/r\/school\/([^/]+)/) || path.match(/\/([^/]+)\/?$/);
      if (match?.[1] && match[1] !== 'scan') return match[1];
    }
    if (/^evt-[a-z0-9-]+$/i.test(trimmed) || trimmed.length >= 4) return trimmed;
  } catch {
    if (trimmed.length >= 4) return trimmed;
  }
  return null;
}

export const UserScanScreen: React.FC = () => {
  const router = useRouter();
  const { eventId: targetEventId } = useEventIdFromParams({ defaultValue: 'evt-001' });
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannedEventId, setScannedEventId] = useState<string | null>(null);
  const scanCooldownUntil = useRef(0);
  const eventId = targetEventId ?? 'evt-001';
  const event = scannedEventId ? getEventById(scannedEventId) : null;

  const goToConfirm = useCallback(
    (id: string) => {
      router.push(schoolRoutes.confirm(id) as any);
    },
    [router]
  );

  const handleBarcodeScanned = useCallback(
    (result: { data?: string; nativeEvent?: { data?: string } }) => {
      const now = Date.now();
      if (now < scanCooldownUntil.current) return;
      const data = typeof result?.data === 'string' ? result.data : result?.nativeEvent?.data;
      if (typeof data !== 'string') return;
      const parsed = parseEventIdFromQrData(data);
      if (!parsed) return;
      scanCooldownUntil.current = now + SCAN_COOLDOWN_MS;
      setScanned(true);
      setScannedEventId(parsed);
    },
    []
  );

  const handleContinueWithoutScan = useCallback(() => {
    goToConfirm(eventId);
  }, [goToConfirm, eventId]);

  /** もう一度読み取る: 同一画面で状態のみリセット（カメラは再マウントしない） */
  const handleRetry = useCallback(() => {
    setScanned(false);
    setScannedEventId(null);
  }, []);

  // Web: カメラは未対応のためフォールバックUI
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            QRを読み取る
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            Webではカメラを利用できません。専用アプリ（iOS/Android）で開くか、下のボタンで続行してください。
          </AppText>
          <Card style={styles.cameraBox}>
            <AppText variant="caption" style={styles.cameraText}>
              ［Web］カメラはアプリでご利用ください
            </AppText>
          </Card>
          <Button title="続行（テスト用）" onPress={handleContinueWithoutScan} />
          <Button
            title="もう一度"
            variant="secondary"
            onPress={handleRetry}
            style={styles.secondaryButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Native: 権限未許可
  if (!permission) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            QRを読み取る
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            読み込み中…
          </AppText>
          <Card style={styles.cameraBox}>
            <AppText variant="caption" style={styles.cameraText}>
              カメラの準備をしています
            </AppText>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            QRを読み取る
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            カメラを使うには設定で許可してください。
          </AppText>
          <Card style={styles.cameraBox}>
            <AppText variant="caption" style={styles.cameraText}>
              カメラが許可されていません
            </AppText>
          </Card>
          <Button title="カメラを許可" onPress={requestPermission} />
          <Button
            title="許可せずに続行（テスト用）"
            variant="secondary"
            onPress={handleContinueWithoutScan}
            style={styles.secondaryButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Native: カメラ表示＋バーコードスキャン
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h2" style={styles.title}>
          QRを読み取る
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          受付のQRコードを枠内に合わせてください
        </AppText>

        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          />
          {scanned ? (
            <View style={styles.scannedOverlay}>
              <AppText variant="caption" style={styles.scannedText}>
                読み取りました
              </AppText>
              {event ? (
                <View style={styles.scannedEventBox}>
                  <AppText variant="body" style={styles.scannedEventTitle} numberOfLines={2}>
                    {event.title}
                  </AppText>
                  {event.datetime ? (
                    <AppText variant="caption" style={styles.scannedEventMeta}>
                      {event.datetime}
                    </AppText>
                  ) : null}
                  {event.host ? (
                    <AppText variant="caption" style={styles.scannedEventMeta}>
                      主催: {event.host}
                    </AppText>
                  ) : null}
                </View>
              ) : scannedEventId ? (
                <AppText variant="caption" style={styles.scannedEventMeta}>
                  イベントID: {scannedEventId}
                </AppText>
              ) : null}
              <Button
                title="参加確認へ"
                onPress={() => scannedEventId && goToConfirm(scannedEventId)}
                style={styles.scannedConfirmButton}
              />
              <Button
                title="もう一度読み取る"
                variant="secondary"
                onPress={handleRetry}
                style={styles.scannedRetryButton}
              />
            </View>
          ) : null}
        </View>

        {!scanned && (
          <>
            <Button
              title="読み取れない場合はこちら"
              variant="secondary"
              onPress={handleContinueWithoutScan}
            />
            <Button
              title="もう一度読み取る"
              variant="secondary"
              onPress={handleRetry}
              style={styles.secondaryButton}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  cameraBox: {
    height: 280,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.gray100,
  },
  cameraText: {
    color: theme.colors.textTertiary,
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  scannedText: {
    color: '#fff',
    marginBottom: theme.spacing.sm,
  },
  scannedEventBox: {
    alignSelf: 'stretch',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  scannedEventTitle: {
    color: '#fff',
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  scannedEventMeta: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  scannedConfirmButton: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  scannedRetryButton: {
    marginTop: theme.spacing.xs,
  },
  secondaryButton: {
    marginTop: theme.spacing.sm,
  },
});
