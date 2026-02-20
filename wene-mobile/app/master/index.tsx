
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TextInput, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card } from '../../src/ui/components';
import { masterTheme } from '../../src/ui/masterTheme';
import { createInviteCode, revokeInviteCode, fetchMasterAuditLogs, MasterAuditLog, fetchInviteCodes } from '../../src/api/adminApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MASTER_AUTH_KEY } from './_layout';
import { useRouter } from 'expo-router';

export default function MasterDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'invites' | 'logging'>('invites');

    // Invite Codes State
    const [invites, setInvites] = useState<{ name: string; code: string; createdAt: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);

    // Audit Logs State
    const [auditLogs, setAuditLogs] = useState<MasterAuditLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    useEffect(() => {
        if (activeTab === 'logging') {
            loadAuditLogs();
        } else if (activeTab === 'invites') {
            loadInvites();
        }
    }, [activeTab]);

    const loadInvites = async () => {
        setLoading(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) return;
            const codes = await fetchInviteCodes(password);
            setInvites(codes);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const loadAuditLogs = async () => {
        setLoadingLogs(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) return;
            const logs = await fetchMasterAuditLogs(password);
            setAuditLogs(logs);
        } catch (e) {
            console.error(e);
        }
        setLoadingLogs(false);
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem(MASTER_AUTH_KEY);
        router.replace('/master/login');
    };

    const handleCreateCode = async () => {
        if (!newOrgName.trim()) {
            Alert.alert('Error', 'Please enter organization name');
            return;
        }
        setLoading(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) throw new Error('No session');

            const res = await createInviteCode(password, newOrgName);
            setGeneratedCode(res.code);
            // Refresh the list after generating
            loadInvites();
            setNewOrgName('');
            Alert.alert('Success', `Code created: ${res.code}`);
        } catch (e) {
            Alert.alert('Error', 'Failed to create code');
        }
        setLoading(false);
    };

    const handleRevoke = async (code: string) => {
        setLoading(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) throw new Error('No session');

            const success = await revokeInviteCode(password, code);
            if (success) {
                setInvites(prev => prev.filter(i => i.code !== code));
                Alert.alert('Success', 'Code revoked');
            } else {
                Alert.alert('Error', 'Failed to revoke code');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to revoke');
        }
        setLoading(false);
    };

    const renderInviteItem = ({ item }: { item: { name: string; code: string; createdAt: string } }) => (
        <Card style={styles.listItem}>
            <View style={styles.itemInfo}>
                <AppText style={styles.itemName}>{item.name}</AppText>
                <AppText style={styles.itemCode} selectable>{item.code}</AppText>
                <AppText style={styles.itemDate}>{new Date(item.createdAt).toLocaleString()}</AppText>
            </View>
            <Button
                title="Revoke"
                onPress={() => handleRevoke(item.code)}
                style={styles.revokeButton}
                variant='secondary'
                dark // Use dark mode for secondary button to match master theme
                size='medium'
            />
        </Card>
    );

    const renderAuditItem = ({ item }: { item: MasterAuditLog }) => (
        <View style={styles.auditRow}>
            <View style={styles.auditTimeCol}>
                <AppText style={styles.auditTime}>{new Date(item.ts).toLocaleTimeString()}</AppText>
                <AppText style={styles.auditDate}>{new Date(item.ts).toLocaleDateString()}</AppText>
            </View>
            <View style={styles.auditMainCol}>
                <View style={styles.auditHeader}>
                    <AppText style={styles.auditEvent}>{item.event}</AppText>
                    <AppText style={styles.auditActor}>{item.actor.type}:{item.actor.id}</AppText>
                </View>
                <View style={styles.hashContainer}>
                    <AppText style={styles.hashLabel}>Prev:</AppText>
                    <AppText style={styles.hashValue}>{item.prev_hash?.substring(0, 8)}...</AppText>
                    <AppText style={styles.hashArrow}>→</AppText>
                    <AppText style={styles.hashLabel}>Hash:</AppText>
                    <AppText style={styles.hashValue}>{item.entry_hash?.substring(0, 8)}...</AppText>
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <AppText variant="h3" style={styles.headerTitle}>Master Dashboard</AppText>
                <TouchableOpacity onPress={handleLogout}>
                    <AppText style={styles.logoutText}>Logout</AppText>
                </TouchableOpacity>
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'invites' && styles.activeTab]}
                    onPress={() => setActiveTab('invites')}
                >
                    <AppText style={[styles.tabText, activeTab === 'invites' && styles.activeTabText]}>Invite Codes</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'logging' && styles.activeTab]}
                    onPress={() => setActiveTab('logging')}
                >
                    <AppText style={[styles.tabText, activeTab === 'logging' && styles.activeTabText]}>Audit Logs</AppText>
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {activeTab === 'invites' ? (
                    <View style={{ flex: 1 }}>
                        <Card style={styles.createForm}>
                            <AppText style={styles.sectionTitle}>Issue New Code</AppText>
                            <TextInput
                                style={styles.input}
                                placeholder="Organization Name (e.g. School A)"
                                placeholderTextColor={masterTheme.colors.textSecondary}
                                value={newOrgName}
                                onChangeText={setNewOrgName}
                            />
                            <Button
                                title={loading ? 'Generating...' : 'Generate Code'}
                                onPress={handleCreateCode}
                                style={styles.generateButton}
                                variant='primary'
                                disabled={loading}
                            />
                            {generatedCode && (
                                <View style={styles.resultBox}>
                                    <AppText style={styles.resultLabel}>Generated Code:</AppText>
                                    <AppText style={styles.resultCode} selectable>{generatedCode}</AppText>
                                    <AppText style={styles.resultNote}>Copy this code and send it to the administrator.</AppText>
                                </View>
                            )}
                        </Card>

                        <AppText style={styles.listTitle}>Active Codes</AppText>
                        <FlatList
                            data={invites}
                            renderItem={renderInviteItem}
                            keyExtractor={item => item.code}
                            contentContainerStyle={{ paddingBottom: 100 }}
                            ListEmptyComponent={<AppText style={styles.emptyText}>No codes issued in this session.</AppText>}
                        />
                    </View>
                ) : (
                    <View style={styles.logContainer}>
                        <View style={styles.logHeader}>
                            <AppText style={styles.logTitle}>System Audit Trail</AppText>
                            <Button title="Refresh" onPress={loadAuditLogs} size="medium" variant="secondary" dark style={{ height: 32, minHeight: 0, paddingVertical: 4 }} />
                        </View>
                        <FlatList
                            data={auditLogs}
                            renderItem={renderAuditItem}
                            keyExtractor={item => item.entry_hash}
                            contentContainerStyle={{ paddingBottom: 100 }}
                            ListEmptyComponent={
                                loadingLogs ?
                                    <AppText style={styles.emptyText}>Loading logs from centralized ledger...</AppText> :
                                    <AppText style={styles.emptyText}>No audit logs found.</AppText>
                            }
                        />
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: masterTheme.colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: masterTheme.spacing.md,
        backgroundColor: masterTheme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: masterTheme.colors.border,
    },
    headerTitle: {
        color: masterTheme.colors.primary,
        fontWeight: 'bold',
    },
    logoutText: {
        color: masterTheme.colors.textSecondary,
        fontSize: 14,
    },
    tabs: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: masterTheme.colors.border,
    },
    tab: {
        flex: 1,
        paddingVertical: masterTheme.spacing.md,
        alignItems: 'center',
        backgroundColor: masterTheme.colors.surface,
    },
    activeTab: {
        borderBottomWidth: 2,
        borderBottomColor: masterTheme.colors.primary,
    },
    tabText: {
        color: masterTheme.colors.textSecondary,
        fontWeight: '600',
    },
    activeTabText: {
        color: masterTheme.colors.text,
    },
    content: {
        flex: 1,
        padding: masterTheme.spacing.md,
    },
    createForm: {
        backgroundColor: '#111',
        borderColor: masterTheme.colors.border,
        marginBottom: masterTheme.spacing.lg,
    },
    sectionTitle: {
        color: masterTheme.colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: masterTheme.spacing.md,
    },
    input: {
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: masterTheme.colors.border,
        color: '#fff',
        padding: masterTheme.spacing.md,
        borderRadius: masterTheme.radius.sm,
        marginBottom: masterTheme.spacing.md,
    },
    generateButton: {
        backgroundColor: masterTheme.colors.primary,
        borderWidth: 0,
        height: 40,
    },
    resultBox: {
        marginTop: masterTheme.spacing.md,
        padding: masterTheme.spacing.md,
        backgroundColor: '#220000',
        borderWidth: 1,
        borderColor: masterTheme.colors.primary,
        borderRadius: masterTheme.radius.sm,
    },
    resultLabel: {
        color: masterTheme.colors.primary,
        fontSize: 12,
        marginBottom: 4,
    },
    resultCode: {
        color: '#fff',
        fontSize: 20,
        fontFamily: 'monospace', // Ensure monospaced font if possible
        fontWeight: 'bold',
        marginBottom: 8,
    },
    resultNote: {
        color: masterTheme.colors.textSecondary,
        fontSize: 12,
    },
    listTitle: {
        color: masterTheme.colors.textSecondary,
        marginBottom: masterTheme.spacing.sm,
    },
    listItem: {
        backgroundColor: '#111',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: masterTheme.spacing.sm,
        padding: masterTheme.spacing.md,
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    itemCode: {
        color: masterTheme.colors.textSecondary,
        fontSize: 14,
        fontFamily: 'monospace',
        marginVertical: 4,
    },
    itemDate: {
        color: '#666',
        fontSize: 12,
    },
    revokeButton: {
        height: 36,
        width: 80,
        marginLeft: masterTheme.spacing.md,
        backgroundColor: '#330000',
        borderColor: '#660000',
    },
    emptyText: {
        color: '#666',
        textAlign: 'center',
        marginTop: 20,
    },
    // Audit Log Styles
    logContainer: {
        flex: 1,
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: masterTheme.spacing.md,
    },
    logTitle: {
        color: masterTheme.colors.textSecondary,
        fontSize: 16,
    },
    auditRow: {
        flexDirection: 'row',
        backgroundColor: '#111',
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    auditTimeCol: {
        width: 70,
        marginRight: 10,
        justifyContent: 'flex-start',
    },
    auditTime: {
        color: masterTheme.colors.text,
        fontSize: 12,
        fontWeight: 'bold',
    },
    auditDate: {
        color: '#666',
        fontSize: 10,
    },
    auditMainCol: {
        flex: 1,
    },
    auditHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    auditEvent: {
        color: masterTheme.colors.primary,
        fontWeight: 'bold',
        fontSize: 14,
    },
    auditActor: {
        color: '#888',
        fontSize: 12,
    },
    hashContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#000',
        padding: 4,
        borderRadius: 4,
        alignSelf: 'flex-start',
    },
    hashLabel: {
        color: '#555',
        fontSize: 10,
        marginRight: 4,
    },
    hashValue: {
        color: '#aaa',
        fontSize: 10,
        fontFamily: 'monospace',
    },
    hashArrow: {
        color: '#555',
        marginHorizontal: 6,
        fontSize: 10,
    },
});
