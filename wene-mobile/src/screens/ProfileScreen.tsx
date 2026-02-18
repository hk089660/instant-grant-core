import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, CategoryTabs, BalanceList, BALANCE_LIST_DUMMY } from '../ui/components';
import { theme } from '../ui/theme';
import { useRecipientStore } from '../store/recipientStore';
import { usePhantomStore } from '../store/phantomStore';

const CATEGORIES = [
    { id: 'profile', label: '登録情報' },
    { id: 'history', label: '取得した参加券' },
];

export const ProfileScreen: React.FC = () => {
    const router = useRouter();
    const { walletPubkey } = useRecipientStore();
    const { clearPhantomKeys } = usePhantomStore();
    const [activeTab, setActiveTab] = useState('profile');

    const handleLogout = async () => {
        await clearPhantomKeys();
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
                                    未設定
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
                        <BalanceList
                            connected={!!walletPubkey}
                            items={BALANCE_LIST_DUMMY}
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
});
