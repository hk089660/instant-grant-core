/**
 * Admin 参加者検索画面
 * イベント単位で参加者を検索して一覧表示
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Platform, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, AdminShell, Loading } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { fetchAdminEvents, fetchClaimants, type Claimant } from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';

export const AdminParticipantsScreen: React.FC = () => {
  const router = useRouter();
  const [events, setEvents] = useState<(SchoolEvent & { claimedCount: number })[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [claimants, setClaimants] = useState<Claimant[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingClaimants, setLoadingClaimants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setError(null);
    try {
      const fetched = await fetchAdminEvents();
      setEvents(fetched);
      if (fetched.length === 0) {
        setSelectedEventId(null);
        setClaimants([]);
        return;
      }
      setSelectedEventId((current) => {
        if (current && fetched.some((event) => event.id === current)) return current;
        return fetched[0].id;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'イベント一覧の読み込みに失敗しました');
      setEvents([]);
      setSelectedEventId(null);
      setClaimants([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadEvents().catch(() => { });
  }, [loadEvents]);

  const loadClaimants = useCallback(async (eventId: string) => {
    setLoadingClaimants(true);
    setError(null);
    try {
      const response = await fetchClaimants(eventId);
      const sorted = [...response.items].sort((a, b) => {
        const ta = a.claimedAt ? new Date(a.claimedAt).getTime() : 0;
        const tb = b.claimedAt ? new Date(b.claimedAt).getTime() : 0;
        return tb - ta;
      });
      setClaimants(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : '参加者一覧の読み込みに失敗しました');
      setClaimants([]);
    } finally {
      setLoadingClaimants(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      setClaimants([]);
      return;
    }
    loadClaimants(selectedEventId).catch(() => { });
  }, [selectedEventId, loadClaimants]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return claimants;
    const q = query.toLowerCase();
    return claimants.filter(
      (l) =>
        l.displayName.toLowerCase().includes(q) ||
        l.subject.toLowerCase().includes(q) ||
        (l.confirmationCode ?? '').toLowerCase().includes(q)
    );
  }, [claimants, query]);

  const handleDownloadCsv = useCallback(() => {
    if (!selectedEvent || typeof window === 'undefined') return;
    const rows: string[][] = [
      ['イベントID', selectedEvent.id],
      ['イベント名', selectedEvent.title],
      ['参加者数', String(filtered.length)],
      ['', ''],
      ['表示名', '利用者識別子', '確認コード', '参加時刻'],
    ];
    filtered.forEach((participant) => {
      rows.push([
        participant.displayName || '-',
        participant.subject || '-',
        participant.confirmationCode ?? '',
        participant.claimedAt ?? '',
      ]);
    });
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedEvent.title}_participants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, selectedEvent]);

  const handleRetry = useCallback(() => {
    if (!selectedEventId) {
      loadEvents().catch(() => { });
      return;
    }
    loadClaimants(selectedEventId).catch(() => { });
  }, [selectedEventId, loadClaimants, loadEvents]);

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
          <View style={styles.headerButtons}>
            <Button title="更新" variant="secondary" dark onPress={handleRetry} />
            <Button title="戻る" variant="secondary" dark onPress={() => router.back()} />
          </View>
        </View>

        <Card style={styles.card}>
          <AppText variant="small" style={styles.cardDim}>
            イベントを選択
          </AppText>
          {loadingEvents ? (
            <View style={styles.center}>
              <Loading message="イベント一覧を読み込み中です..." size="small" mode="admin" />
            </View>
          ) : events.length === 0 ? (
            <AppText variant="caption" style={styles.cardMuted}>
              イベントがありません
            </AppText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventPills}>
              {events.map((event) => {
                const selected = event.id === selectedEventId;
                return (
                  <TouchableOpacity
                    key={event.id}
                    activeOpacity={0.85}
                    style={[styles.eventPill, selected && styles.eventPillActive]}
                    onPress={() => {
                      setSelectedEventId(event.id);
                      setQuery('');
                    }}
                  >
                    <AppText variant="small" style={[styles.eventPillTitle, selected && styles.eventPillTitleActive]}>
                      {event.title}
                    </AppText>
                    <AppText variant="small" style={[styles.eventPillMeta, selected && styles.eventPillMetaActive]}>
                      ID: {event.id}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </Card>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="登録名・利用者ID・確認コードで検索"
          placeholderTextColor={adminTheme.colors.textTertiary}
        />

        <AppText variant="small" style={styles.note}>
          {selectedEvent ? `${selectedEvent.title} / 合計 ${claimants.length} 名 / 表示 ${filtered.length} 名` : 'イベントを選択してください'}
        </AppText>

        {loadingClaimants ? (
          <Card style={styles.card}>
            <Loading message="参加者データを読み込み中です..." size="large" mode="admin" />
          </Card>
        ) : error ? (
          <Card style={styles.card}>
            <AppText style={styles.errorText}>{error}</AppText>
            <Button
              title="再読み込み"
              variant="secondary"
              dark
              onPress={handleRetry}
              style={styles.retryButton}
            />
          </Card>
        ) : (
          <Card style={styles.card}>
            {filtered.length === 0 ? (
              <AppText variant="caption" style={styles.cardMuted}>
                該当する参加者が見つかりません
              </AppText>
            ) : (
              filtered.map((result, i) => (
                <View
                  key={`${result.subject}-${i}`}
                  style={[styles.resultRow, i === filtered.length - 1 && styles.resultRowLast]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" style={styles.cardText}>
                      {result.displayName}
                    </AppText>
                    <AppText variant="small" style={styles.cardMuted}>
                      {result.subject.length > 16 ? result.subject.slice(0, 16) + '…' : result.subject}
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

        <Button
          title="参加者一覧CSVをダウンロード"
          variant="secondary"
          dark
          onPress={handleDownloadCsv}
          disabled={!selectedEventId || filtered.length === 0 || Platform.OS !== 'web'}
          style={styles.csvButton}
        />
        {Platform.OS !== 'web' ? (
          <AppText variant="small" style={styles.cardDim}>
            CSVダウンロードはWeb管理画面で利用できます
          </AppText>
        ) : null}
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
  headerButtons: {
    flexDirection: 'row',
    gap: adminTheme.spacing.xs,
  },
  title: { color: adminTheme.colors.text },
  center: {
    paddingVertical: adminTheme.spacing.md,
    alignItems: 'center',
  },
  eventPills: {
    marginTop: adminTheme.spacing.sm,
    gap: adminTheme.spacing.xs,
    paddingRight: adminTheme.spacing.sm,
  },
  eventPill: {
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    backgroundColor: adminTheme.colors.background,
    minWidth: 170,
  },
  eventPillActive: {
    borderColor: adminTheme.colors.text,
    backgroundColor: '#1f1f1f',
  },
  eventPillTitle: {
    color: adminTheme.colors.text,
    fontWeight: '700',
  },
  eventPillTitleActive: {
    color: '#ffffff',
  },
  eventPillMeta: {
    color: adminTheme.colors.textTertiary,
    marginTop: 2,
    fontSize: 11,
  },
  eventPillMetaActive: {
    color: '#d4d4d4',
  },
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
  errorText: { color: adminTheme.colors.text },
  retryButton: {
    marginTop: adminTheme.spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  resultRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  meta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  csvButton: {
    marginTop: adminTheme.spacing.md,
  },
});
