import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, CountBadge, EventRow, AdminShell, StatusBadge, Loading } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import {
  closeAdminEvent,
  fetchAdminEvents,
  fetchPopStatus,
  fetchAdminSecurityLogs,
  fetchAdminSecurityFreezeStatus,
  fetchAdminReportObligations,
  unlockFrozenAdmin,
  revokeAdminAccess,
  restoreAdminAccess,
  type PopStatusResponse,
  type AdminSecurityLogEntry,
  type AdminFrozenAccount,
  type AdminPendingWarning,
  type AdminRevokedAccount,
  type AdminReportObligationItem,
} from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';
import { loadAdminSession } from '../../lib/adminAuth';
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
  const [closingEventId, setClosingEventId] = useState<string | null>(null);
  const [securityLogs, setSecurityLogs] = useState<AdminSecurityLogEntry[]>([]);
  const [frozenAccounts, setFrozenAccounts] = useState<AdminFrozenAccount[]>([]);
  const [revokedAccounts, setRevokedAccounts] = useState<AdminRevokedAccount[]>([]);
  const [pendingWarnings, setPendingWarnings] = useState<AdminPendingWarning[]>([]);
  const [reportObligations, setReportObligations] = useState<AdminReportObligationItem[]>([]);
  const [securityCheckedAt, setSecurityCheckedAt] = useState<string | null>(null);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [unlockingActorId, setUnlockingActorId] = useState<string | null>(null);
  const [revokeTargetActorId, setRevokeTargetActorId] = useState('');
  const [revokeReason, setRevokeReason] = useState('operator_policy_violation');
  const [revokingActorId, setRevokingActorId] = useState<string | null>(null);
  const [restoringActorId, setRestoringActorId] = useState<string | null>(null);
  const [canViewOperatorReports, setCanViewOperatorReports] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAdminSession()
      .then((session) => {
        if (cancelled) return;
        setCanViewOperatorReports(session?.role === 'master');
      })
      .catch(() => {
        if (!cancelled) setCanViewOperatorReports(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setError(null);
    setPopStatusLoading(true);
    setPopStatusError(null);
    setSecurityLoading(true);
    setSecurityError(null);

    Promise.allSettled([
      fetchAdminEvents(),
      fetchPopStatus(),
      fetchAdminSecurityFreezeStatus(),
      fetchAdminSecurityLogs({ limit: 80 }),
      canViewOperatorReports
        ? fetchAdminReportObligations({ status: 'required', limit: 50 })
        : Promise.resolve(null),
    ])
      .then(([eventsResult, popResult, freezeResult, logsResult, reportResult]) => {
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

        if (freezeResult.status === 'fulfilled') {
          setFrozenAccounts(freezeResult.value.items ?? []);
          setRevokedAccounts(freezeResult.value.revokedItems ?? []);
          setPendingWarnings(freezeResult.value.pendingWarnings ?? []);
          setSecurityCheckedAt(freezeResult.value.checkedAt ?? new Date().toISOString());
        } else {
          setFrozenAccounts([]);
          setRevokedAccounts([]);
          setPendingWarnings([]);
          setSecurityError(freezeResult.reason instanceof Error ? freezeResult.reason.message : '凍結状態の取得に失敗しました。');
        }

        if (logsResult.status === 'fulfilled') {
          setSecurityLogs(logsResult.value.items ?? []);
          setSecurityCheckedAt((prev) => prev ?? logsResult.value.checkedAt ?? new Date().toISOString());
        } else {
          setSecurityLogs([]);
          setSecurityError((prev) => prev ?? (logsResult.reason instanceof Error ? logsResult.reason.message : '監査ログの取得に失敗しました。'));
        }

        if (canViewOperatorReports) {
          if (reportResult.status === 'fulfilled' && reportResult.value) {
            const reportData = reportResult.value;
            setReportObligations(reportData.items ?? []);
            setSecurityCheckedAt((prev) => prev ?? reportData.checkedAt ?? new Date().toISOString());
          } else {
            setReportObligations([]);
            setSecurityError((prev) => prev ?? (reportResult.status === 'rejected' && reportResult.reason instanceof Error
              ? reportResult.reason.message
              : '報告義務ログの取得に失敗しました。'));
          }
        } else {
          setReportObligations([]);
        }
      })
      .finally(() => {
        setLoading(false);
        setPopStatusLoading(false);
        setSecurityLoading(false);
      });
  }, [canViewOperatorReports]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRetry = () => {
    loadDashboard();
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

  const handleCloseEvent = useCallback(async (eventId: string) => {
    if (!eventId || closingEventId) return;
    setClosingEventId(eventId);
    setError(null);
    try {
      const updated = await closeAdminEvent(eventId);
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
      setError(e instanceof Error ? e.message : 'イベントのクローズに失敗しました。');
    } finally {
      setClosingEventId(null);
    }
  }, [closingEventId]);

  const handleUnlockAccount = useCallback(async (targetActorId: string) => {
    if (!targetActorId || unlockingActorId) return;
    setUnlockingActorId(targetActorId);
    setSecurityError(null);
    try {
      await unlockFrozenAdmin(targetActorId);
      await Promise.allSettled([
        fetchAdminSecurityFreezeStatus(),
        fetchAdminSecurityLogs({ limit: 80 }),
        canViewOperatorReports
          ? fetchAdminReportObligations({ status: 'required', limit: 50 })
          : Promise.resolve(null),
      ]).then(([freezeResult, logsResult, reportResult]) => {
        if (freezeResult.status === 'fulfilled') {
          setFrozenAccounts(freezeResult.value.items ?? []);
          setRevokedAccounts(freezeResult.value.revokedItems ?? []);
          setPendingWarnings(freezeResult.value.pendingWarnings ?? []);
          setSecurityCheckedAt(freezeResult.value.checkedAt ?? new Date().toISOString());
        }
        if (logsResult.status === 'fulfilled') {
          setSecurityLogs(logsResult.value.items ?? []);
          setSecurityCheckedAt((prev) => prev ?? logsResult.value.checkedAt ?? new Date().toISOString());
        }
        if (canViewOperatorReports) {
          if (reportResult.status === 'fulfilled' && reportResult.value) {
            const reportData = reportResult.value;
            setReportObligations(reportData.items ?? []);
            setSecurityCheckedAt((prev) => prev ?? reportData.checkedAt ?? new Date().toISOString());
          }
        } else {
          setReportObligations([]);
        }
      });
    } catch (e) {
      setSecurityError(e instanceof Error ? e.message : 'ロック解除に失敗しました。');
    } finally {
      setUnlockingActorId(null);
    }
  }, [unlockingActorId, canViewOperatorReports]);

  const refreshSecurityBlocks = useCallback(async () => {
    await Promise.allSettled([
      fetchAdminSecurityFreezeStatus(),
      fetchAdminSecurityLogs({ limit: 80 }),
      canViewOperatorReports
        ? fetchAdminReportObligations({ status: 'required', limit: 50 })
        : Promise.resolve(null),
    ]).then(([freezeResult, logsResult, reportResult]) => {
      if (freezeResult.status === 'fulfilled') {
        setFrozenAccounts(freezeResult.value.items ?? []);
        setRevokedAccounts(freezeResult.value.revokedItems ?? []);
        setPendingWarnings(freezeResult.value.pendingWarnings ?? []);
        setSecurityCheckedAt(freezeResult.value.checkedAt ?? new Date().toISOString());
      }
      if (logsResult.status === 'fulfilled') {
        setSecurityLogs(logsResult.value.items ?? []);
        setSecurityCheckedAt((prev) => prev ?? logsResult.value.checkedAt ?? new Date().toISOString());
      }
      if (canViewOperatorReports) {
        if (reportResult.status === 'fulfilled' && reportResult.value) {
          const reportData = reportResult.value;
          setReportObligations(reportData.items ?? []);
          setSecurityCheckedAt((prev) => prev ?? reportData.checkedAt ?? new Date().toISOString());
        }
      } else {
        setReportObligations([]);
      }
    });
  }, [canViewOperatorReports]);

  const handleRevokeAccess = useCallback(async (targetActorIdRaw?: string) => {
    const targetActorId = (targetActorIdRaw ?? revokeTargetActorId).trim();
    if (!targetActorId || revokingActorId) return;
    setRevokingActorId(targetActorId);
    setSecurityError(null);
    try {
      await revokeAdminAccess(targetActorId, revokeReason.trim() || undefined);
      setRevokeTargetActorId('');
      await refreshSecurityBlocks();
    } catch (e) {
      setSecurityError(e instanceof Error ? e.message : '権限剥奪に失敗しました。');
    } finally {
      setRevokingActorId(null);
    }
  }, [revokeTargetActorId, revokingActorId, revokeReason, refreshSecurityBlocks]);

  const handleRestoreAccess = useCallback(async (targetActorId: string) => {
    if (!targetActorId || restoringActorId) return;
    setRestoringActorId(targetActorId);
    setSecurityError(null);
    try {
      await restoreAdminAccess(targetActorId);
      await refreshSecurityBlocks();
    } catch (e) {
      setSecurityError(e instanceof Error ? e.message : '権限復旧に失敗しました。');
    } finally {
      setRestoringActorId(null);
    }
  }, [restoringActorId, refreshSecurityBlocks]);

  const shortActor = (actorId: string) => {
    if (!actorId) return '-';
    if (actorId.length <= 24) return actorId;
    return `${actorId.slice(0, 12)}...${actorId.slice(-8)}`;
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

        <View style={styles.securityCard}>
          <View style={styles.securityHeader}>
            <AppText variant="h3" style={styles.securityTitle}>
              運営者監査・実行ログ
            </AppText>
            <Button
              title={securityLoading ? '更新中…' : '再取得'}
              variant="secondary"
              dark
              onPress={handleRetry}
              disabled={securityLoading}
              style={styles.securityRefreshButton}
            />
          </View>

          {securityError ? (
            <AppText variant="small" style={styles.securityErrorText}>
              {securityError}
            </AppText>
          ) : null}

          <AppText variant="small" style={styles.securityMetaText}>
            凍結中: {frozenAccounts.length} / 権限剥奪中: {revokedAccounts.length} / 警告保留: {pendingWarnings.length}
          </AppText>
          <AppText variant="small" style={styles.securityMetaText}>
            checkedAt: {securityCheckedAt ?? '-'}
          </AppText>

          {canViewOperatorReports ? (
            <View style={styles.securitySection}>
              <AppText variant="body" style={styles.securitySectionTitle}>
                報告義務ログ（運営者コミュニティ内）
              </AppText>
              {securityLoading ? (
                <AppText variant="small" style={styles.securityMetaText}>
                  報告義務ログを読み込み中です...
                </AppText>
              ) : reportObligations.length === 0 ? (
                <AppText variant="small" style={styles.securityMetaText}>
                  未対応の報告義務はありません
                </AppText>
              ) : (
                reportObligations.slice(0, 8).map((report) => (
                  <View key={report.reportId} style={styles.logRow}>
                    <AppText variant="small" style={styles.logActionText}>
                      [{report.type}] {report.reason}
                    </AppText>
                    <AppText variant="small" style={styles.securityMetaText}>
                      target: {shortActor(report.targetActorId)} / by: {shortActor(report.actionByActorId)}
                    </AppText>
                    <AppText variant="small" style={styles.securityMetaText}>
                      createdAt: {report.createdAt}
                    </AppText>
                  </View>
                ))
              )}
            </View>
          ) : null}

          <View style={styles.securitySection}>
            <AppText variant="body" style={styles.securitySectionTitle}>
              権限剥奪を実行
            </AppText>
            <TextInput
              value={revokeTargetActorId}
              onChangeText={setRevokeTargetActorId}
              placeholder="targetActorId (例: admin:operator-abc123)"
              placeholderTextColor={adminTheme.colors.textTertiary}
              style={styles.securityInput}
              autoCapitalize="none"
            />
            <TextInput
              value={revokeReason}
              onChangeText={setRevokeReason}
              placeholder="reason (例: policy_violation)"
              placeholderTextColor={adminTheme.colors.textTertiary}
              style={styles.securityInput}
              autoCapitalize="none"
            />
            <Button
              title="権限を剥奪する"
              variant="secondary"
              dark
              onPress={() => void handleRevokeAccess()}
              loading={Boolean(revokingActorId && revokingActorId === revokeTargetActorId.trim())}
              disabled={!revokeTargetActorId.trim() || Boolean(revokingActorId)}
              style={styles.revokeButton}
            />
          </View>

          <View style={styles.securitySection}>
            <AppText variant="body" style={styles.securitySectionTitle}>
              凍結アカウント（手動解除必須）
            </AppText>
            {securityLoading ? (
              <AppText variant="small" style={styles.securityMetaText}>
                凍結状態を読み込み中です...
              </AppText>
            ) : frozenAccounts.length === 0 ? (
              <AppText variant="small" style={styles.securityMetaText}>
                凍結中のアカウントはありません
              </AppText>
            ) : (
              frozenAccounts.map((item) => (
                <View key={item.actorId} style={styles.frozenRow}>
                  <View style={styles.frozenInfo}>
                    <AppText variant="small" style={styles.securityActorText}>
                      {shortActor(item.actorId)}
                    </AppText>
                    <AppText variant="small" style={styles.securityMetaText}>
                      reason: {item.reason ?? '-'}
                    </AppText>
                    <AppText variant="small" style={styles.securityMetaText}>
                      frozenAt: {item.frozenAt ?? '-'}
                    </AppText>
                  </View>
                  <Button
                    title="ロック解除"
                    variant="secondary"
                    dark
                    size="medium"
                    onPress={() => void handleUnlockAccount(item.actorId)}
                    loading={unlockingActorId === item.actorId}
                    disabled={Boolean(unlockingActorId && unlockingActorId !== item.actorId)}
                    style={styles.unlockButton}
                  />
                </View>
              ))
            )}
          </View>

          <View style={styles.securitySection}>
            <AppText variant="body" style={styles.securitySectionTitle}>
              権限剥奪アカウント（手動復旧必須）
            </AppText>
            {securityLoading ? (
              <AppText variant="small" style={styles.securityMetaText}>
                権限剥奪状態を読み込み中です...
              </AppText>
            ) : revokedAccounts.length === 0 ? (
              <AppText variant="small" style={styles.securityMetaText}>
                権限剥奪中のアカウントはありません
              </AppText>
            ) : (
              revokedAccounts.map((item) => (
                <View key={item.actorId} style={styles.frozenRow}>
                  <View style={styles.frozenInfo}>
                    <AppText variant="small" style={styles.securityActorText}>
                      {shortActor(item.actorId)}
                    </AppText>
                    <AppText variant="small" style={styles.securityMetaText}>
                      reason: {item.reason ?? '-'}
                    </AppText>
                    <AppText variant="small" style={styles.securityMetaText}>
                      revokedAt: {item.revokedAt ?? '-'}
                    </AppText>
                  </View>
                  <Button
                    title="権限復旧"
                    variant="secondary"
                    dark
                    size="medium"
                    onPress={() => void handleRestoreAccess(item.actorId)}
                    loading={restoringActorId === item.actorId}
                    disabled={Boolean(restoringActorId && restoringActorId !== item.actorId)}
                    style={styles.unlockButton}
                  />
                </View>
              ))
            )}
          </View>

          <View style={styles.securitySection}>
            <AppText variant="body" style={styles.securitySectionTitle}>
              監査/実行ログ（最新）
            </AppText>
            {securityLoading ? (
              <AppText variant="small" style={styles.securityMetaText}>
                ログを読み込み中です...
              </AppText>
            ) : securityLogs.length === 0 ? (
              <AppText variant="small" style={styles.securityMetaText}>
                ログはまだありません
              </AppText>
            ) : (
              securityLogs.slice(0, 12).map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <AppText variant="small" style={styles.logActionText}>
                    [{log.category}] {log.action}
                  </AppText>
                  <AppText variant="small" style={styles.securityMetaText}>
                    actor: {shortActor(log.actor.actorId)}
                  </AppText>
                  <AppText variant="small" style={styles.securityMetaText}>
                    at: {log.ts}
                  </AppText>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.list}>
          {loading ? (
            <View style={styles.stateContainer}>
              <Loading message="イベントを読み込み中です..." size="large" mode="admin" />
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
              <AppText style={styles.emptyText}>表示できるイベントがありません。</AppText>
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
  securityCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  securityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.sm,
  },
  securityTitle: {
    color: adminTheme.colors.text,
  },
  securityRefreshButton: {
    minWidth: 88,
  },
  securityErrorText: {
    color: '#FF5C5C',
    marginBottom: adminTheme.spacing.xs,
  },
  securityMetaText: {
    color: adminTheme.colors.textSecondary,
    marginTop: 2,
  },
  securitySection: {
    marginTop: adminTheme.spacing.md,
  },
  securitySectionTitle: {
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.xs,
  },
  securityInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.background,
    marginTop: adminTheme.spacing.xs,
  },
  revokeButton: {
    marginTop: adminTheme.spacing.sm,
    alignSelf: 'flex-start',
    minWidth: 140,
  },
  frozenRow: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    padding: adminTheme.spacing.sm,
    marginTop: adminTheme.spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: adminTheme.spacing.sm,
  },
  frozenInfo: {
    flex: 1,
  },
  securityActorText: {
    color: '#FFD166',
    fontFamily: 'monospace',
  },
  unlockButton: {
    minWidth: 112,
  },
  logRow: {
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
    paddingVertical: adminTheme.spacing.xs,
  },
  logActionText: {
    color: adminTheme.colors.text,
    fontFamily: 'monospace',
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
