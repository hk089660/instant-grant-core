import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as QRCode from 'qrcode';
import { AppText, Button, Card, AdminShell, Loading } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { closeAdminEvent, fetchAdminEvent, fetchAdminTransferLogs, fetchClaimants, type Claimant, type TransferLogEntry } from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';
import { usePolling } from '../../hooks/usePolling';

export const AdminEventDetailScreen: React.FC = () => {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [event, setEvent] = useState<(SchoolEvent & { claimedCount: number }) | null>(null);
  const [claimants, setClaimants] = useState<Claimant[]>([]);
  const [onchainTransfers, setOnchainTransfers] = useState<TransferLogEntry[]>([]);
  const [offchainTransfers, setOffchainTransfers] = useState<TransferLogEntry[]>([]);
  const [transferCheckedAt, setTransferCheckedAt] = useState<string | null>(null);
  const [transferStrictLevel, setTransferStrictLevel] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [claimantsLoading, setClaimantsLoading] = useState(false);
  const [claimantsError, setClaimantsError] = useState<string | null>(null);
  const [participantNameQuery, setParticipantNameQuery] = useState('');
  const [screenLoading, setScreenLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [closingEvent, setClosingEvent] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);
  const initialLoadDone = useRef(false);
  const mountedRef = useRef(true);
  const eventRef = useRef<(SchoolEvent & { claimedCount: number }) | null>(null);
  const eventLoadSeq = useRef(0);
  const claimantsLoadSeq = useRef(0);
  const transferLoadSeq = useRef(0);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  const loadEventData = useCallback(async (options?: { silent?: boolean }) => {
    if (!eventId) return;
    const requestId = ++eventLoadSeq.current;
    if (!options?.silent) {
      setEventLoading(true);
    }

    try {
      const nextEvent = await fetchAdminEvent(eventId);
      if (!mountedRef.current || eventLoadSeq.current !== requestId) return;
      setEvent(nextEvent);
      setScreenError(null);
      if (!options?.silent) {
        setActionError(null);
      }
    } catch (e) {
      if (!mountedRef.current || eventLoadSeq.current !== requestId) return;
      const message = e instanceof Error ? e.message : 'イベント詳細の取得に失敗しました';
      if (initialLoadDone.current && eventRef.current) {
        setActionError(message);
      } else {
        setScreenError(message);
      }
    } finally {
      if (!options?.silent && mountedRef.current && eventLoadSeq.current === requestId) {
        setEventLoading(false);
      }
    }
  }, [eventId]);

  const loadClaimants = useCallback(async (options?: { silent?: boolean }) => {
    if (!eventId) return;
    const requestId = ++claimantsLoadSeq.current;
    if (!options?.silent) {
      setClaimantsLoading(true);
      setClaimantsError(null);
    }

    try {
      const nextClaimants = await fetchClaimants(eventId);
      if (!mountedRef.current || claimantsLoadSeq.current !== requestId) return;
      setClaimants(nextClaimants.items);
      setClaimantsError(null);
    } catch (e) {
      if (!mountedRef.current || claimantsLoadSeq.current !== requestId) return;
      setClaimantsError(e instanceof Error ? e.message : '参加者一覧の取得に失敗しました');
    } finally {
      if (!options?.silent && mountedRef.current && claimantsLoadSeq.current === requestId) {
        setClaimantsLoading(false);
      }
    }
  }, [eventId]);

  const loadTransferLogs = useCallback(async (options?: { silent?: boolean }) => {
    if (!eventId) return;
    const requestId = ++transferLoadSeq.current;
    if (!options?.silent) {
      setTransferLoading(true);
      setTransferError(null);
    }
    const [onchainResult, offchainResult] = await Promise.allSettled([
      fetchAdminTransferLogs({ eventId, limit: 50, mode: 'onchain' }),
      fetchAdminTransferLogs({ eventId, limit: 50, mode: 'offchain' }),
    ]);
    if (!mountedRef.current || transferLoadSeq.current !== requestId) return;

    const errors: string[] = [];
    let checkedAt: string | null = null;
    let strictLevel: string | null = null;

    if (onchainResult.status === 'fulfilled') {
      setOnchainTransfers(onchainResult.value.items ?? []);
      checkedAt = onchainResult.value.checkedAt ?? checkedAt;
      strictLevel = onchainResult.value.strictLevel ?? strictLevel;
    } else {
      setOnchainTransfers([]);
      errors.push(`オンチェーン: ${onchainResult.reason instanceof Error ? onchainResult.reason.message : '取得失敗'}`);
    }

    if (offchainResult.status === 'fulfilled') {
      setOffchainTransfers(offchainResult.value.items ?? []);
      checkedAt = offchainResult.value.checkedAt ?? checkedAt;
      strictLevel = offchainResult.value.strictLevel ?? strictLevel;
    } else {
      setOffchainTransfers([]);
      errors.push(`オフチェーン: ${offchainResult.reason instanceof Error ? offchainResult.reason.message : '取得失敗'}`);
    }

    setTransferCheckedAt(checkedAt);
    setTransferStrictLevel(strictLevel);
    setTransferError(errors.length > 0 ? errors.join(' / ') : null);
    if (!options?.silent && mountedRef.current && transferLoadSeq.current === requestId) {
      setTransferLoading(false);
    }
  }, [eventId]);

  const loadInitialData = useCallback(async () => {
    if (!eventId) return;
    setScreenLoading(true);
    setScreenError(null);
    setActionError(null);
    setClaimantsError(null);
    setTransferError(null);
    setEvent(null);
    setClaimants([]);
    setOnchainTransfers([]);
    setOffchainTransfers([]);
    setTransferCheckedAt(null);
    setTransferStrictLevel(null);
    setLastPolledAt(null);
    initialLoadDone.current = false;

    await Promise.allSettled([
      loadEventData({ silent: true }),
      loadClaimants({ silent: true }),
      loadTransferLogs({ silent: true }),
    ]);

    if (!mountedRef.current) return;
    setScreenLoading(false);
    initialLoadDone.current = true;
  }, [eventId, loadClaimants, loadEventData, loadTransferLogs]);

  useEffect(() => {
    if (!eventId) return;
    void loadInitialData();
  }, [eventId, loadInitialData]);

  // ポーリング: 15秒間隔でtransfer logsと参加者データをバックグラウンド更新
  const pollData = useCallback(async () => {
    if (!eventId || !initialLoadDone.current) return;
    try {
      const [claimRes, transferRes] = await Promise.allSettled([
        loadClaimants({ silent: true }),
        loadTransferLogs({ silent: true }),
      ]);
      if (transferRes.status === 'rejected') {
        setTransferError(transferRes.reason instanceof Error ? transferRes.reason.message : '送金監査ログの取得に失敗しました');
      }
      if (claimRes.status === 'rejected') {
        setClaimantsError(claimRes.reason instanceof Error ? claimRes.reason.message : '参加者一覧の取得に失敗しました');
      }
      const now = new Date();
      setLastPolledAt(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
    } catch {
      // ポーリングエラーは無視（既存データを維持）
    }
  }, [eventId, loadClaimants, loadTransferLogs]);

  usePolling(pollData, {
    intervalMs: 15_000,
    enabled: Boolean(eventId),
  });

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

  const handleRefreshAll = useCallback(() => {
    setActionError(null);
    setClaimantsError(null);
    setTransferError(null);
    void Promise.allSettled([
      loadEventData(),
      loadClaimants(),
      loadTransferLogs(),
    ]);
  }, [loadClaimants, loadEventData, loadTransferLogs]);

  const handleRefreshClaimants = useCallback(() => {
    setClaimantsError(null);
    void loadClaimants();
  }, [loadClaimants]);

  const handleRefreshTransfers = useCallback(() => {
    setTransferError(null);
    void loadTransferLogs();
  }, [loadTransferLogs]);

  const handleCloseEvent = async () => {
    if (!eventId || !event || event.state === 'ended' || closingEvent) return;
    setClosingEvent(true);
    setActionError(null);
    try {
      const updated = await closeAdminEvent(eventId);
      eventLoadSeq.current += 1;
      setEvent(updated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'イベントのクローズに失敗しました');
    } finally {
      setClosingEvent(false);
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch { return iso; }
  };

  const shorten = (value?: string | null, start = 6, end = 6): string => {
    if (!value) return '-';
    if (value.length <= start + end + 3) return value;
    return `${value.slice(0, start)}...${value.slice(-end)}`;
  };

  const totalTransferAuditEntries = onchainTransfers.length + offchainTransfers.length;
  const splitTransferPanels = windowWidth >= 1080;
  const transferLogMaxHeight = useMemo(
    () => Math.max(280, Math.min(windowHeight * (splitTransferPanels ? 0.46 : 0.5), 560)),
    [splitTransferPanels, windowHeight]
  );
  const registeredParticipantNames = useMemo(() => {
    const names = claimants
      .map((c) => c.displayName.trim())
      .filter((name) => Boolean(name) && name !== '-');
    return Array.from(new Set(names));
  }, [claimants]);
  const filteredClaimants = useMemo(() => {
    const q = participantNameQuery.trim().toLowerCase();
    if (!q) return claimants;
    return claimants.filter((c) => c.displayName.toLowerCase().includes(q));
  }, [claimants, participantNameQuery]);
  const refreshingAny = eventLoading || claimantsLoading || transferLoading;

  if (screenLoading) {
    return (
      <AdminShell title="イベント詳細" role="admin">
        <View style={styles.center}>
          <Loading message="イベント詳細を読み込み中です..." size="large" mode="admin" />
        </View>
      </AdminShell>
    );
  }

  if (screenError || !event) {
    return (
      <AdminShell title="イベント詳細" role="admin">
        <View style={styles.center}>
          <AppText style={styles.errorText}>{screenError ?? 'イベントが見つかりません'}</AppText>
          <Button title="再読み込み" variant="secondary" dark onPress={() => void loadInitialData()} style={{ marginTop: 12 }} />
          <Button title="戻る" variant="secondary" dark onPress={() => router.back()} style={{ marginTop: 8 }} />
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
            {event.state !== 'ended' && (
              <Button
                title="イベントをクローズ"
                variant="secondary"
                dark
                onPress={() => void handleCloseEvent()}
                loading={closingEvent}
                style={styles.closeEventHeaderButton}
              />
            )}
            <Button
              title={refreshingAny ? '更新中…' : '全体更新'}
              variant="secondary"
              dark
              onPress={handleRefreshAll}
              loading={refreshingAny}
            />
            <Button title="戻る" variant="secondary" dark onPress={() => router.back()} />
          </View>
        </View>

        {actionError && (
          <Card style={styles.inlineErrorCard}>
            <AppText variant="small" style={styles.transferError}>
              {actionError}
            </AppText>
          </Card>
        )}

        {/* イベント情報 */}
        <Card style={styles.card}>
          <View style={styles.stateBadge}>
            <AppText variant="small" style={{
              color: adminTheme.colors.text,
              fontWeight: '700',
            }}>
              {event.state === 'published' ? '公開中' : event.state === 'draft' ? '下書き' : '終了'}
            </AppText>
          </View>
          <AppText variant="h3" style={styles.cardText}>{event.title}</AppText>
          <AppText variant="caption" style={styles.cardMuted}>{event.datetime}</AppText>
          <AppText variant="caption" style={styles.cardMuted}>主催: {event.host}</AppText>
          <AppText variant="small" style={styles.cardDim}>ID: {event.id}</AppText>
          {eventLoading && (
            <AppText variant="small" style={styles.cardDim}>
              基本情報を更新中です…
            </AppText>
          )}
          {event.state !== 'ended' ? (
            <AppText variant="small" style={styles.cardDim}>
              このイベントをクローズすると受付は停止されます
            </AppText>
          ) : (
            <AppText variant="small" style={styles.cardDim}>
              このイベントはクローズ済みです
            </AppText>
          )}
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
              dark
              onPress={() => router.push(`/admin/print/${event.id}` as any)}
              style={{ marginTop: 12 }}
            />
          </Card>
        )}

        {/* 参加者一覧 */}
        <View style={styles.sectionHeader}>
          <AppText variant="h3" style={styles.title}>参加者一覧</AppText>
          <View style={styles.sectionHeaderMeta}>
            <AppText variant="small" style={styles.muted}>
              合計 {claimants.length} 名 / 表示 {filteredClaimants.length} 名
            </AppText>
            <Button
              title={claimantsLoading ? '更新中…' : '参加者更新'}
              variant="secondary"
              dark
              size="medium"
              onPress={handleRefreshClaimants}
              loading={claimantsLoading}
              style={styles.sectionRefreshButton}
            />
          </View>
        </View>

        {claimantsError && (
          <AppText variant="small" style={styles.transferError}>
            参加者一覧取得エラー: {claimantsError}
          </AppText>
        )}

        <Card style={styles.card}>
          <TextInput
            style={styles.searchInput}
            value={participantNameQuery}
            onChangeText={setParticipantNameQuery}
            placeholder="登録名で絞り込み（例: 山田）"
            placeholderTextColor={adminTheme.colors.textTertiary}
          />
          <AppText variant="small" style={styles.cardDim}>
            登録名候補: {registeredParticipantNames.length} 件
          </AppText>

          {filteredClaimants.length === 0 ? (
            <View style={styles.center}>
              <AppText variant="caption" style={styles.cardMuted}>
                {claimants.length === 0 ? 'まだ参加者がいません' : '該当する登録名が見つかりません'}
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
              {filteredClaimants.map((p, i) => (
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

        {/* 送金監査ログ */}
        <View style={styles.sectionHeader}>
          <AppText variant="h3" style={styles.title}>送金監査 (Hash Chain)</AppText>
          <View style={styles.sectionHeaderMeta}>
            <View>
              <AppText variant="small" style={styles.muted}>
                監査エントリ {totalTransferAuditEntries} 件 / レベル: {transferStrictLevel ?? '-'}
              </AppText>
              <AppText variant="small" style={styles.muted}>
                実トークン配布: {onchainTransfers.length} 件 / オフチェーン参加レシート: {offchainTransfers.length} 件
              </AppText>
              <AppText variant="small" style={styles.muted}>
                最終取得: {formatTime(transferCheckedAt ?? undefined)}
              </AppText>
            </View>
            <Button
              title={transferLoading ? '更新中…' : '監査更新'}
              variant="secondary"
              dark
              size="medium"
              onPress={handleRefreshTransfers}
              loading={transferLoading}
              style={styles.sectionRefreshButton}
            />
          </View>
          {lastPolledAt && (
            <AppText variant="small" style={styles.muted}>
              自動更新: {lastPolledAt}
            </AppText>
          )}
        </View>

        {transferError && (
          <AppText variant="small" style={styles.transferError}>
            送金監査ログ取得エラー: {transferError}
          </AppText>
        )}

        <View style={[styles.transferPanels, splitTransferPanels && styles.transferPanelsSplit]}>
          <Card style={StyleSheet.compose(styles.card, styles.transferPanelCard)}>
            <View style={styles.transferGroupHeader}>
              <View>
                <AppText variant="body" style={styles.cardText}>
                  On-chainトークン配布ログ
                </AppText>
                <AppText variant="small" style={styles.cardMuted}>
                  {onchainTransfers.length} 件
                </AppText>
              </View>
              <View style={[styles.transferModeBadge, styles.onchainBadge]}>
                <AppText variant="small" style={styles.transferModeText}>tx + receipt</AppText>
              </View>
            </View>

            {transferLoading ? (
              <View style={styles.center}>
                <AppText variant="caption" style={styles.cardMuted}>
                  On-chain署名ログを読み込み中です...
                </AppText>
              </View>
            ) : onchainTransfers.length === 0 ? (
              <View style={styles.center}>
                <AppText variant="caption" style={styles.cardMuted}>
                  On-chain署名の記録はありません
                </AppText>
              </View>
            ) : (
              <ScrollView
                style={[styles.transferScroll, { maxHeight: transferLogMaxHeight }]}
                contentContainerStyle={styles.transferScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {onchainTransfers.map((item) => (
                  <View key={`on:${item.entryHash}`} style={styles.transferRow}>
                    <View style={styles.transferHeader}>
                      <AppText variant="small" style={styles.cardText}>
                        {item.event} / {formatTime(item.ts)}
                      </AppText>
                    </View>
                    <AppText variant="small" style={styles.cardMuted}>
                      送金主: {item.transfer.sender.type}:{item.transfer.sender.id}
                    </AppText>
                    <AppText variant="small" style={styles.cardMuted}>
                      送金先: {item.transfer.recipient.type}:{item.transfer.recipient.id}
                    </AppText>
                    <AppText variant="small" style={styles.cardMuted}>
                      配布量: {item.transfer.amount ?? '-'} / Mint: {shorten(item.transfer.mint)}
                    </AppText>
                    <AppText variant="small" style={styles.hashMono}>
                      tx: {shorten(item.transfer.txSignature)} / receipt: {shorten(item.transfer.receiptPubkey)}
                    </AppText>
                    <AppText variant="small" style={styles.hashMono}>
                      chain: {shorten(item.prevHash, 8, 8)} → {shorten(item.entryHash, 8, 8)}
                    </AppText>
                  </View>
                ))}
              </ScrollView>
            )}
          </Card>

          <Card style={StyleSheet.compose(styles.card, styles.transferPanelCard)}>
            <View style={styles.transferGroupHeader}>
              <View>
                <AppText variant="body" style={styles.cardText}>
                  Off-chain参加レシートログ
                </AppText>
                <AppText variant="small" style={styles.cardMuted}>
                  {offchainTransfers.length} 件
                </AppText>
              </View>
              <View style={[styles.transferModeBadge, styles.offchainBadge]}>
                <AppText variant="small" style={styles.transferModeText}>receipt only</AppText>
              </View>
            </View>

            {transferLoading ? (
              <View style={styles.center}>
                <AppText variant="caption" style={styles.cardMuted}>
                  Off-chain監査署名ログを読み込み中です...
                </AppText>
              </View>
            ) : offchainTransfers.length === 0 ? (
              <View style={styles.center}>
                <AppText variant="caption" style={styles.cardMuted}>
                  Off-chain監査署名の記録はありません
                </AppText>
              </View>
            ) : (
              <ScrollView
                style={[styles.transferScroll, { maxHeight: transferLogMaxHeight }]}
                contentContainerStyle={styles.transferScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {offchainTransfers.map((item) => (
                  <View key={`off:${item.entryHash}`} style={styles.transferRow}>
                    <View style={styles.transferHeader}>
                      <AppText variant="small" style={styles.cardText}>
                        {item.event} / {formatTime(item.ts)}
                      </AppText>
                    </View>
                    <AppText variant="small" style={styles.cardMuted}>
                      対象: {item.transfer.recipient.type}:{item.transfer.recipient.id}
                    </AppText>
                    <AppText variant="small" style={styles.cardMuted}>
                      内容: {item.transfer.asset === 'participation_receipt' ? 'オフチェーン参加レシート発行' : `配布量 ${item.transfer.amount ?? '-'} / Mint ${shorten(item.transfer.mint)}`}
                    </AppText>
                    <AppText variant="small" style={styles.hashMono}>
                      監査署名(hash): {shorten(item.entryHash, 10, 10)}
                    </AppText>
                    <AppText variant="small" style={styles.hashMono}>
                      chain: {shorten(item.prevHash, 8, 8)} → {shorten(item.entryHash, 8, 8)}
                    </AppText>
                  </View>
                ))}
              </ScrollView>
            )}
          </Card>
        </View>

        {/* CSV ダウンロード */}
        <Button
          title="CSVダウンロード"
          variant="secondary"
          dark
          onPress={() => {
            if (typeof window === 'undefined') return;
            const eventParticipantNames = claimants
              .map((c) => {
                const name = c.displayName.trim();
                return name || '-';
              });
            const rows = [
              ['イベントID', event.id, '', ''],
              ['イベント名', event.title, '', ''],
              ['参加者名一覧', eventParticipantNames.join(' / '), '', ''],
              ['', '', '', ''],
              ['表示名', 'サブジェクト', '確認コード', '参加時刻'],
            ];
            claimants.forEach((c) => {
              rows.push([c.displayName, c.subject, c.confirmationCode ?? '', c.claimedAt ?? '']);
            });
            const csv = rows
              .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
              .join('\n');
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
  closeEventHeaderButton: {
    minWidth: 140,
  },
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
  searchInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.background,
    marginBottom: adminTheme.spacing.xs,
  },
  center: {
    paddingVertical: adminTheme.spacing.lg,
    alignItems: 'center',
  },
  muted: { color: adminTheme.colors.textTertiary },
  errorText: { color: adminTheme.colors.text },
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
    backgroundColor: adminTheme.colors.background,
    borderRadius: adminTheme.radius.md,
    minHeight: 200,
  },
  sectionHeader: {
    marginBottom: adminTheme.spacing.sm,
  },
  sectionHeaderMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: adminTheme.spacing.sm,
    marginTop: adminTheme.spacing.xs,
  },
  sectionRefreshButton: {
    minWidth: 120,
  },
  inlineErrorCard: {
    marginBottom: adminTheme.spacing.md,
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
  transferRow: {
    paddingVertical: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  transferPanels: {
    marginBottom: adminTheme.spacing.lg,
  },
  transferPanelsSplit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: adminTheme.spacing.md,
  },
  transferPanelCard: {
    flex: 1,
  },
  transferGroup: {
    marginBottom: adminTheme.spacing.md,
  },
  transferScroll: {
    marginTop: adminTheme.spacing.xs,
  },
  transferScrollContent: {
    paddingRight: adminTheme.spacing.xs,
  },
  transferGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.xs,
  },
  transferModeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  onchainBadge: {
    backgroundColor: 'rgba(0, 200, 83, 0.18)',
  },
  offchainBadge: {
    backgroundColor: 'rgba(3, 169, 244, 0.18)',
  },
  transferModeText: {
    color: adminTheme.colors.text,
    fontSize: 11,
  },
  transferHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hashMono: {
    color: adminTheme.colors.textTertiary,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  transferError: {
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.sm,
  },
});
