import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, CountBadge, EventRow, AdminShell, StatusBadge, Loading } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { fetchAdminEvents, fetchPopStatus, type PopStatusResponse } from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';
import { copyTextWithFeedback } from '../../utils/copyText';

export const AdminEventsScreen: React.FC = () => {
  const router = useRouter();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popStatus, setPopStatus] = useState<PopStatusResponse | null>(null);
  const [popStatusLoading, setPopStatusLoading] = useState(true);
  const [popStatusError, setPopStatusError] = useState<string | null>(null);
  const [popStatusCheckedAt, setPopStatusCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setPopStatusLoading(true);
    setPopStatusError(null);

    Promise.allSettled([
      fetchAdminEvents(),
      fetchPopStatus(),
    ])
      .then(([eventsResult, popResult]) => {
        if (cancelled) return;

        if (eventsResult.status === 'fulfilled') {
          setEvents(eventsResult.value);
        } else {
          setError(eventsResult.reason instanceof Error ? eventsResult.reason.message : '読み込みに失敗しました。再読み込みしてください。');
          setEvents([]);
        }

        if (popResult.status === 'fulfilled') {
          setPopStatus(popResult.value);
          setPopStatusCheckedAt(new Date().toISOString());
        } else {
          setPopStatus(null);
          setPopStatusError(popResult.reason instanceof Error ? popResult.reason.message : 'PoP状態の取得に失敗しました。');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setPopStatusLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setPopStatusLoading(true);
    setPopStatusError(null);

    Promise.allSettled([
      fetchAdminEvents(),
      fetchPopStatus(),
    ])
      .then(([eventsResult, popResult]) => {
        if (eventsResult.status === 'fulfilled') {
          setEvents(eventsResult.value);
        } else {
          setError(eventsResult.reason instanceof Error ? eventsResult.reason.message : '読み込みに失敗しました。再読み込みしてください。');
          setEvents([]);
        }

        if (popResult.status === 'fulfilled') {
          setPopStatus(popResult.value);
          setPopStatusCheckedAt(new Date().toISOString());
        } else {
          setPopStatus(null);
          setPopStatusError(popResult.reason instanceof Error ? popResult.reason.message : 'PoP状態の取得に失敗しました。');
        }
      })
      .finally(() => {
        setLoading(false);
        setPopStatusLoading(false);
      });
  };

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

        <View style={styles.popCard}>
          <View style={styles.popHeader}>
            <AppText variant="h3" style={styles.popTitle}>
              PoP稼働証明
            </AppText>
            <Button
              title={popStatusLoading ? '確認中…' : '再確認'}
              variant="secondary"
              dark
              onPress={handleRetry}
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
    color: '#00c853',
    marginBottom: adminTheme.spacing.xs,
  },
  popWarnText: {
    color: '#ffb300',
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
