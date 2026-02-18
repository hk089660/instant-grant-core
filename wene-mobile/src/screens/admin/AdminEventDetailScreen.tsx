import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as QRCode from 'qrcode';
import { AppText, Button, Card, AdminShell } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { fetchAdminEvent, fetchClaimants, type Claimant } from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';

export const AdminEventDetailScreen: React.FC = () => {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [event, setEvent] = useState<(SchoolEvent & { claimedCount: number }) | null>(null);
  const [claimants, setClaimants] = useState<Claimant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchAdminEvent(eventId),
      fetchClaimants(eventId),
    ])
      .then(([ev, cl]) => {
        if (!cancelled) {
          setEvent(ev);
          setClaimants(cl.items);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [eventId]);

  // QR 生成
  const scanUrl = useMemo(() => {
    if (!event) return '';
    const base = typeof window !== 'undefined' ? window.location.origin : (process.env.EXPO_PUBLIC_BASE_URL ?? '');
    return `${base}/u/scan?eventId=${encodeURIComponent(event.id)}`;
  }, [event]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !scanUrl) return;
    QRCode.toDataURL(scanUrl, { width: 200, margin: 2 })
      .then((url: string) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null));
  }, [scanUrl]);

  const handleRefresh = () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    Promise.all([fetchAdminEvent(eventId), fetchClaimants(eventId)])
      .then(([ev, cl]) => { setEvent(ev); setClaimants(cl.items); })
      .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false));
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch { return iso; }
  };

  if (loading) {
    return (
      <AdminShell title="イベント詳細" role="admin">
        <View style={styles.center}>
          <AppText style={styles.muted}>読み込み中…</AppText>
        </View>
      </AdminShell>
    );
  }

  if (error || !event) {
    return (
      <AdminShell title="イベント詳細" role="admin">
        <View style={styles.center}>
          <AppText style={styles.errorText}>{error ?? 'イベントが見つかりません'}</AppText>
          <Button title="再読み込み" variant="secondary" onPress={handleRefresh} style={{ marginTop: 12 }} />
          <Button title="戻る" variant="secondary" onPress={() => router.back()} style={{ marginTop: 8 }} />
        </View>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="イベント詳細" role="admin">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            イベント詳細
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="更新" variant="secondary" onPress={handleRefresh} />
            <Button title="戻る" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>

        {/* イベント情報 */}
        <Card style={styles.card}>
          <View style={styles.stateBadge}>
            <AppText variant="small" style={{
              color: event.state === 'published' ? '#00c853' : '#ff9800',
              fontWeight: '700',
            }}>
              {event.state === 'published' ? '公開中' : event.state === 'draft' ? '下書き' : '終了'}
            </AppText>
          </View>
          <AppText variant="h3" style={styles.cardText}>{event.title}</AppText>
          <AppText variant="caption" style={styles.cardMuted}>{event.datetime}</AppText>
          <AppText variant="caption" style={styles.cardMuted}>主催: {event.host}</AppText>
          <AppText variant="small" style={styles.cardDim}>ID: {event.id}</AppText>
        </Card>

        {/* 統計 */}
        <View style={styles.stats}>
          <Card style={styles.statCard}>
            <AppText variant="caption" style={styles.cardMuted}>参加済み</AppText>
            <AppText variant="h2" style={styles.cardText}>{event.claimedCount}</AppText>
          </Card>
          <Card style={styles.statCard}>
            <AppText variant="caption" style={styles.cardMuted}>参加者数</AppText>
            <AppText variant="h2" style={styles.cardText}>{claimants.length}</AppText>
          </Card>
        </View>

        {/* QR */}
        {event.state === 'published' && (
          <Card style={styles.card}>
            <AppText variant="h3" style={styles.cardText}>受付QR</AppText>
            <View style={styles.qrBox}>
              {qrDataUrl ? (
                Platform.OS === 'web' ? (
                  // @ts-ignore
                  <img src={qrDataUrl} alt="QR" style={{ width: 180, height: 180 }} />
                ) : null
              ) : (
                <AppText variant="caption" style={styles.cardMuted}>QR生成中…</AppText>
              )}
            </View>
            <Button
              title="印刷用PDF"
              variant="secondary"
              onPress={() => router.push(`/admin/print/${event.id}` as any)}
              style={{ marginTop: 12 }}
            />
          </Card>
        )}

        {/* 参加者一覧 */}
        <View style={styles.sectionHeader}>
          <AppText variant="h3" style={styles.title}>参加者一覧</AppText>
          <AppText variant="small" style={styles.muted}>
            合計 {claimants.length} 名
          </AppText>
        </View>

        <Card style={styles.card}>
          {claimants.length === 0 ? (
            <View style={styles.center}>
              <AppText variant="caption" style={styles.cardMuted}>
                まだ参加者がいません
              </AppText>
            </View>
          ) : (
            <>
              {/* ヘッダー */}
              <View style={styles.tableHeader}>
                <AppText variant="small" style={[styles.cardDim, { flex: 2 }]}>表示名</AppText>
                <AppText variant="small" style={[styles.cardDim, { flex: 1, textAlign: 'center' }]}>確認コード</AppText>
                <AppText variant="small" style={[styles.cardDim, { flex: 1, textAlign: 'right' }]}>参加時刻</AppText>
              </View>
              {claimants.map((p, i) => (
                <View key={`${p.subject}-${i}`} style={styles.participantRow}>
                  <View style={{ flex: 2 }}>
                    <AppText variant="body" style={styles.cardText}>{p.displayName}</AppText>
                    <AppText variant="small" style={styles.cardDim}>
                      {p.subject.length > 12 ? p.subject.slice(0, 12) + '…' : p.subject}
                    </AppText>
                  </View>
                  <AppText variant="caption" style={[styles.cardText, { flex: 1, textAlign: 'center', fontFamily: 'monospace' }]}>
                    {p.confirmationCode ?? '-'}
                  </AppText>
                  <AppText variant="small" style={[styles.cardMuted, { flex: 1, textAlign: 'right' }]}>
                    {formatTime(p.claimedAt)}
                  </AppText>
                </View>
              ))}
            </>
          )}
        </Card>

        {/* CSV ダウンロード */}
        <Button
          title="CSVダウンロード"
          variant="secondary"
          onPress={() => {
            if (typeof window === 'undefined') return;
            const rows = [['表示名', 'サブジェクト', '確認コード', '参加時刻']];
            claimants.forEach((c) => {
              rows.push([c.displayName, c.subject, c.confirmationCode ?? '', c.claimedAt ?? '']);
            });
            const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${event.title}_participants.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{ marginBottom: adminTheme.spacing.lg }}
        />
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
  },
  title: { color: adminTheme.colors.text },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    borderWidth: 1,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
  },
  cardText: { color: adminTheme.colors.text },
  cardMuted: { color: adminTheme.colors.textSecondary, marginTop: 2 },
  cardDim: { color: adminTheme.colors.textTertiary, marginTop: 2 },
  center: {
    paddingVertical: adminTheme.spacing.lg,
    alignItems: 'center',
  },
  muted: { color: adminTheme.colors.textTertiary },
  errorText: { color: '#ff6b6b' },
  stateBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: adminTheme.spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    gap: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    borderWidth: 1,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    alignItems: 'center',
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: adminTheme.spacing.md,
    padding: adminTheme.spacing.sm,
    backgroundColor: '#ffffff',
    borderRadius: adminTheme.radius.md,
    minHeight: 200,
  },
  sectionHeader: {
    marginBottom: adminTheme.spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.xs,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
});
