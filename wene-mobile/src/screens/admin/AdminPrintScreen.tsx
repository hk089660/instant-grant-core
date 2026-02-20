import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as QRCode from 'qrcode';
import { AppText, Button, Card } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';

import { getSchoolDeps } from '../../api/createSchoolDeps';
import type { SchoolEvent } from '../../types/school';

export const AdminPrintScreen: React.FC = () => {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const printHiddenProps = { 'data-print-hidden': 'true' } as any;
  const printCardProps = { 'data-print-card': 'true' } as any;
  const printQrProps = { 'data-print-qr': 'true' } as any;

  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getSchoolDeps()
      .eventProvider.getById(eventId)
      .then((ev) => {
        if (!cancelled) setEvent(ev ?? null);
      })
      .catch(() => {
        if (!cancelled) setEvent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const baseUrl = useMemo(() => {
    const envBase = (process.env.EXPO_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
    if (envBase) return envBase;
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }, []);

  const canShowQr = event?.state === 'published' || (event && !event.state);
  const scanUrl = useMemo(() => {
    if (!eventId || !baseUrl || !canShowQr) return '';
    return `${baseUrl}/u/scan?eventId=${encodeURIComponent(eventId)}`;
  }, [eventId, baseUrl, canShowQr]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !scanUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(scanUrl, { width: 300, margin: 2 })
      .then((url: string) => setQrDataUrl(url))
      .catch((err: unknown) => {
        console.error('QR生成エラー:', err);
        setQrDataUrl(null);
      });
  }, [scanUrl]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'we-ne-print-style';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 16mm; }
        body { background: #ffffff !important; margin: 0; }
        [data-print-hidden="true"] { display: none !important; }
        [data-print-card="true"] {
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        [data-print-qr="true"] {
          height: 320px !important;
          border-width: 2px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const handlePrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.header} {...printHiddenProps}>
          <AppText variant="h2" style={styles.title}>
            印刷用QR
          </AppText>
          <View style={styles.headerRight}>
            <AppText variant="small" style={styles.role}>
              Admin
            </AppText>
            <Button title="戻る" variant="secondary" dark onPress={() => router.back()} />
          </View>
        </View>

        <Card style={styles.card} {...printCardProps}>
          {event && event.state && event.state !== 'published' ? (
            <AppText variant="caption" style={styles.cardMuted}>
              無効（{event.state}）— QRは利用できません
            </AppText>
          ) : null}
          <AppText variant="h3" style={styles.cardText}>
            {event?.title ?? '…'}
          </AppText>
          <AppText variant="caption" style={styles.cardText}>
            {event?.datetime ?? '—'}
          </AppText>
          <AppText variant="caption" style={styles.cardText}>
            主催: {event?.host ?? '—'}
          </AppText>
          <AppText variant="small" style={styles.cardMuted}>
            ID: {eventId}
          </AppText>
          <View style={styles.qrBox} {...printQrProps}>
            {qrDataUrl ? (
              Platform.OS === 'web' ? (
                // @ts-ignore - web only
                <img src={qrDataUrl} alt="QR Code" style={{ width: 300, height: 300 }} />
              ) : (
                <Image source={{ uri: qrDataUrl }} style={styles.qrImage} />
              )
            ) : (
              <AppText variant="caption" style={styles.cardMuted}>
                QR生成中...
              </AppText>
            )}
          </View>
          {scanUrl ? (
            <AppText variant="small" style={[styles.cardMuted, styles.qrUrl]} selectable>
              {scanUrl}
            </AppText>
          ) : null}
          <AppText variant="small" style={styles.cardMuted}>
            参加用QR（通常のブラウザで開く）
          </AppText>
          <AppText variant="caption" style={styles.cardMuted}>
            上記URLをQRコード化して印刷してください。生徒は通常ブラウザで開けます。署名が必要な場合は確認画面で「Phantomで開く」を利用してください。
          </AppText>
        </Card>

        <View {...printHiddenProps}>
          <Button title="印刷する" variant="secondary" dark onPress={handlePrint} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: adminTheme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  role: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.xs,
  },
  title: {
    color: '#000000',
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.lg,
  },
  cardText: {
    color: '#000000',
  },
  cardMuted: {
    color: '#666666',
  },
  qrBox: {
    height: 220,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: adminTheme.spacing.md,
  },
  qrUrl: {
    marginTop: adminTheme.spacing.sm,
    paddingHorizontal: adminTheme.spacing.sm,
    fontSize: 10,
    maxWidth: '100%',
  },
  qrImage: {
    width: 300,
    height: 300,
  },
});
