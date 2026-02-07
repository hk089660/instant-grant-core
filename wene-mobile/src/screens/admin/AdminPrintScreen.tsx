import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { AppText, Button, Card } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { useAdminRole } from '../../hooks/useAdminRole';
import { getEventByIdSync, getEventsSync } from '../../data/adminEventsStore';
import { roleLabel } from '../../types/ui';
import { getEventScanUrl, getEventJoinUrl } from '../../utils/appUrl';
import { getSchoolApiBaseUrl } from '../../config/api';
import { apiFetchJoinToken } from '../../api/adminApiClient';

export const AdminPrintScreen: React.FC = () => {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { role, loading } = useAdminRole();
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const event = getEventByIdSync(eventId ?? '') ?? getEventsSync()[0];

  const fetchToken = useCallback(async () => {
    if (!event?.id || !getSchoolApiBaseUrl()) return;
    setTokenLoading(true);
    try {
      const data = await apiFetchJoinToken(event.id);
      setJoinToken(data?.token ?? null);
    } catch {
      setJoinToken(null);
    } finally {
      setTokenLoading(false);
    }
  }, [event?.id]);

  useEffect(() => {
    if (event?.id && getSchoolApiBaseUrl() && role === 'admin') fetchToken();
  }, [event?.id, role, fetchToken]);

  if (loading || role == null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <AppText variant="caption" style={{ color: adminTheme.colors.textSecondary }}>読み込み中…</AppText>
      </View>
    );
  }
  const isAdmin = role === 'admin';
  const printHiddenProps = { 'data-print-hidden': 'true' } as any;
  const printCardProps = { 'data-print-card': 'true' } as any;
  const printQrProps = { 'data-print-qr': 'true' } as any;
  const scanUrl = getSchoolApiBaseUrl() && joinToken ? getEventJoinUrl(event.id, joinToken) : getEventScanUrl(event.id);

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
            <Button title="戻る" variant="secondary" onPress={() => router.back()} tone="dark" />
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
                {event.title}
              </AppText>
              <AppText variant="caption" style={styles.cardText}>
                {event.datetime}
              </AppText>
              <AppText variant="caption" style={styles.cardText}>
                主催: {event.host}
              </AppText>
              <AppText variant="small" style={styles.cardMuted}>
                イベントID: {eventId}
              </AppText>
              <View style={styles.qrBox} {...printQrProps}>
                <QRCode
                  value={scanUrl}
                  size={220}
                  backgroundColor="#ffffff"
                  color="#000000"
                />
              </View>
              <AppText variant="small" style={styles.cardMuted}>
                参加用QRコード：読み取ると参加画面が開きます。印刷して受付でご利用ください。
              </AppText>
            </Card>

            <View {...printHiddenProps}>
              <Button title="印刷する" variant="secondary" onPress={handlePrint} tone="dark" />
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
    backgroundColor: adminTheme.colors.background,
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
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: adminTheme.spacing.md,
  },
});
