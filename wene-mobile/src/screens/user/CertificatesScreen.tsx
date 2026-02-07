import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, Card } from '../../ui/components';
import { theme } from '../../ui/theme';
import { getStudentSession } from '../../utils/studentSession';
import { getCertificatesByStudentId } from '../../api/certificates';
import type { Certificate } from '../../types/certificate';
import { schoolRoutes } from '../../lib/schoolRoutes';

function formatIssuedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  } catch {
    return iso;
  }
}

export const CertificatesScreen: React.FC = () => {
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCertificates = useCallback(async () => {
    const session = await getStudentSession();
    if (!session) {
      setCertificates([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const list = await getCertificatesByStudentId(session.studentId);
    setCertificates(list);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchCertificates().catch(() => setLoading(false));
    }, [fetchCertificates])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCertificates().catch(() => setRefreshing(false));
  }, [fetchCertificates]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <AppText variant="h2" style={styles.title}>
          参加証
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          参加が記録されたイベントの証明書一覧（新しい順）
        </AppText>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.colors.active} />
          </View>
        ) : certificates.length === 0 ? (
          <AppText variant="caption" style={styles.emptyText}>
            証明書はまだありません
          </AppText>
        ) : (
          certificates.map((cert) => (
            <Card key={cert.certificateId} style={styles.card}>
              <AppText variant="h3">{cert.eventName}</AppText>
              <AppText variant="caption" style={styles.meta}>
                {cert.organizerName}
                {cert.category ? ` ・ ${cert.category}` : ''}
              </AppText>
              <AppText variant="caption" style={styles.issued}>
                発行日: {formatIssuedAt(cert.issuedAt)}
              </AppText>
              {cert.note ? (
                <AppText variant="caption" style={styles.note}>
                  {cert.note}
                </AppText>
              ) : null}
            </Card>
          ))
        )}

        <Button
          title="参加券に戻る"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.backButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xxl,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  loading: {
    padding: theme.spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.sm,
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  meta: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  issued: {
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
  note: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  backButton: {
    marginTop: theme.spacing.lg,
  },
});
