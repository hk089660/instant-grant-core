/**
 * Admin: イベント参加券 発行画面
 * フォーム入力 → API で作成 → QR コード表示
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, TextInput, ScrollView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as QRCode from 'qrcode';
import { AppText, Button, Card } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { httpPost } from '../../api/http/httpClient';
import type { SchoolEvent } from '../../types/school';
import { useRecipientStore } from '../../store/recipientStore';
import { usePhantomStore } from '../../store/phantomStore';
import { initiatePhantomConnect } from '../../utils/phantom';
import { setPhantomWebReturnPath } from '../../utils/phantomWebReturnPath';
import * as nacl from 'tweetnacl';
import { issueEventTicketToken } from '../../solana/adminTicketIssuer';

function getAdminBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    const envBase = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
    if (envBase) return envBase;
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for native builds');
}

type Step = 'form' | 'preview' | 'done';

export const AdminCreateEventScreen: React.FC = () => {
    const router = useRouter();
    const [step, setStep] = useState<Step>('form');
    const walletPubkey = useRecipientStore((s) => s.walletPubkey);
    const phantomSession = useRecipientStore((s) => s.phantomSession);
    const dappEncryptionPublicKey = usePhantomStore((s) => s.dappEncryptionPublicKey);
    const dappSecretKey = usePhantomStore((s) => s.dappSecretKey);
    const phantomEncryptionPublicKey = usePhantomStore((s) => s.phantomEncryptionPublicKey);
    const saveKeyPair = usePhantomStore((s) => s.saveKeyPair);

    // フォーム状態
    const [title, setTitle] = useState('');
    const [datetime, setDatetime] = useState('');
    const [host, setHost] = useState('');
    const [ticketTokenAmountInput, setTicketTokenAmountInput] = useState('1');
    const [claimIntervalDaysInput, setClaimIntervalDaysInput] = useState('30');
    const [maxClaimsPerIntervalInput, setMaxClaimsPerIntervalInput] = useState('1'); // 空欄で無制限
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [setupTxSignatures, setSetupTxSignatures] = useState<string[]>([]);

    // 作成結果
    const [createdEvent, setCreatedEvent] = useState<SchoolEvent | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

    const baseUrl = useMemo(() => {
        const envBase = (process.env.EXPO_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
        if (envBase) return envBase;
        if (typeof window !== 'undefined') return window.location.origin;
        return '';
    }, []);

    const walletReady = Boolean(
        walletPubkey &&
        phantomSession &&
        dappEncryptionPublicKey &&
        dappSecretKey &&
        phantomEncryptionPublicKey
    );
    const ticketTokenAmount = Number.parseInt(ticketTokenAmountInput, 10);
    const claimIntervalDays = Number.parseInt(claimIntervalDaysInput, 10);
    const unlimitedClaims = maxClaimsPerIntervalInput.trim() === '';
    const parsedMaxClaimsPerInterval = Number.parseInt(maxClaimsPerIntervalInput, 10);
    const maxClaimsPerInterval = unlimitedClaims ? null : parsedMaxClaimsPerInterval;
    const maxClaimsValid =
        unlimitedClaims ||
        (Number.isInteger(parsedMaxClaimsPerInterval) && parsedMaxClaimsPerInterval > 0);
    const canSubmit =
        title.trim().length > 0 &&
        datetime.trim().length > 0 &&
        host.trim().length > 0 &&
        Number.isInteger(ticketTokenAmount) &&
        ticketTokenAmount > 0 &&
        Number.isInteger(claimIntervalDays) &&
        claimIntervalDays > 0 &&
        maxClaimsValid &&
        walletReady;

    const handlePreview = useCallback(() => {
        if (!canSubmit) return;
        setStep('preview');
    }, [canSubmit]);

    const handleConnectWallet = useCallback(async () => {
        try {
            setError(null);
            const keyPair = nacl.box.keyPair();
            await saveKeyPair(keyPair);

            const dappEncryptionPk = Buffer.from(keyPair.publicKey).toString('base64');
            const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.location?.origin;
            const appUrl = isWeb ? window.location.origin : 'https://wene.app';
            const redirectLink = isWeb
                ? `${window.location.origin}/phantom-callback`
                : 'wene://phantom/connect';

            if (isWeb) {
                const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                setPhantomWebReturnPath(returnPath);
            }

            await initiatePhantomConnect(
                dappEncryptionPk,
                keyPair.secretKey,
                redirectLink,
                'devnet',
                appUrl
            );
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'ウォレット接続に失敗しました';
            setError(msg);
        }
    }, [saveKeyPair]);

    const handleCreate = useCallback(async () => {
        setLoading(true);
        setError(null);
        setSetupTxSignatures([]);
        try {
            const apiBase = getAdminBaseUrl();
            if (!walletPubkey || !phantomSession || !dappEncryptionPublicKey || !dappSecretKey || !phantomEncryptionPublicKey) {
                throw new Error('Phantomウォレットを接続してください。');
            }
            if (!Number.isInteger(ticketTokenAmount) || ticketTokenAmount <= 0) {
                throw new Error('発行量は1以上の整数で指定してください。');
            }
            if (!Number.isInteger(claimIntervalDays) || claimIntervalDays <= 0) {
                throw new Error('受給間隔（日）は1以上の整数で指定してください。');
            }
            if (!maxClaimsValid) {
                throw new Error('上限回数は空欄（無制限）または1以上の整数で指定してください。');
            }

            const onchain = await issueEventTicketToken({
                phantom: {
                    walletPubkey,
                    phantomSession,
                    dappEncryptionPublicKey,
                    dappSecretKey,
                    phantomEncryptionPublicKey,
                },
                eventTitle: title.trim(),
                ticketTokenAmount,
                claimIntervalDays,
                maxClaimsPerInterval,
            });
            setSetupTxSignatures(onchain.setupSignatures);

            const event = await httpPost<SchoolEvent>(`${apiBase}/v1/school/events`, {
                title: title.trim(),
                datetime: datetime.trim(),
                host: host.trim(),
                state: 'published',
                solanaMint: onchain.solanaMint,
                solanaAuthority: onchain.solanaAuthority,
                solanaGrantId: onchain.solanaGrantId,
                ticketTokenAmount,
                claimIntervalDays,
                maxClaimsPerInterval,
            });
            setCreatedEvent(event);
            setStep('done');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'イベントの作成に失敗しました';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [
        title,
        datetime,
        host,
        walletPubkey,
        phantomSession,
        dappEncryptionPublicKey,
        dappSecretKey,
        phantomEncryptionPublicKey,
        ticketTokenAmount,
        claimIntervalDays,
        maxClaimsPerInterval,
        maxClaimsValid,
    ]);

    // QR生成
    const scanUrl = useMemo(() => {
        if (!createdEvent || !baseUrl) return '';
        return `${baseUrl}/u/scan?eventId=${encodeURIComponent(createdEvent.id)}`;
    }, [createdEvent, baseUrl]);

    useEffect(() => {
        if (Platform.OS !== 'web' || !scanUrl) {
            setQrDataUrl(null);
            return;
        }
        QRCode.toDataURL(scanUrl, { width: 300, margin: 2 })
            .then((url: string) => setQrDataUrl(url))
            .catch(() => setQrDataUrl(null));
    }, [scanUrl]);

    const handlePrint = () => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.print();
        }
    };

    const handleReset = () => {
        setStep('form');
        setTitle('');
        setDatetime('');
        setHost('');
        setTicketTokenAmountInput('1');
        setClaimIntervalDaysInput('30');
        setMaxClaimsPerIntervalInput('1');
        setCreatedEvent(null);
        setQrDataUrl(null);
        setError(null);
        setSetupTxSignatures([]);
    };

    // --- 印刷用CSS ---
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;
        const styleId = 'admin-create-print-style';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 16mm; }
        body { background: #ffffff !important; }
        [data-no-print] { display: none !important; }
      }
    `;
        document.head.appendChild(style);
    }, []);

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* ヘッダー */}
                <View style={styles.header} {...({ 'data-no-print': 'true' } as any)}>
                    <AppText variant="h2" style={styles.headerTitle}>
                        参加券を発行
                    </AppText>
                    <Button
                        title="← イベント一覧"
                        variant="secondary"
                        dark
                        onPress={() => router.push('/admin' as any)}
                        style={styles.backButton}
                    />
                </View>

                {step === 'form' && (
                    <Card style={styles.card}>
                        <AppText variant="h3" style={styles.cardTitle}>
                            新規イベント情報
                        </AppText>
                        <AppText variant="caption" style={styles.label}>管理者ウォレット</AppText>
                        <View style={styles.walletRow}>
                            <AppText variant="small" style={styles.walletStatus}>
                                {walletReady && walletPubkey
                                    ? `接続済み: ${walletPubkey.slice(0, 8)}...${walletPubkey.slice(-8)}`
                                    : '未接続'}
                            </AppText>
                            <Button
                                title={walletReady ? '再接続' : 'Phantom接続'}
                                variant="secondary"
                                dark
                                onPress={handleConnectWallet}
                                style={styles.walletButton}
                            />
                        </View>
                        <AppText variant="small" style={styles.walletNote}>
                            発行ごとに新規SPLトークンを作成するため、Phantom署名が必要です。
                        </AppText>

                        <AppText variant="caption" style={styles.label}>タイトル</AppText>
                        <TextInput
                            style={styles.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="例: 地域清掃ボランティア"
                            placeholderTextColor={adminTheme.colors.textTertiary}
                            maxLength={60}
                        />

                        <AppText variant="caption" style={styles.label}>日時</AppText>
                        <TextInput
                            style={styles.input}
                            value={datetime}
                            onChangeText={setDatetime}
                            placeholder="例: 2026/03/01 09:00-10:30"
                            placeholderTextColor={adminTheme.colors.textTertiary}
                            maxLength={40}
                        />

                        <AppText variant="caption" style={styles.label}>主催</AppText>
                        <TextInput
                            style={styles.input}
                            value={host}
                            onChangeText={setHost}
                            placeholder="例: 生徒会"
                            placeholderTextColor={adminTheme.colors.textTertiary}
                            maxLength={40}
                        />

                        <AppText variant="caption" style={styles.label}>参加券の配布量（SPL最小単位）</AppText>
                        <TextInput
                            style={styles.input}
                            value={ticketTokenAmountInput}
                            onChangeText={(t) => setTicketTokenAmountInput(t.replace(/[^\d]/g, ''))}
                            placeholder="例: 1"
                            placeholderTextColor={adminTheme.colors.textTertiary}
                            keyboardType="number-pad"
                            maxLength={9}
                        />

                        <AppText variant="caption" style={styles.label}>受給間隔（日）</AppText>
                        <TextInput
                            style={styles.input}
                            value={claimIntervalDaysInput}
                            onChangeText={(t) => setClaimIntervalDaysInput(t.replace(/[^\d]/g, ''))}
                            placeholder="例: 30"
                            placeholderTextColor={adminTheme.colors.textTertiary}
                            keyboardType="number-pad"
                            maxLength={4}
                        />

                        <AppText variant="caption" style={styles.label}>期間内の上限回数（空欄で無制限）</AppText>
                        <TextInput
                            style={styles.input}
                            value={maxClaimsPerIntervalInput}
                            onChangeText={(t) => setMaxClaimsPerIntervalInput(t.replace(/[^\d]/g, ''))}
                            placeholder="例: 1（空欄で無制限）"
                            placeholderTextColor={adminTheme.colors.textTertiary}
                            keyboardType="number-pad"
                            maxLength={4}
                        />

                        {error ? (
                            <AppText variant="caption" style={styles.errorText}>{error}</AppText>
                        ) : null}

                        <Button
                            title="プレビュー →"
                            onPress={handlePreview}
                            disabled={!canSubmit}
                            style={styles.actionButton}
                        />
                    </Card>
                )}

                {step === 'preview' && (
                    <Card style={styles.card}>
                        <AppText variant="h3" style={styles.cardTitle}>
                            確認
                        </AppText>
                        <View style={styles.previewRow}>
                            <AppText variant="caption" style={styles.previewLabel}>タイトル</AppText>
                            <AppText variant="body" style={styles.previewValue}>{title}</AppText>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.previewRow}>
                            <AppText variant="caption" style={styles.previewLabel}>日時</AppText>
                            <AppText variant="body" style={styles.previewValue}>{datetime}</AppText>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.previewRow}>
                            <AppText variant="caption" style={styles.previewLabel}>主催</AppText>
                            <AppText variant="body" style={styles.previewValue}>{host}</AppText>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.previewRow}>
                            <AppText variant="caption" style={styles.previewLabel}>配布量</AppText>
                            <AppText variant="body" style={styles.previewValue}>{ticketTokenAmountInput || '0'}</AppText>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.previewRow}>
                            <AppText variant="caption" style={styles.previewLabel}>受給ルール</AppText>
                            <AppText variant="body" style={styles.previewValue}>
                                {claimIntervalDaysInput || '0'}日ごと / {unlimitedClaims ? '無制限' : `${maxClaimsPerIntervalInput || '0'}回まで`}
                            </AppText>
                        </View>

                        {error ? (
                            <AppText variant="caption" style={styles.errorText}>{error}</AppText>
                        ) : null}

                        <View style={styles.buttonRow}>
                            <Button
                                title="← 戻る"
                                variant="secondary"
                                dark
                                onPress={() => { setStep('form'); setError(null); }}
                                style={styles.halfButton}
                            />
                            <Button
                                title={loading ? '発行中…' : '発行する'}
                                onPress={handleCreate}
                                loading={loading}
                                disabled={loading}
                                style={styles.halfButton}
                            />
                        </View>
                    </Card>
                )}

                {step === 'done' && createdEvent && (
                    <>
                        <Card style={styles.card}>
                            <View style={styles.successBadge}>
                                <AppText variant="caption" style={styles.successText}>✓ 発行完了</AppText>
                            </View>
                            <AppText variant="h3" style={styles.cardTitle}>
                                {createdEvent.title}
                            </AppText>
                            <AppText variant="caption" style={styles.cardSub}>
                                {createdEvent.datetime}
                            </AppText>
                            <AppText variant="caption" style={styles.cardSub}>
                                主催: {createdEvent.host}
                            </AppText>
                            <AppText variant="small" style={styles.cardMuted}>
                                ID: {createdEvent.id}
                            </AppText>
                            {createdEvent.solanaMint && (
                                <AppText variant="small" style={styles.cardMuted}>
                                    Token Mint: {createdEvent.solanaMint}
                                </AppText>
                            )}
                            <AppText variant="small" style={styles.cardMuted}>
                                Token Name: {createdEvent.title}
                            </AppText>
                            {createdEvent.solanaGrantId && (
                                <AppText variant="small" style={styles.cardMuted}>
                                    Grant ID: {createdEvent.solanaGrantId}
                                </AppText>
                            )}
                            {typeof createdEvent.ticketTokenAmount === 'number' && (
                                <AppText variant="small" style={styles.cardMuted}>
                                    配布量: {createdEvent.ticketTokenAmount}
                                </AppText>
                            )}
                            <AppText variant="small" style={styles.cardMuted}>
                                受給ルール: {(createdEvent.claimIntervalDays ?? 30)}日ごと / {createdEvent.maxClaimsPerInterval == null ? '無制限' : `${createdEvent.maxClaimsPerInterval}回まで`}
                            </AppText>
                            {setupTxSignatures.length > 0 && (
                                <AppText variant="small" style={styles.cardMuted}>
                                    Setup Tx: {setupTxSignatures.map((sig) => sig.slice(0, 8)).join(', ')}...
                                </AppText>
                            )}

                            <View style={styles.qrBox}>
                                {qrDataUrl ? (
                                    Platform.OS === 'web' ? (
                                        // @ts-ignore - web only
                                        <img src={qrDataUrl} alt="QR Code" style={{ width: 280, height: 280 }} />
                                    ) : (
                                        <Image source={{ uri: qrDataUrl }} style={styles.qrImage} />
                                    )
                                ) : (
                                    <AppText variant="caption" style={styles.cardMuted}>
                                        QR生成中...
                                    </AppText>
                                )}
                            </View>

                            {scanUrl ? (
                                <AppText variant="small" style={styles.qrUrl} selectable>
                                    {scanUrl}
                                </AppText>
                            ) : null}

                            <AppText variant="small" style={styles.cardMuted}>
                                このQRを印刷して受付に掲示してください
                            </AppText>
                        </Card>

                        <View style={styles.buttonRow} {...({ 'data-no-print': 'true' } as any)}>
                            <Button
                                title="印刷する"
                                variant="secondary"
                                dark
                                onPress={handlePrint}
                                style={styles.halfButton}
                            />
                            <Button
                                title="もう1つ作る"
                                onPress={handleReset}
                                style={styles.halfButton}
                            />
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminTheme.colors.background,
    },
    scrollContent: {
        padding: adminTheme.spacing.lg,
        paddingBottom: 80,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: adminTheme.spacing.lg,
    },
    headerTitle: {
        color: adminTheme.colors.text,
    },
    backButton: {
        borderColor: adminTheme.colors.border,
    },
    card: {
        backgroundColor: adminTheme.colors.surface,
        borderColor: adminTheme.colors.border,
        borderWidth: 1,
        borderRadius: adminTheme.radius.md,
        padding: adminTheme.spacing.lg,
        marginBottom: adminTheme.spacing.lg,
    },
    cardTitle: {
        color: adminTheme.colors.text,
        marginBottom: adminTheme.spacing.md,
    },
    cardSub: {
        color: adminTheme.colors.textSecondary,
        marginBottom: adminTheme.spacing.xs,
    },
    cardMuted: {
        color: adminTheme.colors.textTertiary,
        marginTop: adminTheme.spacing.sm,
    },
    label: {
        color: adminTheme.colors.textSecondary,
        marginBottom: adminTheme.spacing.xs,
        marginTop: adminTheme.spacing.sm,
    },
    walletRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: adminTheme.spacing.sm,
        marginBottom: adminTheme.spacing.xs,
    },
    walletStatus: {
        color: adminTheme.colors.textSecondary,
        flex: 1,
    },
    walletButton: {
        minWidth: 120,
    },
    walletNote: {
        color: adminTheme.colors.textTertiary,
        marginBottom: adminTheme.spacing.sm,
    },
    input: {
        borderWidth: 1,
        borderColor: adminTheme.colors.border,
        borderRadius: adminTheme.radius.sm,
        paddingHorizontal: adminTheme.spacing.md,
        paddingVertical: adminTheme.spacing.sm,
        fontSize: 16,
        color: adminTheme.colors.text,
        backgroundColor: adminTheme.colors.background,
        marginBottom: adminTheme.spacing.xs,
    },
    actionButton: {
        marginTop: adminTheme.spacing.lg,
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: adminTheme.colors.border,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: adminTheme.spacing.md,
        marginTop: adminTheme.spacing.md,
    },
    halfButton: {
        flex: 1,
    },
    errorText: {
        color: '#ff6b6b',
        marginTop: adminTheme.spacing.sm,
    },
    previewRow: {
        paddingVertical: adminTheme.spacing.sm,
    },
    previewLabel: {
        color: adminTheme.colors.textTertiary,
        marginBottom: adminTheme.spacing.xs,
    },
    previewValue: {
        color: adminTheme.colors.text,
    },
    divider: {
        height: 1,
        backgroundColor: adminTheme.colors.border,
    },
    successBadge: {
        backgroundColor: 'rgba(0, 200, 83, 0.15)',
        paddingHorizontal: adminTheme.spacing.md,
        paddingVertical: adminTheme.spacing.xs,
        borderRadius: 999,
        alignSelf: 'flex-start',
        marginBottom: adminTheme.spacing.md,
    },
    successText: {
        color: '#00c853',
        fontWeight: '700',
    },
    qrBox: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: adminTheme.spacing.lg,
        padding: adminTheme.spacing.md,
        backgroundColor: '#ffffff',
        borderRadius: adminTheme.radius.md,
        minHeight: 300,
    },
    qrImage: {
        width: 280,
        height: 280,
    },
    qrUrl: {
        color: adminTheme.colors.textTertiary,
        marginTop: adminTheme.spacing.sm,
        fontSize: 10,
        textAlign: 'center',
    },
});
