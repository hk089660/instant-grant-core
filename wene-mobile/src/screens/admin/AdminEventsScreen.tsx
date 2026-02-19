import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, CountBadge, EventRow, AdminShell, StatusBadge, Loading } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { fetchAdminEvents } from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';

export const AdminEventsScreen: React.FC = () => {
  const router = useRouter();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchAdminEvents()
      .then((items) => {
        if (!cancelled) {
          setEvents(items);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '読み込みに失敗しました。再読み込みしてください。');
          setEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setError(null);

    fetchAdminEvents()
      .then((items) => {
        setEvents(items);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '読み込みに失敗しました。再読み込みしてください。');
        setEvents([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <AdminShell title="イベント一覧" role="admin">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            イベント一覧
          </AppText>
          <Button
            title="＋ 新規発行"
            variant="primary"
            onPress={() => router.push('/admin/create' as any)}
          />
        </View>

        <View style={styles.teacherMessage}>
          <AppText variant="body" style={styles.teacherMessageText}>
            当日は Published のイベントを開いて『印刷用PDF』を出力 → 受付に掲示してください
          </AppText>
        </View>

        <View style={styles.list}>
          {loading ? (
            <View style={styles.stateContainer}>
              <Loading message="イベントを読み込み中です..." size="large" />
            </View>
          ) : error ? (
            <View style={styles.stateContainer}>
              <AppText style={styles.errorText}>{error}</AppText>
              <Button
                title="再読み込み"
                variant="secondary"
                dark
                onPress={handleRetry}
                style={styles.retryButton}
              />
            </View>
          ) : events.length === 0 ? (
            <View style={styles.stateContainer}>
              <AppText>表示できるイベントがありません。</AppText>
            </View>
          ) : (
            events.map((event) => {
              const state = event.state ?? 'draft';
              const isPublished = state === 'published';
              const isDraft = state === 'draft';

              return (
                <EventRow
                  key={event.id}
                  title={event.title}
                  datetime={event.datetime}
                  host={event.host}
                  textColor={adminTheme.colors.text}
                  leftSlot={
                    <CountBadge
                      value={event.claimedCount ?? 0}
                      backgroundColor={adminTheme.colors.muted}
                      textColor={adminTheme.colors.textSecondary}
                    />
                  }
                  rightSlot={
                    <View style={styles.cardRight}>
                      <StatusBadge state={state} />
                      {isPublished ? (
                        <Button
                          title="印刷用PDF"
                          variant="primary"
                          onPress={() => router.push(`/admin/print/${event.id}` as any)}
                          style={styles.printButton}
                        />
                      ) : (
                        <AppText variant="small" style={styles.warningText}>
                          {isDraft
                            ? '未公開のため受付QRは出せません'
                            : '終了済みのため受付QRは出せません'}
                        </AppText>
                      )}
                    </View>
                  }
                  onPress={() => router.push(`/admin/events/${event.id}` as any)}
                  style={styles.row}
                />
              );
            })
          )}
        </View>

        <AppText variant="small" style={styles.note}>
          RT=現在までの参加完了数
        </AppText>
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  content: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
  },
  title: {
    color: adminTheme.colors.text,
  },
  teacherMessage: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  teacherMessageText: {
    color: adminTheme.colors.text,
  },
  list: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    marginBottom: adminTheme.spacing.lg,
  },
  stateContainer: {
    paddingVertical: adminTheme.spacing.lg,
    alignItems: 'center',
  },
  row: {
    borderBottomColor: adminTheme.colors.border,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: adminTheme.spacing.xs,
  },
  printButton: {
    marginTop: adminTheme.spacing.xs,
  },
  warningText: {
    color: adminTheme.colors.textSecondary,
    maxWidth: 220,
    textAlign: 'right',
  },
  errorText: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.sm,
  },
  retryButton: {
    marginTop: adminTheme.spacing.xs,
  },
  note: {
    color: adminTheme.colors.textTertiary,
    marginTop: adminTheme.spacing.sm,
  },
});
