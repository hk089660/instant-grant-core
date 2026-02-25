import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as QRCode from 'qrcode';
import { AppText, Button, Card, AdminShell, Loading } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { closeAdminEvent, fetchAdminEvent, fetchAdminTransferLogs, fetchClaimants, type Claimant, type TransferLogEntry } from '../../api/adminApi';
import type { SchoolEvent } from '../../types/school';

function isOnchainTransfer(item: TransferLogEntry): boolean {
  return (
    item.transfer.mode === 'onchain' ||
    Boolean(item.transfer.txSignature) ||
    Boolean(item.transfer.receiptPubkey)
  );
}

export const AdminEventDetailScreen: React.FC = () => {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [event, setEvent] = useState<(SchoolEvent & { claimedCount: number }) | null>(null);
  const [claimants, setClaimants] = useState<Claimant[]>([]);
  const [transfers, setTransfers] = useState<TransferLogEntry[]>([]);
  const [transferCheckedAt, setTransferCheckedAt] = useState<string | null>(null);
  const [transferStrictLevel, setTransferStrictLevel] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [participantNameQuery, setParticipantNameQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [closingEvent, setClosingEvent] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTransferLoading(true);
    setTransferError(null);

    Promise.all([fetchAdminEvent(eventId), fetchClaimants(eventId)])
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

    fetchAdminTransferLogs({ eventId, limit: 50 })
      .then((transferRes) => {
        if (!cancelled) {
          setTransfers(transferRes.items ?? []);
          setTransferCheckedAt(transferRes.checkedAt ?? null);
          setTransferStrictLevel(transferRes.strictLevel ?? null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setTransferError(e instanceof Error ? e.message : '送金監査ログの取得に失敗しました');
          setTransferCheckedAt(null);
          setTransferStrictLevel(null);
        }
      })
      .finally(() => {
        if (!cancelled) setTransferLoading(false);
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
    setTransferLoading(true);
    setTransferError(null);

    Promise.all([fetchAdminEvent(eventId), fetchClaimants(eventId)])
      .then(([ev, cl]) => {
        setEvent(ev);
        setClaimants(cl.items);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false));

    fetchAdminTransferLogs({ eventId, limit: 50 })
      .then((transferRes) => {
        setTransfers(transferRes.items ?? []);
        setTransferCheckedAt(transferRes.checkedAt ?? null);
        setTransferStrictLevel(transferRes.strictLevel ?? null);
      })
      .catch((e) => {
        setTransferError(e instanceof Error ? e.message : '送金監査ログの取得に失敗しました');
        setTransferCheckedAt(null);
        setTransferStrictLevel(null);
      })
      .finally(() => setTransferLoading(false));
  };

  const handleCloseEvent = async () => {
    if (!eventId || !event || event.state === 'ended' || closingEvent) return;
    setClosingEvent(true);
    setError(null);
    try {
      const updated = await closeAdminEvent(eventId);
      setEvent(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'イベントのクローズに失敗しました');
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

  const onchainTransfers = useMemo(
    () => transfers.filter((item) => isOnchainTransfer(item)),
    [transfers]
  );
  const offchainTransfers = useMemo(
    () => transfers.filter((item) => !isOnchainTransfer(item)),
    [transfers]
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

  if (loading) {
    return (
      <AdminShell title="イベント詳細" role="admin">
        <View style={styles.center}>
          <Loading message="イベント詳細を読み込み中です..." size="large" mode="admin" />
        </View>
      </AdminShell>
    );
  }

  if (error || !event) {
    return (
      <AdminShell title="イベント詳細" role="admin">
        <View style={styles.center}>
          <AppText style={styles.errorText}>{error ?? 'イベントが見つかりません'}</AppText>
          <Button title="再読み込み" variant="secondary" dark onPress={handleRefresh} style={{ marginTop: 12 }} />
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
            <Button title="更新" variant="secondary" dark onPress={handleRefresh} />
            <Button title="戻る" variant="secondary" dark onPress={() => router.back()} />
          </View>
        </View>

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
          <AppText variant="small" style={styles.muted}>
            合計 {claimants.length} 名 / 表示 {filteredClaimants.length} 名
          </AppText>
        </View>

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
          <AppText variant="small" style={styles.muted}>
            {transfers.length} 件 / レベル: {transferStrictLevel ?? '-'}
          </AppText>
          <AppText variant="small" style={styles.muted}>
            On-chain署名: {onchainTransfers.length} 件 / Off-chain監査署名: {offchainTransfers.length} 件
          </AppText>
          <AppText variant="small" style={styles.muted}>
            最終取得: {formatTime(transferCheckedAt ?? undefined)}
          </AppText>
        </View>

        {transferError && (
          <AppText variant="small" style={styles.transferError}>
            送金監査ログ取得エラー: {transferError}
          </AppText>
        )}

        <Card style={styles.card}>
          {transferLoading ? (
            <View style={styles.center}>
              <AppText variant="caption" style={styles.cardMuted}>
                送金監査ログを読み込み中です...
              </AppText>
            </View>
          ) : transfers.length === 0 ? (
            <View style={styles.center}>
              <AppText variant="caption" style={styles.cardMuted}>
                このイベントの送金監査ログはまだありません
              </AppText>
            </View>
          ) : (
            <>
              <View style={styles.transferGroup}>
                <View style={styles.transferGroupHeader}>
                  <AppText variant="body" style={styles.cardText}>
                    On-chain署名
                  </AppText>
                  <View style={[styles.transferModeBadge, styles.onchainBadge]}>
                    <AppText variant="small" style={styles.transferModeText}>tx + receipt</AppText>
                  </View>
                </View>
                {onchainTransfers.length === 0 ? (
                  <AppText variant="caption" style={styles.cardMuted}>
                    On-chain署名の記録はありません
                  </AppText>
                ) : (
                  onchainTransfers.map((item) => (
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
                        hash: {shorten(item.prevHash, 8, 8)} → {shorten(item.entryHash, 8, 8)}
                      </AppText>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.transferGroup}>
                <View style={styles.transferGroupHeader}>
                  <AppText variant="body" style={styles.cardText}>
                    Off-chain監査署名
                  </AppText>
                  <View style={[styles.transferModeBadge, styles.offchainBadge]}>
                    <AppText variant="small" style={styles.transferModeText}>hash chain receipt</AppText>
                  </View>
                </View>
                {offchainTransfers.length === 0 ? (
                  <AppText variant="caption" style={styles.cardMuted}>
                    Off-chain監査署名の記録はありません
                  </AppText>
                ) : (
                  offchainTransfers.map((item) => (
                    <View key={`off:${item.entryHash}`} style={styles.transferRow}>
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
                        監査署名(hash): {shorten(item.entryHash, 10, 10)}
                      </AppText>
                      <AppText variant="small" style={styles.hashMono}>
                        chain: {shorten(item.prevHash, 8, 8)} → {shorten(item.entryHash, 8, 8)}
                      </AppText>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </Card>

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
  transferGroup: {
    marginBottom: adminTheme.spacing.md,
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
