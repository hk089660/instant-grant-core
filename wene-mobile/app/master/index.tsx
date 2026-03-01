
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TextInput, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card } from '../../src/ui/components';
import { masterTheme } from '../../src/ui/masterTheme';
import {
    createInviteCode,
    revokeInviteCode,
    renameInviteCode,
    fetchMasterAuditLogs,
    fetchMasterTransferLogs,
    fetchMasterAdminDisclosures,
    fetchMasterSearchResults,
    InviteCodeRecord,
    MasterAdminDisclosure,
    MasterSearchResultItem,
    MasterAuditLog,
    TransferLogEntry,
    fetchInviteCodes,
} from '../../src/api/adminApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MASTER_AUTH_KEY } from './_layout';
import { useRouter } from 'expo-router';

export default function MasterDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'invites' | 'logging' | 'disclosure' | 'search'>('invites');

    // Invite Codes State
    const [invites, setInvites] = useState<InviteCodeRecord[]>([]);
    const [invitesLoading, setInvitesLoading] = useState(false);
    const [inviteActionLoading, setInviteActionLoading] = useState(false);
    const [newAdminName, setNewAdminName] = useState('');
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [renameCode, setRenameCode] = useState('');
    const [renameAdminId, setRenameAdminId] = useState('');
    const [renameName, setRenameName] = useState('');
    const [showInviteTools, setShowInviteTools] = useState(false);

    // Audit Logs State
    const [auditLogs, setAuditLogs] = useState<MasterAuditLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [transferLogs, setTransferLogs] = useState<TransferLogEntry[]>([]);
    const [transferError, setTransferError] = useState<string | null>(null);
    const [showPii, setShowPii] = useState(false);

    // Master Disclosure State
    const [adminDisclosures, setAdminDisclosures] = useState<MasterAdminDisclosure[]>([]);
    const [loadingDisclosures, setLoadingDisclosures] = useState(false);
    const [disclosureError, setDisclosureError] = useState<string | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<MasterSearchResultItem[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchTotal, setSearchTotal] = useState(0);
    const searchRequestSeq = useRef(0);

    useEffect(() => {
        if (activeTab === 'logging') {
            loadAuditLogs();
        } else if (activeTab === 'disclosure') {
            loadAdminDisclosures();
        } else if (activeTab === 'invites') {
            loadInvites();
        }
    }, [activeTab]);

    const isSessionExpiredError = (error: unknown): boolean => {
        const message = error instanceof Error ? error.message : String(error ?? '');
        return /unauthorized|401|session expired/i.test(message);
    };

    const handleSessionExpired = async (error: unknown, silent = false): Promise<boolean> => {
        if (!isSessionExpiredError(error)) return false;
        await AsyncStorage.removeItem(MASTER_AUTH_KEY);
        if (!silent) {
            Alert.alert('Session expired', 'Please login again.');
        }
        router.replace('/master/login');
        return true;
    };

    const loadInvites = async () => {
        setInvitesLoading(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) {
                setInvites([]);
                return;
            }
            const codes = await fetchInviteCodes(password, true);
            setInvites(codes);
        } catch (e) {
            console.error(e);
            setInvites([]);
            await handleSessionExpired(e, true);
        } finally {
            setInvitesLoading(false);
        }
    };

    const loadAuditLogs = async () => {
        setLoadingLogs(true);
        setTransferError(null);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) {
                setAuditLogs([]);
                setTransferLogs([]);
                return;
            }

            const [logsResult, transfersResult] = await Promise.allSettled([
                fetchMasterAuditLogs(password),
                fetchMasterTransferLogs(password, { limit: 50 }),
            ]);
            if (logsResult.status === 'fulfilled') {
                setAuditLogs(logsResult.value);
            } else {
                setAuditLogs([]);
            }

            if (transfersResult.status === 'fulfilled') {
                setTransferLogs(transfersResult.value.items || []);
            } else {
                setTransferLogs([]);
                setTransferError(transfersResult.reason instanceof Error ? transfersResult.reason.message : 'transfer logs fetch failed');
            }
        } catch (e) {
            console.error(e);
            await handleSessionExpired(e, true);
        } finally {
            setLoadingLogs(false);
        }
    };

    const loadAdminDisclosures = async () => {
        setLoadingDisclosures(true);
        setDisclosureError(null);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) {
                setAdminDisclosures([]);
                return;
            }
            const disclosure = await fetchMasterAdminDisclosures(password, {
                includeRevoked: true,
                transferLimit: 1000,
            });
            setAdminDisclosures(disclosure.admins || []);
        } catch (e) {
            console.error(e);
            if (await handleSessionExpired(e, true)) {
                setAdminDisclosures([]);
                setDisclosureError(null);
                return;
            }
            setDisclosureError(e instanceof Error ? e.message : 'failed to load disclosure');
            setAdminDisclosures([]);
        } finally {
            setLoadingDisclosures(false);
        }
    };

    const shorten = (value?: string | null, start = 8, end = 8) => {
        if (!value) return '-';
        if (value.length <= start + end + 3) return value;
        return `${value.slice(0, start)}...${value.slice(-end)}`;
    };

    const loadSearchResults = async (queryOverride?: string) => {
        const query = (queryOverride ?? searchQuery).trim();
        const requestId = searchRequestSeq.current + 1;
        searchRequestSeq.current = requestId;
        if (!query) {
            setSearchLoading(false);
            setSearchError(null);
            setSearchResults([]);
            setSearchTotal(0);
            return;
        }
        setSearchLoading(true);
        setSearchError(null);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) throw new Error('No session');
            const result = await fetchMasterSearchResults(password, {
                query,
                limit: 300,
                includeRevoked: true,
                transferLimit: 1000,
            });
            if (searchRequestSeq.current !== requestId) return;
            setSearchResults(result.items || []);
            setSearchTotal(result.total || 0);
        } catch (e) {
            if (searchRequestSeq.current !== requestId) return;
            console.error(e);
            if (await handleSessionExpired(e, true)) {
                setSearchError(null);
                setSearchResults([]);
                setSearchTotal(0);
                return;
            }
            setSearchError(e instanceof Error ? e.message : 'failed to search');
            setSearchResults([]);
            setSearchTotal(0);
        }
        if (searchRequestSeq.current === requestId) {
            setSearchLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab !== 'search') {
            searchRequestSeq.current += 1;
            setSearchLoading(false);
            return;
        }
        const query = searchQuery.trim();
        if (!query) {
            setSearchError(null);
            setSearchResults([]);
            setSearchTotal(0);
            setSearchLoading(false);
            return;
        }
        const timer = setTimeout(() => {
            void loadSearchResults(query);
        }, 250);
        return () => clearTimeout(timer);
    }, [activeTab, searchQuery]);

    const handleLogout = async () => {
        await AsyncStorage.removeItem(MASTER_AUTH_KEY);
        router.replace('/master/login');
    };

    const handleCreateCode = async () => {
        if (!newAdminName.trim()) {
            Alert.alert('Error', 'Please enter admin name');
            return;
        }
        setInviteActionLoading(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) {
                Alert.alert('Session expired', 'Please login again.');
                router.replace('/master/login');
                return;
            }

            const res = await createInviteCode(password, newAdminName);
            setNewAdminName('');
            if ('code' in res) {
                setGeneratedCode(res.code);
                Alert.alert('Success', `Code created: ${res.code}`);
            } else {
                setGeneratedCode(null);
                Alert.alert('Error', 'Unexpected response: invite issuance must be executed by master only.');
            }
            // Do not block button recovery on list refresh.
            void loadInvites();
            if (activeTab === 'disclosure') {
                void loadAdminDisclosures();
            }
        } catch (e) {
            if (await handleSessionExpired(e)) {
                return;
            }
            const message = e instanceof Error ? e.message : 'Failed to create code';
            Alert.alert('Error', message);
        } finally {
            setInviteActionLoading(false);
        }
    };

    const handleRevoke = async (code: string) => {
        setInviteActionLoading(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) {
                Alert.alert('Session expired', 'Please login again.');
                router.replace('/master/login');
                return;
            }

            const success = await revokeInviteCode(password, code);
            if (success) {
                Alert.alert('Success', 'Code revoked (status updated)');
                void loadInvites();
                if (activeTab === 'disclosure') {
                    void loadAdminDisclosures();
                }
            } else {
                Alert.alert('Error', 'Failed to revoke code');
            }
        } catch (e) {
            if (await handleSessionExpired(e)) {
                return;
            }
            const message = e instanceof Error ? e.message : 'Failed to revoke';
            Alert.alert('Error', message);
        } finally {
            setInviteActionLoading(false);
        }
    };

    const handleRename = async () => {
        const name = renameName.trim();
        const code = renameCode.trim();
        const adminId = renameAdminId.trim();
        if (!name) {
            Alert.alert('Error', 'Please enter new admin name');
            return;
        }
        if (!code && !adminId) {
            Alert.alert('Error', 'Please enter code or adminId');
            return;
        }
        setInviteActionLoading(true);
        try {
            const password = await AsyncStorage.getItem(MASTER_AUTH_KEY);
            if (!password) {
                Alert.alert('Session expired', 'Please login again.');
                router.replace('/master/login');
                return;
            }
            const renamed = await renameInviteCode(password, {
                name,
                ...(code ? { code } : {}),
                ...(adminId ? { adminId } : {}),
            });
            setRenameCode('');
            setRenameAdminId('');
            setRenameName('');
            Alert.alert('Success', `Renamed: ${renamed.name}`);
            void loadInvites();
            void loadAdminDisclosures();
        } catch (e) {
            if (await handleSessionExpired(e)) {
                return;
            }
            const message = e instanceof Error ? e.message : 'Failed to rename admin';
            Alert.alert('Error', message);
        } finally {
            setInviteActionLoading(false);
        }
    };

    const renderInviteItem = ({ item }: { item: InviteCodeRecord }) => (
        <Card style={styles.listItem}>
            <View style={styles.itemInfo}>
                <AppText style={styles.itemName}>{item.name} ({item.status})</AppText>
                <AppText style={styles.itemCode} selectable>{item.code}</AppText>
                <AppText style={styles.itemDate}>adminId: {item.adminId}</AppText>
                <AppText style={styles.itemDate}>{new Date(item.createdAt).toLocaleString()}</AppText>
                {item.revokedAt && (
                    <AppText style={styles.itemDate}>revoked: {new Date(item.revokedAt).toLocaleString()}</AppText>
                )}
            </View>
            <Button
                title={item.status === 'revoked' ? 'Revoked' : 'Revoke'}
                onPress={() => handleRevoke(item.code)}
                style={styles.revokeButton}
                variant='secondary'
                dark // Use dark mode for secondary button to match master theme
                size='medium'
                disabled={item.status === 'revoked' || inviteActionLoading}
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

    const renderDisclosureAdmin = ({ item }: { item: MasterAdminDisclosure }) => (
        <Card style={styles.disclosureCard}>
            <View style={styles.disclosureHeader}>
                <AppText style={styles.disclosureAdminName}>{item.name}</AppText>
                <AppText style={styles.disclosureAdminMeta}>{item.status}</AppText>
            </View>
            <AppText style={styles.disclosureAdminMeta}>adminId: {item.adminId}</AppText>
            <AppText style={styles.disclosureAdminMeta}>code: {item.code}</AppText>
            <AppText style={styles.disclosureAdminMeta}>created: {new Date(item.createdAt).toLocaleString()}</AppText>
            {item.revokedAt && (
                <AppText style={styles.disclosureAdminMeta}>revoked: {new Date(item.revokedAt).toLocaleString()}</AppText>
            )}
            <AppText style={styles.disclosureSectionTitle}>
                Related Events ({item.events.length}) / Transfers ({item.relatedTransferCount})
            </AppText>
            {item.events.length === 0 ? (
                <AppText style={styles.disclosureEmpty}>No linked events</AppText>
            ) : (
                item.events.map((event) => (
                    <View key={event.id} style={styles.disclosureRow}>
                        <AppText style={styles.disclosureRowText}>
                            {event.id} / {event.title} / {event.state} / claims:{event.claimedCount} / owner:{event.ownerSource}
                        </AppText>
                    </View>
                ))
            )}
            <AppText style={styles.disclosureSectionTitle}>
                Related Users ({item.relatedUsers.length})
            </AppText>
            {item.relatedUsers.length === 0 ? (
                <AppText style={styles.disclosureEmpty}>No related users</AppText>
            ) : (
                item.relatedUsers.map((user) => (
                    <View key={user.key} style={styles.disclosureUserBlock}>
                        <AppText style={styles.disclosureUserTitle}>
                            {user.displayName ?? '-'} / userId:{user.userId ?? '-'}
                        </AppText>
                        <AppText style={styles.disclosureUserMeta}>
                            wallet:{user.walletAddress ?? '-'} / joinToken:{user.joinToken ?? '-'}
                        </AppText>
                        <AppText style={styles.disclosureUserMeta}>
                            recipient:{user.recipientType}:{user.recipientId}
                        </AppText>
                        <AppText style={styles.disclosureUserMeta}>
                            eventIds: {user.eventIds.join(', ') || '-'}
                        </AppText>
                        {user.claims.map((claim, idx) => (
                            <View key={`${user.key}-${claim.eventId}-${idx}`} style={styles.disclosureClaimRow}>
                                <AppText style={styles.disclosureClaimText}>
                                    {new Date(claim.ts).toLocaleString()} / {claim.eventId} ({claim.eventTitle ?? '-'})
                                </AppText>
                                <AppText style={styles.disclosureClaimText}>
                                    transfer: {claim.transfer.sender.type}:{claim.transfer.sender.id} → {claim.transfer.recipient.type}:{claim.transfer.recipient.id}
                                </AppText>
                                <AppText style={styles.disclosureClaimText}>
                                    amount:{claim.transfer.amount ?? '-'} / mint:{shorten(claim.transfer.mint)}
                                </AppText>
                            </View>
                        ))}
                    </View>
                ))
            )}
        </Card>
    );

    const renderSearchItem = ({ item }: { item: MasterSearchResultItem }) => (
        <Card style={styles.searchResultCard}>
            <View style={styles.searchResultHeader}>
                <AppText style={styles.searchResultKind}>{item.kind.toUpperCase()}</AppText>
                <AppText style={styles.searchResultTitle}>{item.title}</AppText>
            </View>
            <AppText style={styles.searchResultSubtitle}>{item.subtitle}</AppText>
            <AppText style={styles.searchResultDetail}>{item.detail}</AppText>
        </Card>
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
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'disclosure' && styles.activeTab]}
                    onPress={() => setActiveTab('disclosure')}
                >
                    <AppText style={[styles.tabText, activeTab === 'disclosure' && styles.activeTabText]}>Admin Disclosure</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'search' && styles.activeTab]}
                    onPress={() => setActiveTab('search')}
                >
                    <AppText style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>Search</AppText>
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {activeTab === 'invites' ? (
                    <View style={styles.invitesTabContainer}>
                        <View style={styles.inviteListHeader}>
                            <AppText style={styles.listTitle}>Admin Codes (Active + Revoked)</AppText>
                            <Button
                                title={showInviteTools ? 'Hide Tools' : 'Show Tools'}
                                onPress={() => setShowInviteTools((prev) => !prev)}
                                variant="secondary"
                                dark
                                size="medium"
                                style={styles.inviteToolsToggleButton}
                            />
                        </View>

                        {showInviteTools && (
                            <View style={styles.inviteToolsPanel}>
                                <Card style={styles.createForm}>
                                    <AppText style={styles.sectionTitle}>Issue Admin Code</AppText>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Admin Name (e.g. Tokyo High Admin)"
                                        placeholderTextColor={masterTheme.colors.textSecondary}
                                        value={newAdminName}
                                        onChangeText={setNewAdminName}
                                    />
                                    <Button
                                        title={inviteActionLoading ? 'Generating...' : 'Generate Code'}
                                        onPress={handleCreateCode}
                                        style={styles.generateButton}
                                        variant='primary'
                                        disabled={inviteActionLoading}
                                    />
                                    {generatedCode && (
                                        <View style={styles.resultBox}>
                                            <AppText style={styles.resultLabel}>Generated Code:</AppText>
                                            <AppText style={styles.resultCode} selectable>{generatedCode}</AppText>
                                            <AppText style={styles.resultNote}>Copy this code and send it to this named administrator.</AppText>
                                        </View>
                                    )}
                                </Card>

                                <Card style={styles.renameForm}>
                                    <AppText style={styles.sectionTitle}>Rename Admin</AppText>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Code (optional if adminId is set)"
                                        placeholderTextColor={masterTheme.colors.textSecondary}
                                        value={renameCode}
                                        onChangeText={setRenameCode}
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Admin ID (optional if code is set)"
                                        placeholderTextColor={masterTheme.colors.textSecondary}
                                        value={renameAdminId}
                                        onChangeText={setRenameAdminId}
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="New admin name"
                                        placeholderTextColor={masterTheme.colors.textSecondary}
                                        value={renameName}
                                        onChangeText={setRenameName}
                                    />
                                    <Button
                                        title={inviteActionLoading ? 'Updating...' : 'Update Name'}
                                        onPress={handleRename}
                                        variant="secondary"
                                        dark
                                        size="medium"
                                        disabled={inviteActionLoading}
                                    />
                                </Card>
                            </View>
                        )}

                        <Card style={styles.invitePolicyCard}>
                            <AppText style={styles.invitePolicyTitle}>権限ポリシー</AppText>
                            <AppText style={styles.invitePolicyText}>
                                運営者コードの発行・承認・却下は master アカウントのみ実行できます。
                            </AppText>
                            <AppText style={styles.invitePolicyText}>
                                招待で追加された運営者アカウントは、運営者コードを発行できません。
                            </AppText>
                        </Card>

                        {invitesLoading && (
                            <AppText style={styles.emptyText}>Loading codes...</AppText>
                        )}
                        <FlatList
                            style={styles.inviteList}
                            data={invites}
                            renderItem={renderInviteItem}
                            keyExtractor={item => item.code}
                            contentContainerStyle={styles.inviteListContent}
                            ListEmptyComponent={
                                invitesLoading
                                    ? null
                                    : <AppText style={styles.emptyText}>No codes issued in this session.</AppText>
                            }
                        />
                    </View>
                ) : activeTab === 'logging' ? (
                    <View style={styles.logContainer}>
                        <View style={styles.logHeader}>
                            <AppText style={styles.logTitle}>System Audit Trail</AppText>
                            <Button title="Refresh" onPress={loadAuditLogs} size="medium" variant="secondary" dark style={{ height: 32, minHeight: 0, paddingVertical: 4 }} />
                        </View>
                        <Card style={styles.transferCard}>
                            <View style={styles.transferTitleRow}>
                                <AppText style={styles.transferTitle}>Transfer Logs (Master Full Access)</AppText>
                                <Button
                                    title={showPii ? 'Hide PII' : 'Show PII'}
                                    onPress={() => setShowPii(prev => !prev)}
                                    size="medium"
                                    variant="secondary"
                                    dark
                                    style={styles.piiToggleButton}
                                />
                            </View>
                            {transferError && (
                                <AppText style={styles.transferErrorText}>Transfer log error: {transferError}</AppText>
                            )}
                            {loadingLogs ? (
                                <AppText style={styles.emptyText}>Loading transfer logs...</AppText>
                            ) : transferLogs.length === 0 ? (
                                <AppText style={styles.emptyText}>No transfer logs found.</AppText>
                            ) : (
                                transferLogs.slice(0, 20).map((item) => (
                                    <View key={item.entryHash} style={styles.transferRow}>
                                        <AppText style={styles.transferEvent}>
                                            {item.event} / {new Date(item.ts).toLocaleString()}
                                        </AppText>
                                        <AppText style={styles.transferLine}>
                                            Sender: {item.transfer.sender.type}:{item.transfer.sender.id}
                                        </AppText>
                                        <AppText style={styles.transferLine}>
                                            Recipient: {item.transfer.recipient.type}:{item.transfer.recipient.id}
                                        </AppText>
                                        <AppText style={styles.transferLine}>
                                            Amount: {item.transfer.amount ?? '-'} / Mint: {shorten(item.transfer.mint)}
                                        </AppText>
                                        <AppText style={styles.transferHash}>
                                            tx={shorten(item.transfer.txSignature)} / receipt={shorten(item.transfer.receiptPubkey)}
                                        </AppText>
                                        <AppText style={styles.transferHash}>
                                            hash={shorten(item.prevHash)} → {shorten(item.entryHash)}
                                        </AppText>
                                        {item.pii && showPii && (
                                            <AppText style={styles.transferPii}>
                                                pii: {Object.entries(item.pii).map(([k, v]) => `${k}=${v}`).join(', ')}
                                            </AppText>
                                        )}
                                        {item.pii && !showPii && (
                                            <AppText style={styles.transferPiiHidden}>
                                                pii: hidden
                                            </AppText>
                                        )}
                                    </View>
                                ))
                            )}
                        </Card>
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
                ) : activeTab === 'disclosure' ? (
                    <View style={styles.logContainer}>
                        <View style={styles.logHeader}>
                            <AppText style={styles.logTitle}>Admin/User Full Disclosure</AppText>
                            <Button title="Refresh" onPress={loadAdminDisclosures} size="medium" variant="secondary" dark style={{ height: 32, minHeight: 0, paddingVertical: 4 }} />
                        </View>
                        {disclosureError && (
                            <AppText style={styles.transferErrorText}>Disclosure error: {disclosureError}</AppText>
                        )}
                        <FlatList
                            data={adminDisclosures}
                            renderItem={renderDisclosureAdmin}
                            keyExtractor={(item) => item.adminId}
                            contentContainerStyle={{ paddingBottom: 100 }}
                            ListEmptyComponent={
                                loadingDisclosures
                                    ? <AppText style={styles.emptyText}>Loading disclosure data...</AppText>
                                    : <AppText style={styles.emptyText}>No disclosure data found.</AppText>
                            }
                        />
                    </View>
                ) : (
                    <View style={styles.logContainer}>
                        <View style={styles.logHeader}>
                            <AppText style={styles.logTitle}>Search (Admin / User / Event / Claim)</AppText>
                            <Button title="Refresh Source" onPress={() => loadSearchResults(searchQuery.trim())} size="medium" variant="secondary" dark style={{ height: 32, minHeight: 0, paddingVertical: 4 }} />
                        </View>
                        <Card style={styles.searchCard}>
                            <TextInput
                                style={styles.input}
                                placeholder="Search by admin name, adminId, code, userId, displayName, wallet, eventId..."
                                placeholderTextColor={masterTheme.colors.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            <AppText style={styles.searchMeta}>
                                query="{searchQuery.trim() || '-'}" / results={searchResults.length}/{searchTotal}
                            </AppText>
                            {searchError && (
                                <AppText style={styles.transferErrorText}>Search error: {searchError}</AppText>
                            )}
                            {searchLoading && (
                                <AppText style={styles.emptyText}>Searching indexed source...</AppText>
                            )}
                        </Card>
                        <FlatList
                            data={searchResults}
                            renderItem={renderSearchItem}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ paddingBottom: 100 }}
                            ListEmptyComponent={
                                searchLoading
                                    ? <AppText style={styles.emptyText}>Searching...</AppText>
                                    : searchQuery.trim()
                                    ? <AppText style={styles.emptyText}>No matches found.</AppText>
                                    : <AppText style={styles.emptyText}>Enter a search query.</AppText>
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
    invitesTabContainer: {
        flex: 1,
    },
    inviteListHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: masterTheme.spacing.sm,
        gap: masterTheme.spacing.sm,
    },
    inviteToolsToggleButton: {
        minWidth: 116,
        height: 36,
    },
    inviteToolsPanel: {
        marginBottom: masterTheme.spacing.md,
    },
    invitePolicyCard: {
        backgroundColor: '#111',
        borderColor: masterTheme.colors.border,
        marginBottom: masterTheme.spacing.md,
    },
    invitePolicyTitle: {
        color: masterTheme.colors.text,
        fontSize: 16,
        fontWeight: '700',
        marginBottom: masterTheme.spacing.xs,
    },
    invitePolicyText: {
        color: masterTheme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 20,
        marginTop: 2,
    },
    inviteList: {
        flex: 1,
    },
    createForm: {
        backgroundColor: '#111',
        borderColor: masterTheme.colors.border,
        marginBottom: masterTheme.spacing.lg,
    },
    renameForm: {
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
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
    },
    inviteListContent: {
        paddingBottom: 120,
    },
    listItem: {
        backgroundColor: '#111',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: masterTheme.spacing.md,
        paddingVertical: masterTheme.spacing.lg,
        paddingHorizontal: masterTheme.spacing.lg,
        minHeight: 118,
    },
    itemInfo: {
        flex: 1,
        paddingRight: masterTheme.spacing.md,
    },
    itemName: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    itemCode: {
        color: masterTheme.colors.textSecondary,
        fontSize: 16,
        fontFamily: 'monospace',
        marginVertical: 6,
    },
    itemDate: {
        color: '#666',
        fontSize: 13,
        lineHeight: 18,
    },
    revokeButton: {
        height: 42,
        width: 96,
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
    transferCard: {
        backgroundColor: '#111',
        borderColor: masterTheme.colors.border,
        marginBottom: masterTheme.spacing.md,
    },
    transferTitle: {
        color: masterTheme.colors.primary,
        fontWeight: 'bold',
    },
    transferTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: masterTheme.spacing.sm,
    },
    piiToggleButton: {
        minHeight: 0,
        height: 30,
        paddingVertical: 4,
    },
    transferRow: {
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        paddingVertical: 8,
    },
    transferEvent: {
        color: '#fff',
        fontSize: 12,
        marginBottom: 2,
    },
    transferLine: {
        color: masterTheme.colors.textSecondary,
        fontSize: 11,
    },
    transferHash: {
        color: '#888',
        fontFamily: 'monospace',
        fontSize: 10,
    },
    transferPii: {
        color: '#ffb3b3',
        fontSize: 11,
        marginTop: 2,
    },
    transferPiiHidden: {
        color: '#666',
        fontSize: 11,
        marginTop: 2,
    },
    transferErrorText: {
        color: '#ff8a80',
        fontSize: 12,
        marginBottom: 8,
    },
    disclosureCard: {
        backgroundColor: '#111',
        borderColor: masterTheme.colors.border,
        marginBottom: masterTheme.spacing.md,
    },
    disclosureHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    disclosureAdminName: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    disclosureAdminMeta: {
        color: masterTheme.colors.textSecondary,
        fontSize: 12,
        marginTop: 2,
    },
    disclosureSectionTitle: {
        color: masterTheme.colors.primary,
        fontSize: 12,
        marginTop: 10,
        marginBottom: 4,
    },
    disclosureEmpty: {
        color: '#666',
        fontSize: 12,
    },
    disclosureRow: {
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        paddingVertical: 4,
    },
    disclosureRowText: {
        color: '#aaa',
        fontSize: 11,
    },
    disclosureUserBlock: {
        borderWidth: 1,
        borderColor: '#222',
        borderRadius: 6,
        padding: 8,
        marginBottom: 8,
    },
    disclosureUserTitle: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    disclosureUserMeta: {
        color: '#999',
        fontSize: 11,
        marginTop: 2,
    },
    disclosureClaimRow: {
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#222',
    },
    disclosureClaimText: {
        color: '#bbb',
        fontSize: 10,
        fontFamily: 'monospace',
    },
    searchCard: {
        backgroundColor: '#111',
        borderColor: masterTheme.colors.border,
        marginBottom: masterTheme.spacing.md,
    },
    searchMeta: {
        color: '#888',
        fontSize: 11,
        marginTop: -4,
    },
    searchResultCard: {
        backgroundColor: '#111',
        borderColor: masterTheme.colors.border,
        marginBottom: masterTheme.spacing.sm,
    },
    searchResultHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    searchResultKind: {
        color: masterTheme.colors.primary,
        fontSize: 10,
        fontWeight: '700',
        marginRight: 8,
    },
    searchResultTitle: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        flexShrink: 1,
    },
    searchResultSubtitle: {
        color: '#aaa',
        fontSize: 11,
    },
    searchResultDetail: {
        color: '#777',
        fontSize: 10,
        marginTop: 2,
        fontFamily: 'monospace',
    },
});
