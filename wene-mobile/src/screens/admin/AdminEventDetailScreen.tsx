import React, { useMemo, useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { AppText, Button, Card, AdminShell, AdminSearchBar } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { mockParticipants, getDisplayRtCount, getSharedParticipationsByEventId, loadSharedParticipations } from '../../data/adminMock';
import { useAdminRole } from '../../hooks/useAdminRole';
import { getEventByIdSync, getEventsSync } from '../../data/adminEventsStore';
import { eventStateLabel } from '../../types/ui';
import { getEventScanUrl } from '../../utils/appUrl';
import { toCsv, downloadTextFile } from '../../utils/csv';

function filterParticipantsByQuery(
  participants: Array<{ id: string; display: string; code: string; time: string }>,
  query: string
): Array<{ id: string; display: string; code: string; time: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return participants;
  return participants.filter(
    (p) =>
      p.id.toLowerCase().includes(q) ||
      p.display.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.time.includes(q)
  );
}

export const AdminEventDetailScreen: React.FC = () => {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { role, setRole, loading } = useAdminRole();
  if (loading || role == null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <AppText variant="caption" style={{ color: adminTheme.colors.textSecondary }}>読み込み中…</AppText>
      </View>
    );
  }
  const [participantQuery, setParticipantQuery] = React.useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const canPrint = role === 'admin';
  const canDownloadCsv = role === 'admin';
  const event = getEventByIdSync(eventId ?? '') ?? getEventsSync()[0];

  useFocusEffect(
    useCallback(() => {
      loadSharedParticipations().then(() => setRefreshKey((k) => k + 1));
    }, [])
  );

  if (!event) {
    return (
      <AdminShell title="イベント詳細" role={role} onRoleChange={setRole}>
        <View style={styles.content}>
          <AppText variant="h3" style={styles.title}>イベントが見つかりません</AppText>
          <Button title="一覧へ戻る" variant="secondary" onPress={() => router.replace('/admin' as any)} tone="dark" />
        </View>
      </AdminShell>
    );
  }

  const filteredParticipants = useMemo(() => {
    const all = [...mockParticipants, ...getSharedParticipationsByEventId(event.id)];
    return filterParticipantsByQuery(all, participantQuery);
  }, [event.id, participantQuery, refreshKey]);

  const handleDownloadCsv = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const headers = ['内部ID', '表示名', '確認コード', '参加時刻'];
    const rows = filteredParticipants.map((p) => ({
      '内部ID': p.id,
      '表示名': p.display,
      '確認コード': p.code,
      '参加時刻': p.time,
    }));
    const csv = toCsv(headers, rows);
    const safeTitle = event.title.replace(/[/\\?*:"]/g, '_').slice(0, 50);
    downloadTextFile(`event-${event.id}-${safeTitle}.csv`, csv);
  }, [event.id, event.title, filteredParticipants]);

  return (
    <AdminShell
      title="イベント詳細"
      role={role}
      onRoleChange={setRole}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            イベント詳細
          </AppText>
          <Button title="戻る" variant="secondary" onPress={() => router.back()} tone="dark" />
        </View>

        <Card style={styles.card}>
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
            ID: {event.id}
          </AppText>
          <AppText variant="small" style={styles.cardMuted}>
            状態: {eventStateLabel[event.state]}
          </AppText>
        </Card>

        <View style={styles.counts}>
          <Card style={styles.countCard}>
            <AppText variant="caption" style={styles.cardText}>
              リアルタイム参加数
            </AppText>
            <AppText variant="h2" style={styles.cardText}>
              {getDisplayRtCount(event.id)}
            </AppText>
          </Card>
          <Card style={styles.countCard}>
            <AppText variant="caption" style={styles.cardText}>
              定員（総数）
            </AppText>
            <AppText variant="h2" style={styles.cardText}>
              {event.totalCount}
            </AppText>
          </Card>
        </View>

        <Card style={styles.card}>
          <AppText variant="h3" style={styles.cardText}>
            QR表示
          </AppText>
          <View style={styles.qrBox}>
            <QRCode
              value={getEventScanUrl(event.id)}
              size={Platform.OS === 'web' ? 180 : 200}
              backgroundColor="#ffffff"
              color="#000000"
            />
          </View>
          <View style={styles.qrActions}>
            <Button title="QRを表示" variant="secondary" onPress={() => {}} tone="dark" />
            {canPrint ? (
              <Button
                title="印刷用PDF"
                variant="secondary"
                onPress={() => router.push(`/admin/print/${eventId}` as any)}
                style={styles.secondaryButton}
                tone="dark"
              />
            ) : null}
          </View>
        </Card>

        {canDownloadCsv && Platform.OS === 'web' ? (
          <View style={styles.actions}>
            <Button title="CSVダウンロード" variant="secondary" onPress={handleDownloadCsv} tone="dark" />
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <AppText variant="h3" style={styles.title}>
            参加者一覧
          </AppText>
          <AppText variant="small" style={styles.muted}>
            個人情報は表示しません。下の欄でアカウント情報から絞り込めます。
          </AppText>
        </View>
        <AdminSearchBar
          value={participantQuery}
          label="アカウント情報で絞り込み"
          placeholder="内部ID・表示名・確認コード・参加時刻のいずれかを入力"
          hint="このイベントの参加者一覧をアカウント情報で絞り込みます"
          onChange={setParticipantQuery}
        />
        {participantQuery.trim() ? (
          <AppText variant="small" style={styles.filterCount}>
            {filteredParticipants.length}件
          </AppText>
        ) : null}
        <Card style={StyleSheet.flatten([styles.card, styles.participantCard])}>
          <View style={styles.tableHeader}>
            <AppText variant="small" style={styles.participantMuted}>
              内部ID
            </AppText>
            <AppText variant="small" style={styles.participantMuted}>
              表示名
            </AppText>
            <AppText variant="small" style={styles.participantMuted}>
              確認コード
            </AppText>
            <AppText variant="small" style={styles.participantMuted}>
              参加時刻
            </AppText>
          </View>
          {filteredParticipants.length === 0 ? (
            <View style={styles.participantRow}>
              <AppText variant="caption" style={styles.participantMuted}>
                {participantQuery.trim() ? '該当する参加者はいません' : '参加者はまだいません'}
              </AppText>
            </View>
          ) : (
            filteredParticipants.map((p) => (
            <View key={`${p.id}-${p.code}-${p.time}`} style={styles.participantRow}>
              <View style={styles.participantInfo}>
                <AppText variant="bodyLarge" style={styles.participantText}>
                  {p.id}
                </AppText>
                <AppText variant="caption" style={styles.participantMuted}>
                  表示名: {p.display}
                </AppText>
              </View>
              <View style={styles.participantMeta}>
                <AppText variant="caption" style={styles.participantText}>
                  {p.code}
                </AppText>
                <AppText variant="small" style={styles.participantMuted}>
                  {p.time}
                </AppText>
              </View>
            </View>
            ))
          )}
        </Card>
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  content: {
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
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
  counts: {
    flexDirection: 'row',
    gap: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
  },
  countCard: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
  },
  qrBox: {
    height: 200,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.md,
  },
  qrActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryButton: {
    marginLeft: adminTheme.spacing.sm,
  },
  actions: {
    marginBottom: adminTheme.spacing.lg,
  },
  sectionHeader: {
    marginBottom: adminTheme.spacing.sm,
  },
  filterCount: {
    color: adminTheme.colors.textTertiary,
    marginBottom: adminTheme.spacing.xs,
  },
  muted: {
    color: adminTheme.colors.textTertiary,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  participantInfo: {
    flex: 1,
  },
  participantMeta: {
    alignItems: 'flex-end',
  },
  participantCard: {
    backgroundColor: adminTheme.colors.surface,
  },
  participantText: {
    color: adminTheme.colors.text,
  },
  participantMuted: {
    color: adminTheme.colors.textSecondary,
  },
});
