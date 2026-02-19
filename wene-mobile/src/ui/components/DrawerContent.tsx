import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { AppText } from './AppText';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
    key: string;
    label: string;
    icon: IoniconsName;
    screenName: string;
}

const MENU_ITEMS: MenuItem[] = [
    { key: 'home', label: 'ホーム', icon: 'home-outline', screenName: 'index' },
    { key: 'wallet', label: 'Wallet接続', icon: 'wallet-outline', screenName: 'wallet' },
    { key: 'profile', label: 'アカウント', icon: 'person-outline', screenName: 'profile' },
];

/**
 * カスタムドロワーコンテンツ
 * 白黒ミニマルデザインに合わせた設定メニューリスト
 */
export const DrawerContent: React.FC<DrawerContentComponentProps> = (props) => {
    const { state, navigation } = props;
    const insets = useSafeAreaInsets();
    const activeRouteName = state.routes[state.index]?.name;

    const handlePress = (screenName: string) => {
        navigation.navigate(screenName);
    };

    const handleClose = () => {
        navigation.closeDrawer();
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* ヘッダー部分 */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <View style={styles.brandPill}>
                        <Ionicons name="settings-sharp" size={14} color="#ffffff" />
                        <AppText variant="body" style={styles.brandLabel}>we-ne</AppText>
                    </View>
                    <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="close" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                </View>
                <AppText variant="caption" style={styles.subtitle}>設定メニュー</AppText>
            </View>

            {/* 区切り線 */}
            <View style={styles.divider} />

            {/* メニューリスト */}
            <DrawerContentScrollView
                {...props}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {MENU_ITEMS.map((item) => {
                    const isActive = item.screenName === activeRouteName;
                    return (
                        <TouchableOpacity
                            key={item.key}
                            onPress={() => handlePress(item.screenName)}
                            activeOpacity={0.7}
                            style={[
                                styles.menuItem,
                                isActive && styles.menuItemActive,
                            ]}
                        >
                            <Ionicons
                                name={isActive ? (item.icon.replace('-outline', '') as IoniconsName) : item.icon}
                                size={20}
                                color={isActive ? theme.colors.black : theme.colors.textSecondary}
                            />
                            <AppText
                                variant="body"
                                style={[
                                    styles.menuLabel,
                                    isActive && styles.menuLabelActive,
                                ]}
                            >
                                {item.label}
                            </AppText>
                            {isActive && (
                                <View style={styles.activeIndicator} />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </DrawerContentScrollView>

            {/* フッター */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <View style={styles.divider} />
                <AppText variant="small" style={styles.version}>We-ne v1.0</AppText>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    brandPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.gray600,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 5,
    },
    brandLabel: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    subtitle: {
        color: theme.colors.textTertiary,
        marginTop: 8,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginHorizontal: 20,
    },
    scrollContent: {
        paddingTop: 8,
        paddingHorizontal: 12,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginBottom: 2,
        position: 'relative',
    },
    menuItemActive: {
        backgroundColor: theme.colors.gray100,
    },
    menuLabel: {
        marginLeft: 14,
        color: theme.colors.textSecondary,
        fontSize: 15,
        fontWeight: '400',
    },
    menuLabelActive: {
        color: theme.colors.black,
        fontWeight: '600',
    },
    activeIndicator: {
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        backgroundColor: theme.colors.black,
        borderRadius: 2,
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    version: {
        color: theme.colors.textTertiary,
        textAlign: 'center',
        marginTop: 12,
    },
});
