
import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button, Card } from '../../src/ui/components';
import { masterTheme } from '../../src/ui/masterTheme';
import { loginAdmin } from '../../src/api/adminApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MASTER_AUTH_KEY } from './_layout';

export default function MasterLoginScreen() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setError(null);
        if (!password.trim()) {
            setError('マスターパスワードを入力してください');
            return;
        }
        setLoading(true);

        try {
            const result = await loginAdmin(password);
            if (result.success && result.role === 'master') {
                // Store session
                // In a real app, store a token. Here we store the password as a "token" for simplicity in this demo stage,
                // specifically because our API doesn't issue a token yet, it just verifies password each time.
                // Ideally, we should implement JWT. For now, let's store the password securely (AsyncStorage isn't secure on Android without encryption, but okay for MVP).
                await AsyncStorage.setItem(MASTER_AUTH_KEY, password);
                router.replace('/master');
            } else {
                setError('無効なマスターパスワードです');
            }
        } catch (e) {
            setError('ログインエラーが発生しました');
        }
        setLoading(false);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.content}>
                <View style={styles.titleBlock}>
                    <AppText variant="h2" style={styles.title}>
                        Master Admin
                    </AppText>
                    <AppText variant="caption" style={styles.subtitle}>
                        システム管理者ログイン
                    </AppText>
                </View>

                <Card style={styles.card}>
                    <AppText variant="caption" style={styles.label}>Master Password</AppText>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Enter Master Password"
                        placeholderTextColor={masterTheme.colors.textSecondary}
                        secureTextEntry
                        keyboardType="default"
                        autoCapitalize="none"
                        onSubmitEditing={handleLogin}
                    />
                    {error ? (
                        <AppText variant="small" style={styles.errorText}>{error}</AppText>
                    ) : null}
                </Card>

                <Button
                    title={loading ? '認証中...' : 'Login as Master'}
                    onPress={handleLogin}
                    loading={loading}
                    disabled={loading}
                    style={styles.loginButton}
                    variant='primary' // Using primary to get white text, overriding bg below
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: masterTheme.colors.background,
    },
    content: {
        flex: 1,
        padding: masterTheme.spacing.lg,
        justifyContent: 'center',
        maxWidth: 400,
        alignSelf: 'center',
        width: '100%',
    },
    titleBlock: {
        marginBottom: masterTheme.spacing.xl,
        alignItems: 'center',
    },
    title: {
        color: masterTheme.colors.primary,
        marginBottom: masterTheme.spacing.xs,
        fontSize: 28,
        fontWeight: 'bold',
        letterSpacing: 2,
    },
    subtitle: {
        color: masterTheme.colors.textSecondary,
        fontSize: 14,
    },
    card: {
        backgroundColor: masterTheme.colors.surface,
        borderColor: masterTheme.colors.primary, // Red border for danger/master feel
        borderWidth: 1,
        borderRadius: masterTheme.radius.md,
        padding: masterTheme.spacing.lg,
        marginBottom: masterTheme.spacing.xl,
    },
    label: {
        color: masterTheme.colors.textSecondary,
        marginBottom: masterTheme.spacing.xs,
    },
    input: {
        borderWidth: 1,
        borderColor: masterTheme.colors.border,
        borderRadius: masterTheme.radius.sm,
        paddingHorizontal: masterTheme.spacing.md,
        paddingVertical: masterTheme.spacing.sm,
        fontSize: 16,
        color: masterTheme.colors.text,
        backgroundColor: '#000000',
        height: 48,
    },
    errorText: {
        color: masterTheme.colors.danger,
        marginTop: masterTheme.spacing.sm,
        textAlign: 'center',
    },
    loginButton: {
        backgroundColor: masterTheme.colors.primary,
        borderWidth: 0,
        height: 50,
    },
});
