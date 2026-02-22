
import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { masterTheme } from '../../src/ui/masterTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginAdmin } from '../../src/api/adminApi';

export const MASTER_AUTH_KEY = 'master_auth_token';

export default function MasterLayout() {
    const router = useRouter();
    const segments = useSegments();
    const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const token = await AsyncStorage.getItem(MASTER_AUTH_KEY);
                if (!token) {
                    setIsAuthorized(false);
                    return;
                }
                // Validate session token against API so stale local tokens do not keep dashboard accessible.
                const result = await loginAdmin(token);
                if (result.success && result.role === 'master') {
                    setIsAuthorized(true);
                    return;
                }
                await AsyncStorage.removeItem(MASTER_AUTH_KEY);
                setIsAuthorized(false);
            } catch (e) {
                setIsAuthorized(false);
            }
        };
        checkAuth();
    }, [segments]);

    useEffect(() => {
        if (isAuthorized === false) {
            // If not authorized and not on login screen, redirect
            // Ensure we don't loop if already on login
            // `useSegments()` can be inferred as a tuple in typed-routes mode,
            // so avoid fixed index access like segments[1].
            const inLoginGroup = segments[segments.length - 1] === 'login';
            if (!inLoginGroup) {
                router.replace('/master/login');
            }
        }
    }, [isAuthorized, segments]);

    if (isAuthorized === null) {
        return (
            <View style={{ flex: 1, backgroundColor: masterTheme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={masterTheme.colors.primary} />
            </View>
        );
    }

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: masterTheme.colors.background },
                headerStyle: { backgroundColor: masterTheme.colors.surface },
                headerTintColor: masterTheme.colors.text,
            }}
        >
            <Stack.Screen name="index" options={{ title: 'Master Dashboard' }} />
            <Stack.Screen name="login" options={{ title: 'Master Login' }} />
        </Stack>
    );
}
