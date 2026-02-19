import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { AppText, Button, Card, CategoryTabs, BalanceList } from '../ui/components';
import { theme } from '../ui/theme';
import { useRecipientStore } from '../store/recipientStore';
import { usePhantomStore } from '../store/phantomStore';
import { useAuth } from '../contexts/AuthContext';
import { getConnection } from '../solana/singleton';
import { formatMintShort, getTokenBalances } from '../solana/wallet';
import type { BalanceItem } from '../types/balance';

const CATEGORIES = [
    { id: 'profile', label: '登録情報' },
    { id: 'history', label: '取得した参加券' },
];

export const ProfileScreen: React.FC = () => {
    const router = useRouter();
    const { walletPubkey } = useRecipientStore();
    const { clearPhantomKeys } = usePhantomStore();
    const { userId, displayName: authDisplayName, clearUser } = useAuth();
    const [activeTab, setActiveTab] = useState('profile');
    const [ticketItems, setTicketItems] = useState<BalanceItem[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(false);
    const [ticketsError, setTicketsError] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab !== 'history') return;
        if (!walletPubkey) {
            setTicketItems([]);
            setTicketsError(null);
            return;
        }

        let cancelled = false;
        const loadTickets = async () => {
            setTicketsLoading(true);
            setTicketsError(null);
            try {
                const connection = getConnection();
                const owner = new PublicKey(walletPubkey);
                const tokens = await getTokenBalances(connection, owner);
                if (cancelled) return;
                const items: BalanceItem[] = tokens.map((token, index) => ({
                    id: `spl-ticket-${token.ata ?? token.mint}-${index}`,
                    name: '参加券 (SPL)',
                    issuer: `Mint: ${formatMintShort(token.mint, 8, 6)}`,
                    amountText: token.amount,
                    unit: token.decimals === 0 ? '枚' : 'SPL',
                    source: 'spl',
                    todayUsable: true,
                }));
                setTicketItems(items);
            } catch (e) {
                if (cancelled) return;
                setTicketItems([]);
                setTicketsError(e instanceof Error ? e.message : '参加券の同期に失敗しました');
            } finally {
                if (!cancelled) setTicketsLoading(false);
            }
        };

        loadTickets();
        return () => {
            cancelled = true;
        };
    }, [activeTab, walletPubkey]);

    const handleLogout = async () => {
        await clearPhantomKeys();
        clearUser();
        router.replace('/');
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <AppText variant="h2" style={styles.title}>
                    アカウント
                </AppText>
            </View>

            <CategoryTabs
                categories={CATEGORIES}
                selectedId={activeTab}
                onSelect={(id) => setActiveTab(id)}
                style={styles.tabs}
            />

            <ScrollView contentContainerStyle={styles.content}>
                {activeTab === 'profile' ? (
                    <View style={styles.section}>
                        <Card style={styles.card}>
                            <View style={styles.row}>
                                <AppText variant="caption" style={styles.label}>
                                    ユーザー名
                                </AppText>
                                <AppText variant="body" style={styles.value}>
                                    {authDisplayName ?? '未設定'}
                                </AppText>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <AppText variant="caption" style={styles.label}>
                                    ウォレットアドレス
                                </AppText>
                                <AppText variant="body" style={styles.value} numberOfLines={1}>
                                    {walletPubkey
                                        ? `${walletPubkey.slice(0, 12)}...${walletPubkey.slice(-12)}`
                                        : '未接続'}
                                </AppText>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <AppText variant="caption" style={styles.label}>
                                    ステータス
                                </AppText>
                                <AppText variant="body" style={styles.value}>
                                    一般ユーザー
                                </AppText>
                            </View>
                        </Card>

                        <Button
                            title="ログアウト"
                            onPress={handleLogout}
                            variant="secondary"
                            style={styles.logoutButton}
                        />
                    </View>
                ) : (
                    <View style={styles.section}>
                        {ticketsLoading ? (
                            <AppText variant="caption" style={styles.helperText}>
                                接続中ウォレットの参加券を同期しています…
                            </AppText>
                        ) : null}
                        {ticketsError ? (
                            <AppText variant="caption" style={styles.errorText}>
                                {ticketsError}
                            </AppText>
                        ) : null}
                        <BalanceList
                            connected={!!walletPubkey}
                            items={ticketItems}
                            style={styles.balanceList}
                        />
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.md,
        alignItems: 'center',
    },
    title: {
        fontWeight: 'bold',
    },
    tabs: {
        marginBottom: theme.spacing.md,
    },
    content: {
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.xxl,
    },
    section: {
        flex: 1,
    },
    card: {
        padding: 0,
        overflow: 'hidden',
    },
    row: {
        padding: theme.spacing.md,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.divider,
    },
    label: {
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    value: {
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        fontWeight: '500',
    },
    logoutButton: {
        marginTop: theme.spacing.xl,
    },
    balanceList: {
        marginTop: 0, // BalanceList自体のマージンをリセットして調整
    },
    helperText: {
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.sm,
    },
    errorText: {
        color: theme.colors.error,
        marginBottom: theme.spacing.sm,
    },
});
