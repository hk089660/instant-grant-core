import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PublicKey } from '@solana/web3.js';
import { getGrantByCampaignId } from '../../src/api/getGrant';
import type { Grant } from '../../src/types/grant';
import { formatDeadlineJst, formatRemainingTime, isExpired } from '../../src/utils/deadline';
import { AppText, Card, Button, Pill } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';
import { useRecipientStore } from '../../src/store/recipientStore';
import { usePhantomStore } from '../../src/store/phantomStore';
import { buildUseTx } from '../../src/solana/txBuilders';
import { signTransaction } from '../../src/utils/phantom';
import { sendSignedTx } from '../../src/solana/sendTx';

type UseScreenState = 'Idle' | 'Using' | 'Used' | 'Error';

export default function UseScreen() {
  const { campaignId } = useLocalSearchParams<{ campaignId: string }>();
  const router = useRouter();
  const {
    walletPubkey,
    phantomSession,
    isUsed,
    lastUsedSignature,
    setError,
    checkUsed,
    markAsUsed,
  } = useRecipientStore();
  const {
    dappEncryptionPublicKey,
    dappSecretKey,
    phantomEncryptionPublicKey,
  } = usePhantomStore();
  const [grant, setGrant] = useState<Grant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [useScreenState, setUseScreenState] = useState<UseScreenState>('Idle');
  const [useError, setUseError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      setGrant(null);
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setNotFound(false);
    getGrantByCampaignId(campaignId)
      .then((g) => {
        if (g) {
          setGrant(g);
          setNotFound(false);
        } else {
          setGrant(null);
          setNotFound(true);
        }
      })
      .catch(() => {
        setGrant(null);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
    
    if (campaignId && walletPubkey) {
      checkUsed(campaignId, walletPubkey);
    }
  }, [campaignId, walletPubkey, checkUsed]);

  const handleUse = async () => {
    if (useScreenState !== 'Idle' || !campaignId || !walletPubkey) return;

    if (!phantomSession || !phantomEncryptionPublicKey || !dappEncryptionPublicKey || !dappSecretKey) {
      setUseError('Phantomに接続してください');
      setUseScreenState('Error');
      return;
    }

    if (grant && isExpired(grant)) {
      setUseError('期限切れのため使用できません');
      setUseScreenState('Error');
      return;
    }

    setUseScreenState('Using');
    setUseError(null);

    try {
      if (!walletPubkey) {
        setUseError('ウォレットが接続されていません');
        setUseScreenState('Error');
        return;
      }

      const recipientPubkey = new PublicKey(walletPubkey);
      const result = await buildUseTx({
        campaignId,
        recipientPubkey,
      });

      if (result.meta.amount === BigInt(0)) {
        setUseError('残高がありません');
        setUseScreenState('Error');
        return;
      }

      if (result.meta.instructionCount === 0) {
        setUseError('使用するトークンがありません');
        setUseScreenState('Error');
        return;
      }

      const signed = await signTransaction({
        tx: result.tx,
        session: phantomSession,
        dappEncryptionPublicKey,
        dappSecretKey,
        phantomEncryptionPublicKey,
        redirectLink: 'wene://phantom/sign',
        cluster: 'devnet',
        appUrl: 'https://wene.app',
      });

      const signature = await sendSignedTx(signed, {
        blockhash: result.meta.recentBlockhash,
        lastValidBlockHeight: result.meta.lastValidBlockHeight,
      });
      await markAsUsed(campaignId, walletPubkey, signature);
      setUseScreenState('Used');
    } catch (error) {
      console.error('Use failed:', error);
      setUseError(error instanceof Error ? error.message : '使用処理に失敗しました');
      setUseScreenState('Error');
      setError(error instanceof Error ? error.message : '使用処理に失敗しました');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <AppText variant="body" style={styles.muted}>
            読み込み中…
          </AppText>
        </View>
      </View>
    );
  }

  if (notFound || !grant) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <AppText variant="h3" style={styles.title}>
            見つかりません
          </AppText>
          <AppText variant="body" style={styles.muted}>
            このキャンペーンは存在しないか、期限切れです。
          </AppText>
          <Button title="ウォレットに戻る" onPress={() => router.back()} variant="secondary" style={styles.cta} />
        </View>
      </View>
    );
  }

  const balance = grant?.balance ?? 0;
  const expired = grant ? isExpired(grant) : false;
  const canUse = !expired && !isUsed && useScreenState !== 'Used' && walletPubkey && phantomSession;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            {grant.title}
          </AppText>

          {expired && (
            <View style={styles.pillContainer}>
              <Pill label="期限切れ" variant="expired" />
            </View>
          )}
          {isUsed && (
            <View style={styles.pillContainer}>
              <Pill label="使用済み" variant="active" />
            </View>
          )}

          <Card style={styles.card}>
            <AppText variant="caption" style={styles.label}>
              残高
            </AppText>
            <AppText variant="h3" style={styles.value}>
              {isUsed ? 0 : balance} Credit
            </AppText>
          </Card>

          <Card style={styles.card}>
            <View style={styles.row}>
              <AppText variant="caption" style={styles.label}>
                期限
              </AppText>
              <AppText variant="body" style={styles.value}>
                {formatDeadlineJst(grant)}
              </AppText>
            </View>
            <View style={[styles.row, styles.rowLast]}>
              <AppText variant="caption" style={styles.label}>
                残り時間
              </AppText>
              <AppText variant="body" style={styles.value}>
                {formatRemainingTime(grant)}
              </AppText>
            </View>
          </Card>

          {grant.usageHint && (
            <Card style={styles.card}>
              <AppText variant="caption" style={styles.label}>
                利用先
              </AppText>
              <AppText variant="body" style={styles.usageHint}>
                {grant.usageHint}
              </AppText>
            </Card>
          )}

          {useError && useScreenState === 'Error' && (
            <Card style={styles.errorCard}>
              <AppText variant="caption" style={styles.errorText}>
                {useError}
              </AppText>
            </Card>
          )}

          {useScreenState === 'Used' && lastUsedSignature && (
            <Card style={styles.card}>
              <AppText variant="caption" style={styles.label}>
                使用完了
              </AppText>
              <AppText variant="small" style={styles.signatureText} numberOfLines={2}>
                {lastUsedSignature}
              </AppText>
            </Card>
          )}

          {useScreenState === 'Used' ? (
            <Button
              title="ウォレットに戻る"
              onPress={() => router.back()}
              variant="primary"
              style={styles.cta}
            />
          ) : (
            <Button
              title={useScreenState === 'Using' ? '処理中…' : '使用する'}
              onPress={handleUse}
              variant="primary"
              disabled={!canUse || useScreenState === 'Using'}
              loading={useScreenState === 'Using'}
              style={styles.cta}
            />
          )}

          {!walletPubkey || !phantomSession ? (
            <Card style={styles.warningCard}>
              <AppText variant="caption" style={styles.warningText}>
                Phantomに接続してください
              </AppText>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  row: {
    marginBottom: theme.spacing.md,
  },
  rowLast: {
    marginBottom: 0,
  },
  label: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.textSecondary,
  },
  value: {
    color: theme.colors.text,
  },
  usageHint: {
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  muted: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  cta: {
    marginTop: theme.spacing.md,
  },
  pillContainer: {
    marginBottom: theme.spacing.md,
  },
  errorCard: {
    backgroundColor: theme.colors.gray50,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
  },
  signatureText: {
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 14,
    marginTop: theme.spacing.xs,
  },
  warningCard: {
    backgroundColor: theme.colors.gray50,
    marginTop: theme.spacing.md,
  },
  warningText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
