/**
 * Admin 参加者検索画面
 * 全イベントの参加者を一覧表示（API から取得）
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, AdminShell } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { fetchAdminEvents, fetchClaimants, type Claimant } from '../../api/adminApi';

interface ParticipantLog extends Claimant {
  eventId: string;
  eventTitle: string;
}

export const AdminParticipantsScreen: React.FC = () => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [logs, setLogs] = useState<ParticipantLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAdminEvents()
      .then(async (events) => {
        // 各イベントの参加者を並列取得
        const all: ParticipantLog[] = [];
        await Promise.all(
          events.map(async (ev) => {
            try {
              const res = await fetchClaimants(ev.id);
              res.items.forEach((c) => {
                all.push({ ...c, eventId: ev.id, eventTitle: res.eventTitle });
              });
            } catch {
              // skip individual failures
            }
          })
        );
        // 新しい順
        all.sort((a, b) => {
          const ta = a.claimedAt ? new Date(a.claimedAt).getTime() : 0;
          const tb = b.claimedAt ? new Date(b.claimedAt).getTime() : 0;
          return tb - ta;
        });
        if (!cancelled) setLogs(all);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return logs;
    const q = query.toLowerCase();
    return logs.filter(
      (l) =>
        l.displayName.toLowerCase().includes(q) ||
        l.subject.toLowerCase().includes(q) ||
        (l.confirmationCode ?? '').toLowerCase().includes(q) ||
        l.eventTitle.toLowerCase().includes(q)
    );
  }, [logs, query]);

  const formatTime = (iso?: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch { return iso; }
  };

  return (
    <AdminShell title="参加者検索" role="admin">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            参加者検索
          </AppText>
          <Button title="戻る" variant="secondary" dark onPress={() => router.back()} />
        </View>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="名前・ID・確認コード・イベント名で検索"
          placeholderTextColor={adminTheme.colors.textTertiary}
        />

        <AppText variant="small" style={styles.note}>
          {loading ? '読み込み中…' : `${filtered.length} 件`}
        </AppText>

        {error ? (
          <Card style={styles.card}>
            <AppText style={styles.errorText}>{error}</AppText>
          </Card>
        ) : (
          <Card style={styles.card}>
            {filtered.length === 0 && !loading ? (
              <AppText variant="caption" style={styles.cardMuted}>
                該当する参加者が見つかりません
              </AppText>
            ) : (
              filtered.map((result, i) => (
                <View key={`${result.subject}-${result.eventId}-${i}`} style={styles.resultRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" style={styles.cardText}>
                      {result.displayName}
                    </AppText>
                    <AppText variant="small" style={styles.cardMuted}>
                      {result.subject.length > 16 ? result.subject.slice(0, 16) + '…' : result.subject}
                    </AppText>
                    <AppText variant="small" style={styles.cardDim}>
                      {result.eventTitle}
                    </AppText>
                  </View>
                  <View style={styles.meta}>
                    <AppText variant="caption" style={[styles.cardText, { fontFamily: 'monospace' }]}>
                      {result.confirmationCode ?? '-'}
                    </AppText>
                    <AppText variant="small" style={styles.cardMuted}>
                      {formatTime(result.claimedAt)}
                    </AppText>
                  </View>
                </View>
              ))
            )}
          </Card>
        )}
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
  searchInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    fontSize: 16,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
    marginBottom: adminTheme.spacing.sm,
  },
  note: {
    color: adminTheme.colors.textTertiary,
    marginBottom: adminTheme.spacing.sm,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    borderWidth: 1,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
  },
  cardText: { color: adminTheme.colors.text },
  cardMuted: { color: adminTheme.colors.textSecondary, marginTop: 1 },
  cardDim: { color: adminTheme.colors.textTertiary, marginTop: 1, fontSize: 11 },
  errorText: { color: '#ff6b6b' },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  meta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
