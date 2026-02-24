import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { Feather } from '@expo/vector-icons';
import { useRecipientStore } from '../store/recipientStore';
import { usePhantomStore } from '../store/phantomStore';
import { getConnection } from '../solana/singleton';
import {
  getSolBalance,
  getTokenBalances,
  formatMintShort,
  type TokenBalanceItem,
} from '../solana/wallet';
import { AppText, Card, Button } from '../ui/components';
import { theme } from '../ui/theme';
import { initiatePhantomConnect } from '../utils/phantom';
import { setPhantomWebReturnPath } from '../utils/phantomWebReturnPath';
import * as nacl from 'tweetnacl';

const LAMPORTS_PER_SOL = 1e9;

export const WalletScreen: React.FC = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const walletPubkey = useRecipientStore((s) => s.walletPubkey);
  const setWalletPubkey = useRecipientStore((s) => s.setWalletPubkey);
  const setPhantomSession = useRecipientStore((s) => s.setPhantomSession);
  const setState = useRecipientStore((s) => s.setState);
  const clearRecipientError = useRecipientStore((s) => s.clearError);
  const { saveKeyPair, clearPhantomKeys } = usePhantomStore();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenBalanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  const fetchBalances = useCallback(async (isRefresh = false) => {
    if (!walletPubkey) {
      setSolBalance(null);
      setTokens([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const connection = getConnection();
      const owner = new PublicKey(walletPubkey);
      const [sol, tokenList] = await Promise.all([
        getSolBalance(connection, owner),
        getTokenBalances(connection, owner),
      ]);
      setSolBalance(sol);
      setTokens(tokenList);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.length > 80 ? msg.slice(0, 80) + '…' : msg);
      setSolBalance(null);
      setTokens([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [walletPubkey]);

  useEffect(() => {
    fetchBalances(false);
  }, [fetchBalances]);

  useFocusEffect(
    useCallback(() => {
      fetchBalances(false);
    }, [fetchBalances])
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setIsSettingsVisible(true)}
          style={styles.headerButton}
        >
          <Feather name="settings" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const onRefresh = useCallback(() => {
    fetchBalances(true);
  }, [fetchBalances]);

  const handleConnect = async () => {
    try {
      // 新しいキーペアを生成して保存
      const keyPair = nacl.box.keyPair();
      await saveKeyPair(keyPair);

      const dappEncryptionPublicKey = Buffer.from(keyPair.publicKey).toString('base64');
      const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.location?.origin;
      const appUrl = isWeb ? window.location.origin : 'https://wene.app';
      const redirectLink = isWeb
        ? `${window.location.origin}/phantom-callback`
        : 'wene://phantom/connect';
      if (isWeb) {
        const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        setPhantomWebReturnPath(returnPath);
      }

      // Phantom接続を開始
      await initiatePhantomConnect(
        dappEncryptionPublicKey,
        keyPair.secretKey,
        redirectLink,
        'devnet',
        appUrl
      );
      setIsSettingsVisible(false);
    } catch (e) {
      console.error(e);
      setError('接続エラーが発生しました');
    }
  };

  const handleDisconnect = async () => {
    try {
      await clearPhantomKeys();
      await setWalletPubkey(null);
      setPhantomSession(null);
      setState('Idle');
      clearRecipientError();
      setSolBalance(null);
      setTokens([]);
      setError(null);
      setIsSettingsVisible(false);
    } catch (e) {
      console.error(e);
      setError('接続解除に失敗しました');
    }
  };

  const showNoWallet = !walletPubkey;
  // loading表示はウォレットがある場合のみにする（未接続時は静的表示）
  const showLoading = !showNoWallet && loading && !refreshing;

  return (
    <View style={styles.container}>
      <Modal
        visible={isSettingsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <AppText variant="h3">設定</AppText>
              <TouchableOpacity onPress={() => setIsSettingsVisible(false)}>
                <Feather name="x" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <AppText variant="body" style={styles.modalDescription}>
                外部ウォレットと連携することで、保有資産を安全にリンクできます。
              </AppText>
              {walletPubkey ? (
                <AppText variant="small" style={styles.connectedWalletText}>
                  接続中: {walletPubkey.slice(0, 8)}…{walletPubkey.slice(-8)}
                </AppText>
              ) : null}
              <Button
                title="Phantom Walletと接続・連携する"
                onPress={handleConnect}
                variant="primary"
                style={styles.connectButton}
              />
              {walletPubkey ? (
                <Button
                  title="接続を解除する"
                  onPress={handleDisconnect}
                  variant="secondary"
                  style={styles.disconnectButton}
                />
              ) : null}
              <Button
                title="閉じる"
                onPress={() => setIsSettingsVisible(false)}
                variant="secondary"
                style={styles.closeButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {showNoWallet ? (
        <View style={styles.center}>
          <View style={styles.iconContainer}>
            <Feather name="shield" size={64} color={theme.colors.gray300} />
          </View>
          <AppText variant="h3" style={styles.title}>
            保護されています
          </AppText>
          <AppText variant="body" style={styles.muted}>
            アプリ内ウォレット機能により{'\n'}
            あなたの資産と権限は保護されています
          </AppText>

          <Button
            title="ホームに戻る"
            onPress={() => router.replace('/')}
            variant="secondary"
            style={styles.topButton}
          />
        </View>
      ) : showLoading ? (
        <View style={styles.center}>
          <AppText variant="body" style={styles.muted}>
            読み込み中…
          </AppText>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <AppText variant="h2" style={styles.title}>
              保有トークン一覧
            </AppText>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <AppText variant="caption" style={styles.refreshText}>
                更新
              </AppText>
            </TouchableOpacity>
          </View>

          {error ? (
            <Card style={styles.errorCard}>
              <AppText variant="caption" style={styles.errorText}>
                {error}
              </AppText>
              <Button
                title="再試行"
                onPress={() => fetchBalances(false)}
                variant="secondary"
                style={styles.retryButton}
              />
            </Card>
          ) : null}

          <View style={styles.solCardWrap}>
            <Card style={styles.solCard}>
              <AppText variant="caption" style={styles.solLabel}>
                SOL 残高
              </AppText>
              <AppText variant="h1" style={styles.solValue}>
                {solBalance != null
                  ? (solBalance / LAMPORTS_PER_SOL).toFixed(4)
                  : '—'}{' '}
                SOL
              </AppText>
              <AppText variant="small" style={styles.pubkeyText}>
                {walletPubkey.slice(0, 8)}…{walletPubkey.slice(-8)}
              </AppText>
            </Card>
          </View>

          <AppText variant="caption" style={styles.sectionLabel}>
            トークン
          </AppText>
          <FlatList
            data={tokens}
            keyExtractor={(item) => item.ata ?? item.mint}
            contentContainerStyle={
              tokens.length === 0 ? styles.listEmpty : styles.listContent
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              !error ? (
                <View style={styles.emptyWrap}>
                  <AppText variant="body" style={styles.emptyText}>
                    トークンがありません
                  </AppText>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Card style={styles.tokenCard}>
                <AppText variant="caption" style={styles.tokenMint}>
                  {formatMintShort(item.mint)}
                </AppText>
                <AppText variant="h3" style={styles.tokenAmount}>
                  {item.amount}
                </AppText>
                <AppText variant="small" style={styles.tokenDecimals}>
                  decimals: {item.decimals}
                </AppText>
              </Card>
            )}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  headerButton: {
    padding: theme.spacing.sm,
    marginRight: theme.spacing.sm,
  },
  title: {
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  refreshButton: {
    padding: theme.spacing.sm,
  },
  refreshText: {
    color: theme.colors.textSecondary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
    opacity: 0.5,
  },
  muted: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  topButton: {
    marginTop: theme.spacing.md,
    minWidth: 200,
  },
  errorCard: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  retryButton: {
    marginTop: theme.spacing.sm,
  },
  solCardWrap: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  solCard: {
    alignItems: 'center',
  },
  solLabel: {
    marginBottom: theme.spacing.sm,
    color: theme.colors.textSecondary,
  },
  solValue: {
    textAlign: 'center',
  },
  pubkeyText: {
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    color: theme.colors.textTertiary,
  },
  sectionLabel: {
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  listEmpty: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  emptyWrap: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
  },
  tokenCard: {
    marginBottom: theme.spacing.sm,
  },
  tokenMint: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  tokenAmount: {
    marginBottom: theme.spacing.xs,
  },
  tokenDecimals: {
    color: theme.colors.textTertiary,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : theme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalBody: {
    gap: theme.spacing.md,
  },
  modalDescription: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  connectedWalletText: {
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  connectButton: {
    marginBottom: theme.spacing.sm,
  },
  disconnectButton: {
    marginBottom: theme.spacing.sm,
  },
  closeButton: {
    // marginBottom is handled by paddingBottom of modalContent
  },
});
