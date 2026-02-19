import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { useEventIdFromParams } from '../../hooks/useEventIdFromParams';
import { extractEventIdFromQrPayload } from '../../lib/scanEventId';

const SCAN_DEBOUNCE_MS = 900;

type WebCameraDevice = {
  deviceId: string;
  label: string;
};

function getErrorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  if (!('name' in error)) return '';
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

function isExpectedDecodeError(error: unknown): boolean {
  const name = getErrorName(error);
  return name === 'NotFoundException' || name === 'ChecksumException' || name === 'FormatException';
}

function getWebCameraErrorMessage(error: unknown): string {
  const name = getErrorName(error);
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'カメラ権限が拒否されました。ブラウザ設定で許可し、HTTPSまたはlocalhostで開いてください。';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '利用可能なカメラが見つかりません。端末のカメラ接続を確認してください。';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'カメラが他アプリで使用中です。使用中アプリを閉じて再試行してください。';
  }
  if (name === 'OverconstrainedError') {
    return 'このブラウザで利用可能なカメラ条件に一致しません。カメラを切り替えて再試行してください。';
  }
  return 'Webカメラの初期化に失敗しました。HTTPS/権限/ブラウザ対応を確認してください。';
}

export const UserScanScreen: React.FC = () => {
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const { eventId: targetEventId } = useEventIdFromParams();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedEventId, setScannedEventId] = useState<string | null>(targetEventId);
  const [isScanning, setIsScanning] = useState(true);
  const [scanLocked, setScanLocked] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [webDevices, setWebDevices] = useState<WebCameraDevice[]>([]);
  const [webDeviceIndex, setWebDeviceIndex] = useState(0);
  const [webConnecting, setWebConnecting] = useState(false);
  const [webVideoVersion, setWebVideoVersion] = useState(0);
  const [webRetryToken, setWebRetryToken] = useState(0);
  const webVideoRef = useRef<any>(null);
  const webControlsRef = useRef<{ stop?: () => void } | null>(null);
  const lastScanAtRef = useRef(0);

  useEffect(() => {
    if (!targetEventId) return;
    setScannedEventId((current) => current ?? targetEventId);
  }, [targetEventId]);

  const shouldDebounceScan = useCallback(() => {
    const now = Date.now();
    if (now - lastScanAtRef.current < SCAN_DEBOUNCE_MS) return true;
    lastScanAtRef.current = now;
    return false;
  }, []);

  const stopWebScanner = useCallback(() => {
    const controls = webControlsRef.current;
    if (!controls) return;
    try {
      controls.stop?.();
    } catch {
      // no-op
    }
    webControlsRef.current = null;
  }, []);

  const commitDetectedPayload = useCallback((payload: string | undefined) => {
    const detected = extractEventIdFromQrPayload(payload);
    if (!detected) {
      setScanError('QRからeventIdを取得できませんでした。もう一度読み取ってください。');
      return;
    }
    setScanError(null);
    setScannedEventId(detected);
    setScanLocked(true);
    setIsScanning(false);
  }, []);

  const activeEventId = useMemo(() => scannedEventId ?? targetEventId ?? null, [scannedEventId, targetEventId]);
  const hasPermission = permission?.granted === true;
  const permissionBlocked = permission?.granted === false && permission?.canAskAgain === false;

  const handleNativeBarcodeScanned = useCallback(
    (result: { data?: string }) => {
      if (isWeb || !isScanning || scanLocked) return;
      if (shouldDebounceScan()) return;
      commitDetectedPayload(result.data);
    },
    [isWeb, isScanning, scanLocked, shouldDebounceScan, commitDetectedPayload]
  );

  const setWebVideoNode = useCallback((node: any) => {
    webVideoRef.current = node;
    setWebVideoVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    if (scanLocked || !isScanning) {
      stopWebScanner();
      return;
    }
    if (!webVideoRef.current) return;

    let cancelled = false;

    const startWebScanner = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setScanError('このブラウザはカメラAPIに対応していません。Safari/Firefoxは最新版を利用してください。');
        return;
      }

      setScanError(null);
      setWebConnecting(true);
      stopWebScanner();

      try {
        const ZXingBrowser = await import('@zxing/browser');
        if (cancelled) return;

        const deviceList = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
        if (cancelled) return;

        const devices = deviceList.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `camera-${index + 1}`,
        }));
        setWebDevices(devices);

        if (devices.length === 0) {
          setScanError('利用可能なカメラが見つかりません。ブラウザの権限設定を確認してください。');
          return;
        }

        const safeIndex = Math.min(webDeviceIndex, devices.length - 1);
        if (safeIndex !== webDeviceIndex) {
          setWebDeviceIndex(safeIndex);
        }
        const selectedDeviceId = devices[safeIndex]?.deviceId;

        const reader = new ZXingBrowser.BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(selectedDeviceId, webVideoRef.current, (result, error) => {
          if (cancelled || scanLocked || !isScanning) return;

          if (result) {
            if (shouldDebounceScan()) return;
            commitDetectedPayload(result.getText());
            return;
          }

          if (error && !isExpectedDecodeError(error)) {
            setScanError('QRの解析に失敗しました。ブラウザ要件（HTTPS/権限）を確認して再試行してください。');
          }
        });

        if (cancelled) {
          controls.stop?.();
          return;
        }
        webControlsRef.current = controls;
      } catch (error) {
        if (!cancelled) setScanError(getWebCameraErrorMessage(error));
      } finally {
        if (!cancelled) setWebConnecting(false);
      }
    };

    startWebScanner();
    return () => {
      cancelled = true;
      stopWebScanner();
    };
  }, [
    isWeb,
    isScanning,
    scanLocked,
    webVideoVersion,
    webRetryToken,
    webDeviceIndex,
    shouldDebounceScan,
    commitDetectedPayload,
    stopWebScanner,
  ]);

  const handleRequestPermission = useCallback(async () => {
    if (isWeb) {
      setScanError(null);
      setWebRetryToken((v) => v + 1);
      return;
    }
    if (permissionBlocked && Platform.OS !== 'web') {
      await Linking.openSettings().catch(() => { });
      return;
    }
    await requestPermission();
  }, [isWeb, permissionBlocked, requestPermission]);

  const handleSwitchCamera = useCallback(() => {
    if (isWeb) {
      if (webDevices.length > 1) {
        setWebDeviceIndex((prev) => (prev + 1) % webDevices.length);
      } else {
        setWebRetryToken((v) => v + 1);
      }
      return;
    }
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, [isWeb, webDevices.length]);

  const handleResetScan = useCallback(() => {
    lastScanAtRef.current = 0;
    setIsScanning(true);
    setScanLocked(false);
    setScanError(null);
    setScannedEventId(targetEventId ?? null);
    if (isWeb) setWebRetryToken((v) => v + 1);
  }, [isWeb, targetEventId]);

  const statusText = scanError
    ? scanError
    : scanLocked
      ? `読み取り完了: ${activeEventId ?? 'eventId不明'}`
      : webConnecting
        ? 'カメラ接続中...'
        : '読み取り中...枠内にQRを合わせてください';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppText variant="h2" style={styles.title}>
          QRを読み取る
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          受付のQRを読み取ってください
        </AppText>

        <Card style={styles.cameraCard}>
          {!isWeb && !hasPermission ? (
            <View style={styles.permissionBox}>
              <AppText variant="caption" style={styles.cameraText}>
                {permissionBlocked
                  ? 'カメラ権限がオフです。設定から許可してください。'
                  : 'QR読み取りにはカメラ権限が必要です。'}
              </AppText>
              <Button
                title={permissionBlocked && Platform.OS !== 'web' ? '設定を開く' : 'カメラを許可'}
                size="medium"
                onPress={handleRequestPermission}
                style={styles.permissionButton}
              />
            </View>
          ) : (
            <View style={styles.cameraBox}>
              {isWeb ? (
                <View style={styles.webVideoWrap}>
                  {/* @ts-ignore - web only */}
                  <video
                    ref={setWebVideoNode}
                    style={styles.webVideo}
                    autoPlay
                    muted
                    playsInline
                  />
                </View>
              ) : (
                <CameraView
                  style={styles.cameraView}
                  facing={facing}
                  // iOS/TestFlight: QR専用に絞ることで読み取り安定性を優先。
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onMountError={(e) => setScanError(e?.message ?? 'カメラ初期化に失敗しました。')}
                  onBarcodeScanned={scanLocked ? undefined : handleNativeBarcodeScanned}
                />
              )}
              <View pointerEvents="none" style={styles.overlay}>
                <View style={styles.scanFrame} />
              </View>
            </View>
          )}
        </Card>

        <AppText variant="caption" style={[styles.statusText, scanError ? styles.errorText : undefined]}>
          {statusText}
        </AppText>

        {/* メインアクション */}
        <Button
          title={activeEventId ? '確認画面へ進む' : 'QRを読み取ってください'}
          onPress={() => activeEventId && router.push(schoolRoutes.confirm(activeEventId) as any)}
          disabled={!activeEventId}
        />

        {activeEventId && (
          <AppText variant="small" style={styles.eventIdHint}>
            イベントID: {activeEventId}
          </AppText>
        )}

        {/* サブアクション（横並び） */}
        <View style={styles.secondaryRow}>
          <Button
            title={isWeb ? (webDevices.length > 1 ? 'カメラ切替' : '再接続') : 'カメラ切替'}
            variant="secondary"
            size="medium"
            onPress={handleSwitchCamera}
            style={styles.secondaryHalf}
          />
          <Button
            title="再読み取り"
            variant="secondary"
            size="medium"
            onPress={handleResetScan}
            style={styles.secondaryHalf}
          />
        </View>

        {isWeb ? (
          <AppText variant="small" style={styles.webHint}>
            Webで読めない場合: HTTPS（またはlocalhost）、カメラ権限、Safari/Firefox最新版を確認してください。
          </AppText>
        ) : null}
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
  cameraCard: {
    padding: 0,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  cameraBox: {
    height: 280,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.gray100,
  },
  cameraView: {
    width: '100%',
    height: '100%',
  },
  webVideoWrap: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.black,
  },
  webVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 210,
    height: 210,
    borderWidth: 2,
    borderColor: theme.colors.white,
    borderRadius: theme.radius.md,
    backgroundColor: 'transparent',
  },
  permissionBox: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  cameraText: {
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: theme.spacing.md,
    minWidth: 160,
  },
  statusText: {
    marginBottom: theme.spacing.md,
    color: theme.colors.textSecondary,
  },
  errorText: {
    color: theme.colors.error,
  },
  eventIdHint: {
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  secondaryHalf: {
    flex: 1,
  },
  webHint: {
    marginTop: theme.spacing.md,
    color: theme.colors.textTertiary,
  },
});
