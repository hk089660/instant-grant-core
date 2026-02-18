import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/ui/theme';

export default function DrawerLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Drawer
                screenOptions={{
                    headerShown: true,
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        elevation: 0,
                        shadowOpacity: 0,
                        borderBottomWidth: 0,
                    },
                    headerTintColor: theme.colors.text,
                    headerTitle: '',
                    drawerActiveTintColor: theme.colors.black,
                    drawerInactiveTintColor: theme.colors.textSecondary,
                    drawerStyle: {
                        backgroundColor: theme.colors.background,
                    },
                    drawerLabelStyle: {
                        marginLeft: -20,
                    },
                }}
            >
                <Drawer.Screen
                    name="index"
                    options={{
                        drawerLabel: '参加券一覧',
                        drawerIcon: ({ size, color }) => (
                            <Ionicons name="list-outline" size={size} color={color} />
                        ),
                    }}
                />
                <Drawer.Screen
                    name="wallet"
                    options={{
                        drawerLabel: 'Wallet接続',
                        drawerIcon: ({ size, color }) => (
                            <Ionicons name="wallet-outline" size={size} color={color} />
                        ),
                    }}
                />
                <Drawer.Screen
                    name="profile"
                    options={{
                        drawerLabel: 'アカウントプロフィール',
                        drawerIcon: ({ size, color }) => (
                            <Ionicons name="person-outline" size={size} color={color} />
                        ),
                    }}
                />
            </Drawer>
        </GestureHandlerRootView>
    );
}
