/**
 * 学校向け参加券クレーム画面
 *
 * ウォレット・署名・送信の文言は一切表示しない。
 * 「参加しました」「参加履歴に保存されました」のみ表示。
 */

import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card } from '../ui/components';
import { theme } from '../ui/theme';
import { useSchoolClaim } from '../hooks/useSchoolClaim';
import { useRecipientTicketStore } from '../store/recipientTicketStore';
import { schoolRoutes } from '../lib/schoolRoutes';
import { useEventIdFromParams } from '../hooks/useEventIdFromParams';
import { copyTextWithFeedback } from '../utils/copyText';

export const SchoolClaimScreen: React.FC = () => {
  const router = useRouter();
  const { eventId, isValid } = useEventIdFromParams({ redirectOnInvalid: true });
  const { loadTickets, getTicketByEventId } = useRecipientTicketStore();
  const { status, error, isRetryable, event, isJoined, lastSuccess, handleClaim } = useSchoolClaim(eventId ?? undefined);
  const ticket = eventId ? getTicketByEventId(eventId) : undefined;
  const confirmationCode = lastSuccess?.confirmationCode ?? ticket?.confirmationCode;
  const auditReceiptId = lastSuccess?.ticketReceipt?.receiptId ?? ticket?.auditReceiptId;
  const auditReceiptHash = lastSuccess?.ticketReceipt?.receiptHash ?? ticket?.auditReceiptHash;

  const handleCopyReceipt = useCallback(async () => {
    const payload = [
      'Participation Ticket Receipt',
      `eventId: ${eventId ?? '-'}`,
      `confirmation_code: ${confirmationCode ?? '-'}`,
      `receipt_id: ${auditReceiptId ?? '-'}`,
      `receipt_hash: ${auditReceiptHash ?? '-'}`,
      'verify_api: /api/audit/receipts/verify-code',
    ].join('\n');

    await copyTextWithFeedback(payload, {
      successMessage: '参加券レシートをコピーしました',
    });
  }, [eventId, confirmationCode, auditReceiptId, auditReceiptHash]);

  useEffect(() => {
    loadTickets().catch(() => {});
  }, [loadTickets]);

  if (!isValid) return null;

  if (!eventId || !event) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContent}>
          <AppText variant="h3" style={styles.title}>
            見つかりません
          </AppText>
          <AppText variant="body" style={styles.secondaryText}>
            このイベントは見つかりません。
          </AppText>
          <Button title="ホームに戻る" onPress={() => router.replace(schoolRoutes.home as any)} variant="secondary" style={styles.button} />
        </View>
      </SafeAreaView>
    );
  }

  const joined = isJoined;

  if (status === 'success' || status === 'already' || joined) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <AppText variant="h2" style={styles.title}>
              参加完了
            </AppText>
            <Card style={styles.mainCard}>
              <AppText variant="body" style={styles.successText}>
                参加しました
              </AppText>
              <AppText variant="caption" style={styles.secondaryText}>
                参加履歴に保存されました
              </AppText>
              {event?.title && (
                <AppText variant="caption" style={styles.eventName}>
                  {event.title}
                </AppText>
              )}
            </Card>
            {(confirmationCode || auditReceiptId || auditReceiptHash) && (
              <Card style={styles.mainCard}>
                <AppText variant="body" style={styles.successText}>
                  参加券（監査レシート）
                </AppText>
                {confirmationCode && (
                  <AppText variant="caption" style={styles.secondaryText}>
                    確認コード: #{confirmationCode}
                  </AppText>
                )}
                {auditReceiptId && (
                  <AppText variant="caption" style={styles.secondaryText} selectable>
                    receipt_id: {auditReceiptId}
                  </AppText>
                )}
                {auditReceiptHash && (
                  <AppText variant="caption" style={styles.secondaryText} selectable>
                    receipt_hash: {auditReceiptHash}
                  </AppText>
                )}
                <AppText variant="caption" style={styles.eventName}>
                  第三者は /api/audit/receipts/verify-code で検証できます
                </AppText>
                <Button
                  title="参加券レシートをコピー"
                  onPress={handleCopyReceipt}
                  variant="secondary"
                  style={styles.copyButton}
                />
              </Card>
            )}
            <Button title="ホームに戻る" onPress={() => router.replace(schoolRoutes.home as any)} variant="primary" style={styles.button} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            イベントに参加する
          </AppText>

          <Card style={styles.mainCard}>
            <AppText variant="h3">{event.title}</AppText>
            <AppText variant="caption" style={styles.cardCaption}>
              {event.datetime}
            </AppText>
            <AppText variant="caption" style={styles.cardCaption}>
              主催: {event.host}
            </AppText>
          </Card>

          {status === 'error' && error && (
            <Card style={styles.errorCard}>
              <AppText variant="body" style={styles.errorText}>
                {error}
              </AppText>
            </Card>
          )}

          <Button
            title={status === 'loading' ? '処理中…' : status === 'error' && isRetryable ? '再試行' : '参加する'}
            onPress={handleClaim}
            variant="primary"
            loading={status === 'loading'}
            disabled={status === 'loading'}
            style={styles.button}
          />

          <Button title="ホームに戻る" onPress={() => router.replace(schoolRoutes.home as any)} variant="secondary" style={styles.button} />
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xxl,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.lg,
  },
  mainCard: {
    marginBottom: theme.spacing.lg,
  },
  cardCaption: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  successText: {
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  secondaryText: {
    color: theme.colors.textSecondary,
  },
  eventName: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textTertiary,
  },
  errorCard: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.gray50,
  },
  errorText: {
    color: theme.colors.error,
  },
  button: {
    marginBottom: theme.spacing.sm,
  },
  copyButton: {
    marginTop: theme.spacing.sm,
    marginBottom: 0,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
});
