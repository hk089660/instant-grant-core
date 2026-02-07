import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, AdminSearchBar, Card, AdminShell } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { mockParticipantLogs, getSharedParticipations, loadSharedParticipations } from '../../data/adminMock';
import { useAdminRole } from '../../hooks/useAdminRole';
import { toCsv, downloadTextFile } from '../../utils/csv';

/** 参加者ログ1件（モック・共有どちらも同じ形に正規化） */
interface ParticipantLogRow {
  id: string;
  display: string;
  code: string;
  eventName: string;
  time: string;
}

function normalizeParticipantLogs(): ParticipantLogRow[] {
  const mock = mockParticipantLogs.map((r: { id: string; display: string; code: string; time: string; event?: string; eventName?: string }) => ({
    id: r.id,
    display: r.display,
    code: r.code,
    eventName: (r.event ?? r.eventName) ?? '',
    time: r.time,
  }));
  const shared = getSharedParticipations().map((r) => ({
    id: r.id,
    display: r.display,
    code: r.code,
    eventName: r.eventName,
    time: r.time,
  }));
  return [...mock, ...shared];
}

/** 登録情報（ID・表示名・確認コード・イベント名）で検索 */
function filterByRegistrationInfo(rows: ParticipantLogRow[], query: string): ParticipantLogRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.id.toLowerCase().includes(q) ||
      r.display.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      r.eventName.toLowerCase().includes(q)
  );
}

const PARTICIPANT_CSV_HEADERS = ['内部ID', '表示名', '確認コード', 'イベント名', '参加時刻'] as const;

function downloadParticipationsCsv(rows: ParticipantLogRow[]): void {
  if (Platform.OS !== 'web') return;
  const csvRows = rows.map((r) => ({
    '内部ID': r.id,
    '表示名': r.display,
    '確認コード': r.code,
    'イベント名': r.eventName,
    '参加時刻': r.time,
  }));
  const csv = toCsv([...PARTICIPANT_CSV_HEADERS], csvRows);
  downloadTextFile('participations.csv', csv);
}

export const AdminParticipantsScreen: React.FC = () => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const { role, setRole, loading } = useAdminRole();

  useFocusEffect(
    useCallback(() => {
      loadSharedParticipations().then(() => setRefreshKey((k) => k + 1));
    }, [])
  );

  if (loading || role == null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <AppText variant="caption" style={{ color: adminTheme.colors.textSecondary }}>読み込み中…</AppText>
      </View>
    );
  }

  const allRows = normalizeParticipantLogs();
  const filteredRows = filterByRegistrationInfo(allRows, query);

  return (
    <AdminShell
      title="参加者検索"
      role={role}
      onRoleChange={setRole}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            参加者検索
          </AppText>
          <View style={styles.headerActions}>
            {Platform.OS === 'web' && filteredRows.length > 0 ? (
              <Button
                title="CSVダウンロード"
                variant="secondary"
                onPress={() => downloadParticipationsCsv(filteredRows)}
                style={styles.headerButton}
                tone="dark"
              />
            ) : null}
            <Button title="戻る" variant="secondary" onPress={() => router.back()} tone="dark" />
          </View>
        </View>

        <AdminSearchBar
          value={query}
          label="アカウント情報で絞り込み"
          placeholder="内部ID・表示名・確認コード・イベント名のいずれかを入力"
          hint="上記のいずれかに一致する参加者のみ一覧に表示されます"
          onChange={setQuery}
        />

        {query.trim() ? (
          <AppText variant="small" style={styles.countText}>
            {filteredRows.length}件
          </AppText>
        ) : null}
        <Card style={styles.card}>
          {filteredRows.length === 0 ? (
            <AppText variant="caption" style={styles.emptyText}>
              {query.trim() ? '該当する参加者はありません' : '参加記録はまだありません'}
            </AppText>
          ) : (
            filteredRows.map((result) => (
              <View key={`${result.id}-${result.code}-${result.time}`} style={styles.resultRow}>
                <View>
                  <AppText variant="bodyLarge" style={styles.cardText}>
                    {result.id}
                  </AppText>
                  <AppText variant="caption" style={styles.cardMuted}>
                    表示名: {result.display}
                  </AppText>
                  <AppText variant="caption" style={styles.cardMuted}>
                    イベント: {result.eventName}
                  </AppText>
                </View>
                <View style={styles.meta}>
                  <AppText variant="caption" style={styles.cardText}>
                    {result.code}
                  </AppText>
                  <AppText variant="small" style={styles.cardMuted}>
                    {result.time}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: adminTheme.spacing.sm,
  },
  headerButton: {
  },
  title: {
    color: adminTheme.colors.text,
  },
  countText: {
    color: adminTheme.colors.textTertiary,
    marginBottom: adminTheme.spacing.xs,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
  },
  emptyText: {
    color: adminTheme.colors.textTertiary,
    paddingVertical: adminTheme.spacing.lg,
    textAlign: 'center',
  },
  cardText: {
    color: adminTheme.colors.text,
  },
  cardMuted: {
    color: adminTheme.colors.textSecondary,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  meta: {
    alignItems: 'flex-end',
  },
});
