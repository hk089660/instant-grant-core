import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as QRCode from 'qrcode';
import { AppText, Button, Card } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { getMockAdminRole } from '../../data/adminMock';
import { roleLabel } from '../../types/ui';
import { buildPhantomBrowseUrl } from '../../utils/phantom';

export const AdminPrintScreen: React.FC = () => {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const role = getMockAdminRole();
  const isAdmin = role === 'admin';
  const printHiddenProps = { 'data-print-hidden': 'true' } as any;
  const printCardProps = { 'data-print-card': 'true' } as any;
  const printQrProps = { 'data-print-qr': 'true' } as any;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const browseQrUrl = useMemo(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    if (!eventId) return '';
    const base = window.location.origin;
    const scanPath = `/u/scan?eventId=${encodeURIComponent(eventId)}`;
    return buildPhantomBrowseUrl(base, scanPath);
  }, [eventId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !browseQrUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(browseQrUrl, { width: 300, margin: 2 })
      .then((url: string) => setQrDataUrl(url))
      .catch((err: unknown) => {
        console.error('QR生成エラー:', err);
        setQrDataUrl(null);
      });
  }, [browseQrUrl]);

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
              {roleLabel[role]}
            </AppText>
            <Button title="戻る" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>

        {!isAdmin ? (
          <Card style={styles.card} {...printCardProps}>
            <AppText variant="bodyLarge" style={styles.cardText}>
              管理者のみ印刷できます
            </AppText>
            <AppText variant="caption" style={styles.cardMuted}>
              閲覧モードでは印刷できません
            </AppText>
          </Card>
        ) : (
          <>
            <Card style={styles.card} {...printCardProps}>
              <AppText variant="h3" style={styles.cardText}>
                地域清掃ボランティア
              </AppText>
              <AppText variant="caption" style={styles.cardText}>
                2026/02/02 09:00-10:30
              </AppText>
              <AppText variant="caption" style={styles.cardText}>
                主催: 生徒会
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
              {browseQrUrl ? (
                <AppText variant="small" style={[styles.cardMuted, styles.qrUrl]} selectable>
                  {browseQrUrl}
                </AppText>
              ) : null}
              <AppText variant="small" style={styles.cardMuted}>
                参加用QR（Phantom内ブラウザで開く・Android推奨）
              </AppText>
              <AppText variant="caption" style={styles.cardMuted}>
                上記URLをQRコード化して印刷してください。生徒はPhantomでスキャンするとアプリ内ブラウザで開きます。
              </AppText>
            </Card>

            <View {...printHiddenProps}>
              <Button title="印刷する" variant="secondary" onPress={handlePrint} />
            </View>
          </>
        )}
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
    color: adminTheme.colors.text,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.lg,
  },
  cardText: {
    color: adminTheme.colors.text,
  },
  cardMuted: {
    color: adminTheme.colors.textSecondary,
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
