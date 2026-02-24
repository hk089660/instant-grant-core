import React, { useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, EventRow, Loading, StatusDot } from '../../ui/components';
import { theme } from '../../ui/theme';
import { useRecipientTicketStore } from '../../store/recipientTicketStore';
import { getSchoolDeps } from '../../api/createSchoolDeps';
import { schoolRoutes } from '../../lib/schoolRoutes';
import type { SchoolEvent } from '../../types/school';

export const UserEventsScreen: React.FC = () => {
  const router = useRouter();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [manualLoading, setManualLoading] = useState(false);
  const { tickets, loadTickets } = useRecipientTicketStore();
  const isLoading = eventsLoading || manualLoading;

  const loadEventList = useCallback(async () => {
    setEventsLoading(true);
    try {
      const items = await getSchoolDeps().eventProvider.getAll();
      setEvents(items);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // イベント一覧を API から取得
  useEffect(() => {
    loadEventList().catch(() => { });
  }, [loadEventList]);

  // フォーカス時にローカルチケットを再読み込み
  useFocusEffect(
    useCallback(() => {
      loadTickets().catch(() => { });
    }, [loadTickets])
  );

  const handleReloadTickets = useCallback(async () => {
    if (isLoading) return;
    setManualLoading(true);
    try {
      await Promise.all([
        loadEventList(),
        loadTickets(),
      ]);
    } finally {
      setManualLoading(false);
    }
  }, [isLoading, loadEventList, loadTickets]);

  const joinedEvents = tickets.map((ticket) => {
    const event = events.find((item) => item.id === ticket.eventId);
    return {
      id: ticket.eventId,
      title: event?.title ?? ticket.eventName,
      datetime: event?.datetime ?? '-',
      host: event?.host ?? '-',
      solanaMint: event?.solanaMint,
    };
  });

  const handleOpenJoinedTicket = useCallback(
    (eventId: string) => {
      const joinedTicket = tickets.find((ticket) => ticket.eventId === eventId);
      if (!joinedTicket) return;
      router.push(
        schoolRoutes.success(eventId, {
          tx: joinedTicket?.txSignature,
          receipt: joinedTicket?.receiptPubkey,
          confirmationCode: joinedTicket?.confirmationCode,
          mint: joinedTicket?.mintAddress,
          auditReceiptId: joinedTicket?.auditReceiptId,
          auditReceiptHash: joinedTicket?.auditReceiptHash,
          popEntryHash: joinedTicket?.popEntryHash,
          popAuditHash: joinedTicket?.popAuditHash,
          popSigner: joinedTicket?.popSigner,
        }) as any
      );
    },
    [router, tickets]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="h2" style={styles.title}>
          参加券
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          参加履歴を表示しています
        </AppText>

        <Button
          title="QRを読み取って参加"
          onPress={() => router.push(schoolRoutes.scan as any)}
          variant="primary"
          style={styles.mainButton}
        />
        <Button
          title={isLoading ? '参加券を読み込み中…' : '参加券を再読み込み'}
          onPress={handleReloadTickets}
          variant="secondary"
          loading={isLoading}
          disabled={isLoading}
          style={styles.reloadButton}
        />
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <Loading message="参加券一覧を更新しています…" />
          </View>
        ) : null}

        {/* 参加履歴 */}
        <View style={styles.section}>
          <AppText variant="h3">参加済み（{joinedEvents.length}件）</AppText>
          {joinedEvents.length === 0 ? (
            isLoading ? (
              <View style={styles.inlineLoadingWrap}>
                <Loading message="読み込み中…" />
              </View>
            ) : (
              <AppText variant="caption" style={styles.emptyText}>
                参加済みのイベントはありません
              </AppText>
            )
          ) : (
            joinedEvents.map((event) => (
              <EventRow
                key={event.id}
                title={event.title}
                datetime={event.datetime}
                host={event.host}
                leftSlot={<StatusDot color="#38b000" />}
                onPress={() => handleOpenJoinedTicket(event.id)}
                solanaMint={event.solanaMint}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xxl,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  mainButton: {
    marginBottom: theme.spacing.sm,
  },
  reloadButton: {
    marginBottom: theme.spacing.sm,
  },
  loadingWrap: {
    marginBottom: theme.spacing.md,
  },
  inlineLoadingWrap: {
    marginTop: theme.spacing.sm,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  emptyText: {
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.sm,
  },
});
