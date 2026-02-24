/**
 * ID + PIN で利用者ログイン
 * 確認後 /u/scan へ
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button } from '../../ui/components';
import { theme } from '../../ui/theme';
import { schoolRoutes } from '../../lib/schoolRoutes';
import { syncUserTickets } from '../../api/userApi';
import { HttpError } from '../../api/http/httpClient';
import { useAuth } from '../../contexts/AuthContext';
import { useRecipientTicketStore } from '../../store/recipientTicketStore';

const USER_ID_REGEX = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const PIN_REGEX = /^\d{4,6}$/;

export const UserLoginScreen: React.FC = () => {
  const router = useRouter();
  const { clearUser, setUserId } = useAuth();
  const replaceTickets = useRecipientTicketStore((state) => state.replaceTickets);
  const [userId, setUserIdLocal] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = useCallback(async () => {
    const userIdVal = userId.trim().toLowerCase();
    const pinVal = pin.trim();
    setError(null);
    if (!USER_ID_REGEX.test(userIdVal)) {
      setError('IDは3〜32文字、英小文字・数字・._-で入力してください');
      return;
    }
    if (!PIN_REGEX.test(pinVal)) {
      setError('PINは4〜6桁の数字で入力してください');
      return;
    }
    setLoading(true);
    try {
      const syncResult = await syncUserTickets(userIdVal, pinVal);
      await replaceTickets(
        syncResult.tickets.map((ticket) => ({
          eventId: ticket.eventId,
          eventName: ticket.eventName,
          joinedAt: ticket.claimedAt,
          mintAddress: ticket.mint,
          txSignature: ticket.txSignature,
          receiptPubkey: ticket.receiptPubkey,
          confirmationCode: ticket.confirmationCode,
          auditReceiptId: ticket.auditReceiptId,
          auditReceiptHash: ticket.auditReceiptHash,
        }))
      );
      clearUser();
      setUserId(userIdVal);
      router.replace(schoolRoutes.scan as any);
    } catch (e: unknown) {
      if (e instanceof HttpError) {
        const body = e.body as { code?: unknown; error?: unknown };
        if (body?.code === 'invalid_pin' || body?.code === 'user_not_found') {
          setError('IDまたはPINが正しくありません');
          return;
        }
        if (typeof body?.error === 'string' && body.error.trim()) {
          setError(body.error);
          return;
        }
      }
      setError('接続に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [userId, pin, replaceTickets, clearUser, setUserId, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            ログイン
          </AppText>
          <AppText variant="caption" style={styles.subtitle}>
            登録したIDとPINを入力してください
          </AppText>
          <AppText variant="caption" style={styles.autofillHint}>
            ブラウザでは、表示されるパスワード保存を許可するとID/PINの再入力を省略できます。
          </AppText>

          <AppText variant="caption" style={styles.label}>
            ID
          </AppText>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={(t) => setUserIdLocal(t.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32))}
            placeholder="登録したID"
            placeholderTextColor={theme.colors.textTertiary}
            maxLength={32}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            importantForAutofill="yes"
          />

          <AppText variant="caption" style={styles.label}>
            PIN
          </AppText>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="4〜6桁の数字"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            editable={!loading}
            autoComplete="password"
            textContentType="password"
            importantForAutofill="yes"
          />

          {error ? (
            <AppText variant="caption" style={styles.errorText}>
              {error}
            </AppText>
          ) : null}

          <View style={styles.actionGroup}>
            <Button
              title={loading ? 'ログイン中…' : 'ログインする'}
              onPress={handleVerify}
              loading={loading}
              disabled={loading}
            />
            <Button
              title="戻る"
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />
            <TouchableOpacity
              onPress={() => router.push(schoolRoutes.register as any)}
              style={styles.registerLink}
            >
              <AppText variant="caption" style={styles.registerLinkText}>
                まだ登録していない方はこちら
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  autofillHint: {
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.md,
  },
  label: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  errorText: {
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  actionGroup: {
    marginTop: theme.spacing.md,
  },
  backButton: {
    marginTop: theme.spacing.sm,
  },
  registerLink: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  registerLinkText: {
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
