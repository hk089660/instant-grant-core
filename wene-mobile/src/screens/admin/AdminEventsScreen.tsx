import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, CountBadge, EventRow, AdminShell, StatusBadge, Loading } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import {
  closeAdminEvent,
  fetchAdminEvents,
  fetchPopStatus,
  type PopStatusResponse,
} from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';
import { copyTextWithFeedback } from '../../utils/copyText';

export const AdminEventsScreen: React.FC = () => {
  const router = useRouter();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [deletedQuery, setDeletedQuery] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsRefreshing, setEventsRefreshing] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [popStatus, setPopStatus] = useState<PopStatusResponse | null>(null);
  const [popStatusLoading, setPopStatusLoading] = useState(true);
  const [popStatusError, setPopStatusError] = useState<string | null>(null);
  const [popStatusCheckedAt, setPopStatusCheckedAt] = useState<string | null>(null);
  const [closingEventId, setClosingEventId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const eventsLoadSeq = useRef(0);
  const popStatusLoadSeq = useRef(0);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const loadEvents = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++eventsLoadSeq.current;
    if (options?.silent) {
      setEventsLoading(true);
    } else {
      setEventsRefreshing(true);
    }

    try {
      const nextEvents = await fetchAdminEvents();
      if (!mountedRef.current || eventsLoadSeq.current !== requestId) return;
      setEvents(nextEvents);
      setEventsError(null);
      if (!options?.silent) {
        setActionError(null);
      }
    } catch (e) {
      if (!mountedRef.current || eventsLoadSeq.current !== requestId) return;
      const message = e instanceof Error ? e.message : '読み込みに失敗しました。再読み込みしてください。';
      if (options?.silent) {
        setEvents([]);
        setEventsError(message);
      } else {
        setActionError(message);
      }
    } finally {
      if (!mountedRef.current || eventsLoadSeq.current !== requestId) return;
      if (options?.silent) {
        setEventsLoading(false);
      } else {
        setEventsRefreshing(false);
      }
    }
  }, []);

  const loadPopStatus = useCallback(async () => {
    const requestId = ++popStatusLoadSeq.current;
    setPopStatusLoading(true);
    setPopStatusError(null);

    try {
      const nextPopStatus = await fetchPopStatus();
      if (!mountedRef.current || popStatusLoadSeq.current !== requestId) return;
      setPopStatus(nextPopStatus);
      setPopStatusCheckedAt(new Date().toISOString());
    } catch (e) {
      if (!mountedRef.current || popStatusLoadSeq.current !== requestId) return;
      setPopStatus(null);
      setPopStatusError(e instanceof Error ? e.message : 'PoP状態の取得に失敗しました。');
    } finally {
      if (mountedRef.current && popStatusLoadSeq.current === requestId) {
        setPopStatusLoading(false);
      }
    }
  }, []);

  const loadInitialDashboard = useCallback(async () => {
    setEventsError(null);
    setActionError(null);
    setPopStatusError(null);
    await Promise.allSettled([
      loadEvents({ silent: true }),
      loadPopStatus(),
    ]);
  }, [loadEvents, loadPopStatus]);

  useEffect(() => {
    void loadInitialDashboard();
  }, [loadInitialDashboard]);

  const handleRefreshEvents = useCallback(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleRefreshPopStatus = useCallback(() => {
    void loadPopStatus();
  }, [loadPopStatus]);

  const handleCopyPopStatus = useCallback(async () => {
    if (!popStatus) return;
    const payload = [
      'PoP Runtime Proof',
      `checkedAt: ${popStatusCheckedAt ?? '-'}`,
      `enforceOnchainPop: ${String(popStatus.enforceOnchainPop)}`,
      `signerConfigured: ${String(popStatus.signerConfigured)}`,
      `signerPubkey: ${popStatus.signerPubkey ?? '-'}`,
      `error: ${popStatus.error ?? '-'}`,
      'endpoint: /v1/school/pop-status',
    ].join('\n');

    await copyTextWithFeedback(payload, {
      successMessage: 'PoP稼働情報をコピーしました',
    });
  }, [popStatus, popStatusCheckedAt]);

  const handleCloseEvent = useCallback(async (eventId: string) => {
    if (!eventId || closingEventId) return;
    setClosingEventId(eventId);
    setActionError(null);
    try {
      const updated = await closeAdminEvent(eventId);
      eventsLoadSeq.current += 1;
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
              ...event,
              ...updated,
              state: updated.state ?? 'ended',
            }
            : event
        )
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'イベントのクローズに失敗しました。');
    } finally {
      setClosingEventId(null);
    }
  }, [closingEventId]);

  const activeEvents = useMemo(
    () => events.filter((event) => (event.state ?? 'draft') !== 'ended'),
    [events]
  );
  const deletedEvents = useMemo(
    () => events.filter((event) => (event.state ?? 'draft') === 'ended'),
    [events]
  );
  const filteredDeletedEvents = useMemo(() => {
    const q = deletedQuery.trim().toLowerCase();
    if (!q) return deletedEvents;
    return deletedEvents.filter((event) =>
      event.title.toLowerCase().includes(q) ||
      event.host.toLowerCase().includes(q) ||
      event.datetime.toLowerCase().includes(q) ||
      event.id.toLowerCase().includes(q)
    );
  }, [deletedEvents, deletedQuery]);

  return (
    <AdminShell title="イベント一覧" role="admin">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            イベント一覧
          </AppText>
          <View style={styles.headerActions}>
            <Button
              title={eventsRefreshing ? '更新中…' : '更新'}
              variant="secondary"
              dark
              onPress={handleRefreshEvents}
              loading={eventsRefreshing}
              style={styles.headerRefreshButton}
            />
            <Button
              title="＋ 新規発行"
              variant="primary"
              onPress={() => router.push('/admin/create' as any)}
            />
          </View>
        </View>

        {actionError && (
          <View style={styles.inlineErrorBanner}>
            <AppText variant="small" style={styles.errorText}>
              {actionError}
            </AppText>
          </View>
        )}

        <View style={styles.teacherMessage}>
          <AppText variant="body" style={styles.teacherMessageText}>
            当日は Published のイベントを開いて『印刷用PDF』を出力 → 受付に掲示してください
          </AppText>
        </View>

        <View style={styles.popCard}>
          <View style={styles.popHeader}>
            <AppText variant="h3" style={styles.popTitle}>
              PoP稼働証明
            </AppText>
            <Button
              title={popStatusLoading ? '確認中…' : '再確認'}
              variant="secondary"
              dark
              onPress={handleRefreshPopStatus}
              disabled={popStatusLoading}
              style={styles.popRefreshButton}
            />
          </View>

          {popStatusLoading ? (
            <AppText variant="small" style={styles.popMuted}>
              PoP状態を確認中です...
            </AppText>
          ) : popStatusError ? (
            <AppText variant="small" style={styles.errorText}>
              {popStatusError}
            </AppText>
          ) : popStatus ? (
            <>
              <AppText
                variant="body"
                style={popStatus.enforceOnchainPop && popStatus.signerConfigured ? styles.popOkText : styles.popWarnText}
              >
                {popStatus.enforceOnchainPop && popStatus.signerConfigured
                  ? 'PoPは稼働中です（on-chain強制 + 署名者設定済み）'
                  : 'PoP設定が未完了です'}
              </AppText>
              <AppText variant="small" style={styles.popMuted}>
                enforceOnchainPop: {String(popStatus.enforceOnchainPop)}
              </AppText>
              <AppText variant="small" style={styles.popMuted}>
                signerConfigured: {String(popStatus.signerConfigured)}
              </AppText>
              {popStatus.signerPubkey ? (
                <AppText variant="small" style={styles.popMono} selectable>
                  signerPubkey: {popStatus.signerPubkey}
                </AppText>
              ) : null}
              {popStatus.error ? (
                <AppText variant="small" style={styles.errorText}>
                  error: {popStatus.error}
                </AppText>
              ) : null}
              <AppText variant="small" style={styles.popMuted}>
                checkedAt: {popStatusCheckedAt ?? '-'}
              </AppText>
              <AppText variant="small" style={styles.popMuted}>
                verification endpoint: /v1/school/pop-status
              </AppText>
              <Button
                title="PoP情報をコピー"
                variant="secondary"
                dark
                size="medium"
                onPress={handleCopyPopStatus}
                style={styles.popCopyButton}
              />
            </>
          ) : (
            <AppText variant="small" style={styles.popMuted}>
              PoP状態を取得できませんでした
            </AppText>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <AppText variant="h3" style={styles.sectionTitle}>
            イベント一覧
          </AppText>
          <AppText variant="small" style={styles.sectionNote}>
            消去済みイベントは下の別一覧に移動します
          </AppText>
        </View>

        <View style={styles.list}>
          {eventsLoading ? (
            <View style={styles.stateContainer}>
              <Loading message="イベントを読み込み中です..." size="large" mode="admin" />
            </View>
          ) : eventsError ? (
            <View style={styles.stateContainer}>
              <AppText style={styles.errorText}>{eventsError}</AppText>
              <Button
                title="再読み込み"
                variant="secondary"
                dark
                onPress={() => void loadInitialDashboard()}
                style={styles.retryButton}
              />
            </View>
          ) : activeEvents.length === 0 ? (
            <View style={styles.stateContainer}>
              <AppText style={styles.emptyText}>表示中のイベントはありません。</AppText>
            </View>
          ) : (
            activeEvents.map((event) => {
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
                        <>
                          <Button
                            title="印刷用PDF"
                            variant="primary"
                            onPress={() => router.push(`/admin/print/${event.id}` as any)}
                            style={styles.printButton}
                          />
                          <Button
                            title="イベントをクローズ"
                            variant="secondary"
                            dark
                            size="medium"
                            onPress={() => void handleCloseEvent(event.id)}
                            loading={closingEventId === event.id}
                            disabled={Boolean(closingEventId && closingEventId !== event.id)}
                            style={styles.closeButton}
                          />
                        </>
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

        {!eventsLoading && !eventsError && (
          <>
            <View style={styles.sectionHeader}>
              <AppText variant="h3" style={styles.sectionTitle}>
                消去済みイベント
              </AppText>
              <AppText variant="small" style={styles.sectionNote}>
                {deletedEvents.length} 件 / 表示 {filteredDeletedEvents.length} 件
              </AppText>
            </View>

            <View style={styles.archivedCard}>
              <TextInput
                style={styles.searchInput}
                value={deletedQuery}
                onChangeText={setDeletedQuery}
                placeholder="消去済みイベントを検索（イベント名 / 主催 / ID）"
                placeholderTextColor={adminTheme.colors.textTertiary}
              />

              {deletedEvents.length === 0 ? (
                <View style={styles.stateContainer}>
                  <AppText style={styles.emptyText}>消去済みイベントはありません。</AppText>
                </View>
              ) : filteredDeletedEvents.length === 0 ? (
                <View style={styles.stateContainer}>
                  <AppText style={styles.emptyText}>該当する消去済みイベントが見つかりません。</AppText>
                </View>
              ) : (
                filteredDeletedEvents.map((event) => (
                  <EventRow
                    key={`archived:${event.id}`}
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
                        <StatusBadge state="ended" />
                        <AppText variant="small" style={styles.warningText}>
                          消去済み一覧からのみ表示
                        </AppText>
                      </View>
                    }
                    onPress={() => router.push(`/admin/events/${event.id}` as any)}
                    style={styles.row}
                  />
                ))
              )}
            </View>
          </>
        )}

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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: adminTheme.spacing.sm,
  },
  headerRefreshButton: {
    minWidth: 96,
  },
  title: {
    color: adminTheme.colors.text,
  },
  inlineErrorBanner: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    marginBottom: adminTheme.spacing.md,
  },
  sectionHeader: {
    marginBottom: adminTheme.spacing.sm,
  },
  sectionTitle: {
    color: adminTheme.colors.text,
  },
  sectionNote: {
    color: adminTheme.colors.textTertiary,
    marginTop: 2,
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
  popCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  popHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.sm,
  },
  popTitle: {
    color: adminTheme.colors.text,
  },
  popRefreshButton: {
    minWidth: 100,
  },
  popOkText: {
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.xs,
  },
  popWarnText: {
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.xs,
  },
  popMuted: {
    color: adminTheme.colors.textSecondary,
    marginTop: 2,
  },
  popMono: {
    color: adminTheme.colors.text,
    marginTop: adminTheme.spacing.xs,
    fontFamily: 'monospace',
  },
  popCopyButton: {
    marginTop: adminTheme.spacing.sm,
    alignSelf: 'flex-start',
    minWidth: 140,
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
  archivedCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    marginBottom: adminTheme.spacing.lg,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.background,
    marginBottom: adminTheme.spacing.sm,
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
  closeButton: {
    marginTop: adminTheme.spacing.xs,
    minWidth: 140,
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
  emptyText: {
    color: adminTheme.colors.text,
  },
});
