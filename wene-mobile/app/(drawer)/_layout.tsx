import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/ui/theme';
import { DrawerContent } from '../../src/ui/components/DrawerContent';
import type { DrawerNavigationProp } from '@react-navigation/drawer';

/**
 * 設定ボタン（ヘッダー左のダークピル型ボタン）
 * タップするとドロワーを開く
 */
function HeaderSettingsButton({ navigation }: { navigation: DrawerNavigationProp<any> }) {
    return (
        <TouchableOpacity
            onPress={() => navigation.openDrawer()}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerButtonWrap}
        >
            <View style={styles.pill}>
                <Ionicons name="settings-sharp" size={14} color="#ffffff" />
                <Text style={styles.pillLabel}>we-ne</Text>
            </View>
        </TouchableOpacity>
    );
}

export default function DrawerLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Drawer
                drawerContent={(props) => <DrawerContent {...props} />}
                screenOptions={({ navigation }) => ({
                    headerShown: true,
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        elevation: 0,
                        shadowOpacity: 0,
                        borderBottomWidth: 0,
                    },
                    headerTintColor: theme.colors.text,
                    headerTitle: '',
                    // デフォルトの左側ハンバーガーを設定ボタンに置き換え
                    headerLeft: () => (
                        <HeaderSettingsButton navigation={navigation as DrawerNavigationProp<any>} />
                    ),
                    // 右側のボタンは非表示
                    headerRight: () => null,
                    drawerStyle: {
                        backgroundColor: theme.colors.background,
                        width: 280,
                    },
                })}
            >
                <Drawer.Screen
                    name="index"
                    options={{
                        drawerLabel: 'ホーム',
                    }}
                />
                <Drawer.Screen
                    name="wallet"
                    options={{
                        drawerLabel: 'Wallet接続',
                    }}
                />
                <Drawer.Screen
                    name="profile"
                    options={{
                        drawerLabel: 'アカウント',
                    }}
                />
            </Drawer>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    headerButtonWrap: {
        paddingLeft: theme.spacing.md,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.gray600,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 5,
        // シャドウ
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
    },
    pillLabel: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
});
