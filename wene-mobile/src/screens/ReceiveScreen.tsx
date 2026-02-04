import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform, ToastAndroid, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { useRecipientStore } from '../store/recipientStore';
import { usePhantomStore } from '../store/phantomStore';
import { getGrantByCampaignId } from '../api/getGrant';
import type { Grant } from '../types/grant';
// --- changed ---

import { AppText, BalanceList, BALANCE_LIST_DUMMY, Button, Card, Pill } from '../ui/components';
import type { BalanceItem } from '../types/balance';
import { theme } from '../ui/theme';
import { sortBalances } from '../utils/balance';
import { buildClaimTx } from '../solana/txBuilders';
import { signTransaction, initiatePhantomConnect, buildPhantomConnectUrl } from '../utils/phantom';
import { rejectPendingSignTx } from '../utils/phantomSignTxPending';
import { getLastPhantomDebug } from '../utils/phantomUrlDebug';
import { sendSignedTx, isBlockhashExpiredError, isSimulationFailedError } from '../solana/sendTx';
import { getConnection } from '../solana/singleton';
import { RPC_URL } from '../solana/singleton';
import { fetchSplBalance, fetchAnyPositiveSplBalance, formatAmountForDisplay, SPL_USDC_MINT } from '../solana/wallet';

export const ReceiveScreen: React.FC = () => {
  const { campaignId, code } = useLocalSearchParams<{
    campaignId: string;
    code?: string;
  }>();
  const router = useRouter();
  
  const {
    state,
    lastError,
    isClaimed,
    walletPubkey,
    phantomSession,
    lastSignature,
    lastDoneAt,
    setCampaign,
    setState,
    setError,
    clearError,
    setLastSignature,
    setLastDoneAt,
    rpcEndpoint,
    balanceLamports,
    simulationErr,
    simulationLogs,
    simulationUnitsConsumed,
    setPreSendDebug,
    setSimulationFailed,
    clearSimulationResult,
    checkClaimed,
    markAsClaimed,
  } = useRecipientStore();
  const {
    dappEncryptionPublicKey,
    dappSecretKey,
    phantomEncryptionPublicKey,
    loadKeyPair,
    getOrCreateKeyPair,
    saveKeyPair,
    clearConnectResult,
    clearPhantomKeys,
  } = usePhantomStore();
  const [showDetails, setShowDetails] = useState(false);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [grantNotFound, setGrantNotFound] = useState(false);
  const [grantLoading, setGrantLoading] = useState(true);
  const [txDebugInfo, setTxDebugInfo] = useState<string | null>(null);
  const [phantomUrlDebug, setPhantomUrlDebug] = useState<ReturnType<typeof getLastPhantomDebug> | null>(null);
  const [signedTxSize, setSignedTxSize] = useState<number | null>(null); // DEV: 署名済みTxサイズ
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [balanceItems, setBalanceItems] = useState<BalanceItem[]>(() => sortBalances(BALANCE_LIST_DUMMY));
  const [splBalanceItem, setSplBalanceItem] = useState<BalanceItem | null>(null);

  useEffect(() => {
    if (campaignId) {
      setCampaign(campaignId, code);
      checkClaimed(campaignId, walletPubkey);
    }
  }, [campaignId, code, walletPubkey, setCampaign, checkClaimed]);

  useEffect(() => {
    const init = async () => {
      try {
        const kp = await loadKeyPair();
        if (!kp) {
          const created = getOrCreateKeyPair();
          await saveKeyPair(created);
        }
      } catch (error) {
        console.warn('Keypair init error:', error);
      }
    };
    init();
  }, [loadKeyPair, getOrCreateKeyPair, saveKeyPair]);

  // ウォレット接続時のみ SPL 残高を1件取得し、残高一覧にマージ・ソート（TODO/0/ATA無し時はフォールバック）
  useEffect(() => {
    if (!walletPubkey || !phantomSession) {
      setSplBalanceItem(null);
      setBalanceItems(sortBalances(BALANCE_LIST_DUMMY));
      return;
    }
    let cancelled = false;
    const connection = getConnection();
    const ownerPubkey = new PublicKey(walletPubkey);

    const loadingRow: BalanceItem = {
      id: "spl-1",
      name: "SPLトークン",
      issuer: "Solana (devnet)",
      amountText: "…",
      unit: "SPL",
      source: "spl",
      todayUsable: true,
    };
    setSplBalanceItem(loadingRow);
    setBalanceItems(sortBalances([...BALANCE_LIST_DUMMY, loadingRow]));

    const applySplRow = (item: BalanceItem) => {
      if (cancelled) return;
      setSplBalanceItem(item);
      setBalanceItems(sortBalances([...BALANCE_LIST_DUMMY, item]));
    };

    const isMintValid = !SPL_USDC_MINT.startsWith("TODO") && SPL_USDC_MINT.length >= 32;

    if (!isMintValid) {
      // TODO/無効 mint: フォールバックで uiAmount > 0 の最初の1件を表示
      fetchAnyPositiveSplBalance(connection, ownerPubkey)
        .then((fallback) => {
          if (cancelled) return;
          const item: BalanceItem = fallback
            ? {
                id: "spl-1",
                name: "SPLトークン",
                issuer: "Solana (devnet)",
                amountText: fallback.amountText,
                unit: fallback.unit,
                source: "spl",
                todayUsable: true,
              }
            : {
                ...loadingRow,
                amountText: "0.00",
                unit: "SPL",
              };
          applySplRow(item);
        })
        .catch(() => {
          if (cancelled) return;
          applySplRow({ ...loadingRow, amountText: "0.00", unit: "SPL" });
        });
      return () => {
        cancelled = true;
      };
    }

    // 有効 mint: 指定 mint を取得し、0 ならフォールバックを1回試す
    const mintPubkey = new PublicKey(SPL_USDC_MINT);
    fetchSplBalance(connection, ownerPubkey, mintPubkey)
      .then(async (res) => {
        if (cancelled) return;
        const amountText = formatAmountForDisplay(res.amount, res.decimals, 2);
        const isZero = res.amount === "0" || amountText === "0.00";
        if (isZero) {
          const fallback = await fetchAnyPositiveSplBalance(connection, ownerPubkey);
          if (cancelled) return;
          if (fallback) {
            applySplRow({
              id: "spl-1",
              name: "SPLトークン",
              issuer: "Solana (devnet)",
              amountText: fallback.amountText,
              unit: fallback.unit,
              source: "spl",
              todayUsable: true,
            });
          } else {
            applySplRow({
              id: "spl-1",
              name: "USDC",
              issuer: "Circle",
              amountText: "0.00",
              unit: "USDC",
              source: "spl",
              todayUsable: true,
            });
          }
        } else {
          applySplRow({
            id: "spl-1",
            name: "USDC",
            issuer: "Circle",
            amountText,
            unit: "USDC",
            source: "spl",
            todayUsable: true,
          });
        }
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          const fallback = await fetchAnyPositiveSplBalance(connection, ownerPubkey);
          if (cancelled) return;
          if (fallback) {
            applySplRow({
              id: "spl-1",
              name: "SPLトークン",
              issuer: "Solana (devnet)",
              amountText: fallback.amountText,
              unit: fallback.unit,
              source: "spl",
              todayUsable: true,
            });
          } else {
            applySplRow({
              id: "spl-1",
              name: "USDC",
              issuer: "Circle",
              amountText: "0.00",
              unit: "USDC",
              source: "spl",
              todayUsable: true,
            });
          }
        } catch {
          if (cancelled) return;
          applySplRow({
            id: "spl-1",
            name: "USDC",
            issuer: "Circle",
            amountText: "0.00",
            unit: "USDC",
            source: "spl",
            todayUsable: true,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [walletPubkey, phantomSession]);

  // adb ログ用: ボタン有効条件を定期的に出力（adb logcat | grep RECEIVE_BTN）
  useEffect(() => {
    const logButtonState = () => {
      const needConnect = !walletPubkey || !phantomSession || !phantomEncryptionPublicKey;
      const hasKeys = !!(dappEncryptionPublicKey && dappSecretKey);
      const canClaim = !needConnect && hasKeys && !!campaignId && !isClaimed;
      const btnDisabled = state === 'Expired' || state === 'Claiming' || state === 'Connecting' || state === 'Signing' || state === 'Sending';
      const reason = needConnect
        ? `needConnect(wallet=${!!walletPubkey} session=${!!phantomSession} phantomPk=${!!phantomEncryptionPublicKey})`
        : btnDisabled
          ? `btnDisabled(state=${state})`
          : canClaim
            ? 'enabled'
            : `blocked(claimed=${isClaimed} campaign=${!!campaignId})`;
      console.log(
        `[RECEIVE_BTN] state=${state} ${reason} dappKey=${!!dappEncryptionPublicKey} dappSecret=${!!dappSecretKey}`
      );
    };
    logButtonState();
    const t = setInterval(logButtonState, 8000);
    return () => clearInterval(t);
  }, [state, walletPubkey, phantomSession, phantomEncryptionPublicKey, dappEncryptionPublicKey, dappSecretKey, campaignId, isClaimed]);

  useEffect(() => {
    if (!campaignId) {
      setGrant(null);
      setGrantNotFound(false);
      setGrantLoading(false);
      return;
    }
    setGrantLoading(true);
    setGrantNotFound(false);
    getGrantByCampaignId(campaignId)
      .then((g) => {
        if (g) {
          setGrant(g);
          setGrantNotFound(false);
        } else {
          setGrant(null);
          setGrantNotFound(true);
        }
      })
      .catch(() => {
        setGrant(null);
        setGrantNotFound(true);
      })
      .finally(() => setGrantLoading(false));
  }, [campaignId]);

  const getButtonTitle = (): string => {
    switch (state) {
      case 'Idle':
      case 'Connected':
        return 'このクレジットを受け取る';
      case 'Connecting':
        return 'Phantomを開いています…';
      case 'Signing':
        return 'Phantomで署名してください';
      case 'Sending':
        return '送信中…';
      case 'Claiming':
        return '処理中…';
      case 'Error':
        return '再試行';
      case 'Done':
        return '完了';
      default:
        return '受け取る';
    }
  };

  /** Claim フロー用の状態メッセージ（Signing / Sending / Error / Done） */
  const getClaimStatusMessage = (): string | null => {
    switch (state) {
      case 'Signing':
        return 'Phantomで署名してください';
      case 'Sending':
        return '送信中…';
      case 'Error':
        return lastError ?? 'エラーが発生しました';
      case 'Done':
        return '受け取りが完了しました';
      default:
        return null;
    }
  };

  /**
   * DEV DEBUG ブロック文字列を組み立て（console.log とコピー用で共通）。
   * 引数は store の string | number | string[] 等のプリミティブ・配列のみ。
   * Android 実機でも安全に動作する。
   */
  const buildDevDebugBlock = (
    source: string,
    st: {
      simulationErr: string | null;
      simulationLogs: string[] | null;
      simulationUnitsConsumed: number | null;
      rpcEndpoint: string | null;
      balanceLamports: number | null;
    }
  ): string =>
    `--- DEV DEBUG (${source}) ---
simulationErr:
${st.simulationErr ?? 'null'}

simulationLogs（最後の10行）:
${(st.simulationLogs?.slice(-10) ?? []).join('\n') || '(no logs)'}

simulationUnitsConsumed:
${st.simulationUnitsConsumed ?? 'null'}

rpcEndpoint:
${st.rpcEndpoint ?? '(unknown)'}

balanceLamports:
${st.balanceLamports ?? 'null'}
--- END ---`;

  /**
   * DEV 時のみ: state 更新後に DEV DEBUG ブロックを console に1回出力。
   * store のプリミティブ値のみを渡し、console.log で安全に出力する。
   */
  const logDevDebugBlock = (source: string) => {
    const st = useRecipientStore.getState();
    const devDebugBlock = buildDevDebugBlock(source, {
      simulationErr: st.simulationErr,
      simulationLogs: st.simulationLogs,
      simulationUnitsConsumed: st.simulationUnitsConsumed,
      rpcEndpoint: st.rpcEndpoint,
      balanceLamports: st.balanceLamports,
    });
    console.log('[DEV_DEBUG_BLOCK]\n' + devDebugBlock);
  };

  const handleConnect = async () => {
    console.log('[CONNECT] press');
    if (!dappEncryptionPublicKey || !dappSecretKey) {
      console.log('[CONNECT] guard: missing dappEncryptionPublicKey or dappSecretKey');
      return;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    setState('Connecting');
    const CONNECT_TIMEOUT_MS = 45000; // 45秒でタイムアウト
    connectTimeoutRef.current = setTimeout(() => {
      connectTimeoutRef.current = null;
      const current = useRecipientStore.getState().state;
      if (current === 'Connecting') {
        useRecipientStore.getState().setState('Idle');
        useRecipientStore.getState().setError('接続に失敗しました。もう一度お試しください。');
        console.log('[RECEIVE_BTN] Connecting timeout, state→Idle');
        if (Platform.OS === 'android') {
          ToastAndroid.show('Phantom接続がタイムアウトしました', ToastAndroid.LONG);
        }
      }
    }, CONNECT_TIMEOUT_MS);
    try {
      await clearConnectResult();
      useRecipientStore.getState().setWalletPubkey(null);
      useRecipientStore.getState().setPhantomSession(null);
      const kp = getOrCreateKeyPair();
      await saveKeyPair(kp);

      // Web: 浅い固定パスで戻りを確実に。Native: カスタムスキーム
      const PHANTOM_CALLBACK_PATH = '/phantom-callback';
      let redirectLink: string;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
        redirectLink = window.location.origin + PHANTOM_CALLBACK_PATH;
        if (!redirectLink.startsWith('https://')) {
          console.warn('[handleConnect] redirect_link is not HTTPS on web:', redirectLink);
        }
      } else {
        redirectLink = 'wene://phantom/connect?cluster=devnet';
      }
      console.log('[handleConnect] redirect_link (fixed path):', redirectLink);

      const connectUrl = buildPhantomConnectUrl({
        dappEncryptionPublicKey: usePhantomStore.getState().dappEncryptionPublicKey!,
        redirectLink,
        cluster: 'devnet',
        appUrl: 'https://wene.app',
      });

      console.log('[PHANTOM] connect 送信 URL 全文:', connectUrl);

      if (Platform.OS === 'android') {
        const urlPreview = connectUrl && connectUrl.length > 0
          ? connectUrl.substring(0, 30) + '...'
          : 'URL未設定';
        ToastAndroid.show(`URL: ${urlPreview}`, ToastAndroid.SHORT);
      }

      await initiatePhantomConnect(
        usePhantomStore.getState().dappEncryptionPublicKey!,
        usePhantomStore.getState().dappSecretKey!,
        redirectLink,
        'devnet',
        'https://wene.app'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[CONNECT] exception:', msg, e);
      setState('Idle');
      setError(msg);
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      Alert.alert('Phantomを開けませんでした', msg);
    }
  };

  useEffect(() => {
    return () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    };
  }, []);

  // DEV: Phantom URL をポーリングして画面表示（Connecting / Signing 中）
  useEffect(() => {
    if (!__DEV__) return;
    if (state !== 'Signing' && state !== 'Claiming' && state !== 'Connecting') return;
    const t = setInterval(() => setPhantomUrlDebug(getLastPhantomDebug()), 500);
    return () => clearInterval(t);
  }, [__DEV__, state]);

  /**
   * Solana モード用: 既存の Phantom 署名・送信フロー（変更しない）
   */
  const handleClaimSolana = async () => {
    console.log('[CLAIM] checkpoint 1: press');
    try {
      if (state === 'Error') {
        console.log('[CLAIM] checkpoint 2a: guard state=Error');
        clearError();
        setState('Idle');
        setTxDebugInfo(null);
        return;
      }
      if (isClaimed || state === 'Claimed') {
        console.log('[CLAIM] checkpoint 2b: guard already claimed');
        router.replace('/wallet' as any);
        return;
      }
      if (state !== 'Idle' && state !== 'Connected' && state !== 'Claiming') {
        console.log('[CLAIM] checkpoint 2c: guard state not ready, state=', state);
        return;
      }
      if (!walletPubkey || !phantomSession || !phantomEncryptionPublicKey || !dappEncryptionPublicKey || !dappSecretKey) {
        console.log('[CLAIM] checkpoint 2d: guard missing phantom keys');
        setError('Phantomに接続してください');
        setState('Idle');
        return;
      }
      if (!campaignId) {
        console.log('[CLAIM] checkpoint 2e: guard campaignId empty');
        setError('キャンペーンIDがありません');
        setState('Idle');
        return;
      }

      console.log('[CLAIM] checkpoint 3: guards passed, setState Signing');
      setState('Signing');
      setTxDebugInfo(null);
      setSignedTxSize(null);
      if (__DEV__) clearSimulationResult();

      let result: Awaited<ReturnType<typeof buildClaimTx>>;
      try {
        const recipientPubkey = new PublicKey(walletPubkey);
        console.log('[CLAIM] checkpoint 4: before buildClaimTx');
        result = await buildClaimTx({
          campaignId: campaignId || '',
          code,
          recipientPubkey,
        });
        console.log('[CLAIM] checkpoint 5: buildClaimTx done');
      } catch (e) {
        console.error('[CLAIM] buildClaimTx failed:', e);
        console.error('[CLAIM] buildClaimTx error obj', e);
        console.error('[CLAIM] buildClaimTx error stack', (e as Error)?.stack);
        throw e;
      }

      const debugLines = [
        `Fee Payer: ${result.meta.feePayer?.toBase58() || 'N/A'}`,
        `Recent Blockhash: ${result.meta.recentBlockhash ? '✓' : '✗'}`,
        `Instructions: ${result.meta.instructionCount}`,
      ];
      setTxDebugInfo(debugLines.join('\n'));

      // --- Signing: Phantom で署名（成功を先に確定） ---
      let signed: Awaited<ReturnType<typeof signTransaction>>;
      try {
        const signRedirectLink = 'wene://phantom/sign?cluster=devnet';
        console.log('[PHANTOM] sign redirect_link:', signRedirectLink);
        console.log('[CLAIM] checkpoint 6: before signTransaction (Phantom起動)');
        const SIGN_TIMEOUT_MS = 120000;
        signed = await Promise.race([
          signTransaction({
            tx: result.tx,
            session: phantomSession,
            dappEncryptionPublicKey,
            dappSecretKey,
            phantomEncryptionPublicKey,
            redirectLink: signRedirectLink,
            cluster: 'devnet',
            appUrl: 'https://wene.app',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              const timeoutMsg = 'Phantom署名がタイムアウトしました。Phantomからアプリに戻れていない可能性があります。';
              rejectPendingSignTx(new Error(timeoutMsg));
              reject(new Error(timeoutMsg));
            }, SIGN_TIMEOUT_MS)
          ),
        ]);
        console.log('[CLAIM] checkpoint 7: signTransaction done');
        // 署名成功を確定: 存在チェックとサイズログ（この時点では送信しない）
        if (signed) {
          const serialized = signed.serialize({ requireAllSignatures: false, verifySignatures: false });
          const len = serialized.length;
          console.log('[CLAIM] signedTx exists, serialize().length=', len);
          setSignedTxSize(len);
        } else {
          console.warn('[CLAIM] signedTx is falsy');
        }
      } catch (e) {
        console.error('[CLAIM] signTransaction failed:', e);
        console.error('[CLAIM] signTransaction error obj', e);
        console.error('[CLAIM] signTransaction error stack', (e as Error)?.stack);
        throw e;
      }

      // --- Sending: RPC 送信 → 確定確認（confirmContext は buildClaimTx で必ず取得した blockhash を渡す） ---
      setState('Sending');
      if (__DEV__) {
        try {
          const conn = getConnection();
          const balance = await conn.getBalance(new PublicKey(walletPubkey));
          setPreSendDebug(RPC_URL, balance);
        } catch (balanceErr) {
          console.warn('[CLAIM] DEV getBalance failed:', balanceErr);
          setPreSendDebug(RPC_URL, 0);
        }
      }
      let currentResult = result;
      let currentSigned = signed;
      let hasRetriedBlockhash = false;
      let signature: string;
      try {
        while (true) {
          const confirmContext: { blockhash: string; lastValidBlockHeight: number } = {
            blockhash: currentResult.meta.recentBlockhash,
            lastValidBlockHeight: currentResult.meta.lastValidBlockHeight,
          };
          try {
            console.log('[CLAIM] checkpoint 8: before sendSignedTx');
            signature = await sendSignedTx(currentSigned, confirmContext);
            console.log('[CLAIM] checkpoint 9: sendSignedTx done, txid=', signature);
            break;
          } catch (e) {
            if (__DEV__ && isSimulationFailedError(e)) {
              setSimulationFailed(
                JSON.stringify(e.simErr),
                e.simLogs ?? null,
                e.unitsConsumed
              );
              throw e;
            }
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error('[CLAIM] sendSignedTx failed:', e);
            console.error('[CLAIM] sendSignedTx error stack', (e as Error)?.stack);
            if (isBlockhashExpiredError(errMsg) && !hasRetriedBlockhash) {
              hasRetriedBlockhash = true;
              Alert.alert('再試行', '期限切れのため再試行します', [{ text: 'OK' }]);
              if (Platform.OS === 'android') {
                ToastAndroid.show('期限切れのため再試行します', ToastAndroid.SHORT);
              }
              setState('Signing');
              currentResult = await buildClaimTx({
                campaignId: campaignId || '',
                code,
                recipientPubkey: new PublicKey(walletPubkey),
              });
              const signRedirectLink = 'wene://phantom/sign?cluster=devnet';
              currentSigned = await Promise.race([
                signTransaction({
                  tx: currentResult.tx,
                  session: phantomSession,
                  dappEncryptionPublicKey,
                  dappSecretKey,
                  phantomEncryptionPublicKey,
                  redirectLink: signRedirectLink,
                  cluster: 'devnet',
                  appUrl: 'https://wene.app',
                }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => {
                    rejectPendingSignTx(new Error('Phantom署名がタイムアウトしました'));
                    reject(new Error('Phantom署名がタイムアウトしました'));
                  }, 120000)
                ),
              ]);
              setState('Sending');
              continue;
            }
            setError(errMsg);
            const shortMsg = errMsg.length > 50 ? errMsg.substring(0, 50) + '…' : errMsg;
            Alert.alert('送信に失敗しました', shortMsg, [{ text: 'OK' }]);
            if (Platform.OS === 'android') {
              ToastAndroid.show(shortMsg, ToastAndroid.LONG);
            }
            return;
          }
        }
        setLastSignature(signature);
        setLastDoneAt(Date.now());
        setState('Done');
      } catch (e) {
        if (__DEV__ && isSimulationFailedError(e)) {
          setSimulationFailed(
            JSON.stringify(e.simErr),
            e.simLogs ?? null,
            e.unitsConsumed
          );
          logDevDebugBlock('outer-catch');
          setError('SIMULATION FAILED\n' + JSON.stringify(e.simErr));
          setState('Error');
          Alert.alert('シミュレーション失敗', '送信前にシミュレーションで失敗しました。DEV 枠のログを確認してください。', [{ text: 'OK' }]);
          return;
        }
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('[CLAIM] sendSignedTx failed:', e);
        console.error('[CLAIM] sendSignedTx error stack', (e as Error)?.stack);
        setError(errMsg);
        const shortMsg = errMsg.length > 50 ? errMsg.substring(0, 50) + '…' : errMsg;
        Alert.alert('送信に失敗しました', shortMsg, [{ text: 'OK' }]);
        if (Platform.OS === 'android') {
          ToastAndroid.show(shortMsg, ToastAndroid.LONG);
        }
        return;
      }
      console.log('[CLAIM] checkpoint 10: success (Done)');
    } catch (error) {
      try {
        const msg = error && typeof error === 'object' && 'message' in error
          ? String((error as Error).message)
          : String(error);
        if (__DEV__) {
          console.error('[CLAIM] exception:', msg, error);
          console.error('[CLAIM] error stack', (error as Error)?.stack ?? '(no stack)');
        }
        setError(msg);
        const shortMsg = msg.length > 50 ? msg.substring(0, 50) + '…' : msg;
        Alert.alert('受け取りに失敗しました', shortMsg, [{ text: 'OK' }]);
        if (Platform.OS === 'android') {
          ToastAndroid.show(shortMsg, ToastAndroid.LONG);
        }
      } catch (innerErr) {
        if (__DEV__) {
          console.error('[CLAIM] outer catch failed:', innerErr);
        }
        setError('エラーが発生しました');
      }
    } finally {
      console.log('[CLAIM] finally: entered');
      const current = useRecipientStore.getState().state;
      if (current === 'Signing' || current === 'Sending') {
        console.log('[CLAIM] finally: clearing Signing/Sending state');
        setState('Idle');
      }
    }
  };

  const getStatePill = () => {
    switch (state) {
      case 'Claimed':
        return <Pill label="受給済み" variant="active" />;
      case 'Expired':
        return <Pill label="期限切れ" variant="expired" />;
      case 'Error':
        return <Pill label="エラー" variant="error" />;
      default:
        return null;
    }
  };

  if (grantLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContent}>
          <AppText variant="body" style={styles.secondaryText}>
            読み込み中…
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (grantNotFound) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerContent}>
          <AppText variant="h3" style={styles.title}>
            見つかりません
          </AppText>
          <AppText variant="body" style={styles.secondaryText}>
            このクレジットは見つかりません。
          </AppText>
          <Button title="ホームに戻る" onPress={() => router.replace('/')} variant="secondary" style={styles.claimedButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <AppText variant="h2" style={styles.title}>
            {grant ? grant.title : 'クレジットを受け取る'}
          </AppText>

          {getStatePill() && <View style={styles.pillContainer}>{getStatePill()}</View>}

          <Card style={styles.mainCard}>
            <AppText variant="body" style={styles.cardDescription}>
              {grant ? grant.description : 'このリンクから支援クレジットを受け取ることができます。'}
            </AppText>
            {grant?.issuerName && (
              <AppText variant="caption" style={styles.issuerName}>
                {grant.issuerName}
              </AppText>
            )}

            <TouchableOpacity
              onPress={() => setShowDetails(!showDetails)}
              style={styles.detailsToggle}
            >
              <AppText variant="caption" style={styles.detailsToggleText}>
                {showDetails ? '詳細を閉じる' : '詳細を表示'}
              </AppText>
            </TouchableOpacity>

            {showDetails && (
              <View style={styles.details}>
                <View style={styles.detailRow}>
                  <AppText variant="caption" style={styles.detailLabel}>
                    Campaign ID
                  </AppText>
                  <AppText variant="body" style={styles.detailValue}>
                    {campaignId || 'N/A'}
                  </AppText>
                </View>
                {code && (
                  <View style={styles.detailRow}>
                    <AppText variant="caption" style={styles.detailLabel}>
                      Code
                    </AppText>
                    <AppText variant="body" style={styles.detailValue}>
                      {code}
                    </AppText>
                  </View>
                )}
              </View>
            )}
          </Card>

          {/* 状態メッセージ: Signing / Sending / Error / Done */}
          {getClaimStatusMessage() != null && (
            <Card style={state === 'Error' ? styles.errorCard : styles.statusCard}>
              <AppText variant="body" style={state === 'Error' ? styles.errorTitle : styles.statusTitle}>
                {getClaimStatusMessage()}
              </AppText>
              {state === 'Error' && lastError && (
                <AppText variant="caption" style={styles.errorText}>
                  {lastError}
                </AppText>
              )}
              {state === 'Done' && lastSignature && (
                <>
                  <AppText variant="caption" style={styles.txidText}>
                    txid: {lastSignature.length > 16 ? lastSignature.slice(0, 8) + '…' + lastSignature.slice(-8) : lastSignature}
                  </AppText>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`)}
                    style={styles.explorerLinkTouch}
                  >
                    <AppText variant="caption" style={styles.explorerLinkText}>
                      Devnet Explorer で見る
                    </AppText>
                  </TouchableOpacity>
                  {lastDoneAt != null && (
                    <AppText variant="caption" style={styles.doneAtText}>
                      成功時刻: {new Date(lastDoneAt).toLocaleString('ja-JP')}
                    </AppText>
                  )}
                </>
              )}
              {state === 'Error' && (
                <Button
                  title="再試行"
                  onPress={() => {
                    clearError();
                    setState('Idle');
                  }}
                  variant="secondary"
                  style={styles.retryButton}
                />
              )}
            </Card>
          )}

          {txDebugInfo && (state === 'Signing' || state === 'Sending' || state === 'Claiming') && (
            <Card style={styles.debugCard}>
              <AppText variant="caption" style={styles.debugLabel}>
                TX構築情報（デバッグ）
              </AppText>
              <AppText variant="small" style={styles.debugText}>
                {txDebugInfo}
              </AppText>
            </Card>
          )}
          {__DEV__ && (state === 'Signing' || state === 'Claiming' || state === 'Connecting') && (phantomUrlDebug?.signUrl || phantomUrlDebug?.connectUrl) && (
            <Card style={styles.debugCard}>
              <AppText variant="caption" style={styles.debugLabel}>
                Phantom URL（コピー用）
              </AppText>
              {phantomUrlDebug.signUrl ? (
                <AppText variant="small" style={styles.debugText} selectable>
                  {phantomUrlDebug.signUrl}
                </AppText>
              ) : null}
              {phantomUrlDebug.connectUrl ? (
                <AppText variant="small" style={styles.debugText} selectable>
                  {phantomUrlDebug.connectUrl}
                </AppText>
              ) : null}
              <AppText variant="caption" style={[styles.debugLabel, { marginTop: 8 }]}>
                redirect_link raw: {phantomUrlDebug.redirectRaw}
              </AppText>
              <AppText variant="caption" style={styles.debugText}>
                redirect_link encoded(1回): {phantomUrlDebug.redirectEncoded}
              </AppText>
            </Card>
          )}

          {__DEV__ && (rpcEndpoint != null || balanceLamports != null || simulationErr != null || (simulationLogs != null && simulationLogs.length > 0)) ? (
            <Card style={styles.debugCard}>
              <AppText variant="caption" style={styles.debugLabel}>
                [DEV] 送信前・シミュレーション
              </AppText>
              {rpcEndpoint != null ? (
                <AppText variant="small" style={styles.debugText} selectable numberOfLines={2}>
                  rpcEndpoint: {rpcEndpoint}
                </AppText>
              ) : null}
              {balanceLamports != null ? (
                <>
                  <AppText variant="small" style={styles.debugText}>
                    balanceLamports: {balanceLamports}
                  </AppText>
                  {balanceLamports < 10_000_000 ? (
                    <AppText variant="caption" style={styles.simWarningText}>
                      警告: 残高が 0.01 SOL 未満です
                    </AppText>
                  ) : null}
                </>
              ) : null}
              {simulationErr != null ? (
                <AppText variant="caption" style={styles.debugLabel}>
                  simulationErr:
                </AppText>
              ) : null}
              {simulationErr != null ? (
                <AppText variant="small" style={styles.debugText} selectable numberOfLines={10}>
                  {simulationErr}
                </AppText>
              ) : null}
              {simulationUnitsConsumed != null ? (
                <AppText variant="small" style={styles.debugText}>
                  unitsConsumed: {simulationUnitsConsumed}
                </AppText>
              ) : null}
              {simulationLogs != null && simulationLogs.length > 0 ? (
                <>
                  <AppText variant="caption" style={styles.debugLabel}>
                    simulationLogs（スクロール・コピー可）:
                  </AppText>
                  <ScrollView style={styles.simLogsScroll} nestedScrollEnabled>
                    <AppText variant="small" style={styles.debugText} selectable>
                      {simulationLogs.join('\n')}
                    </AppText>
                  </ScrollView>
                </>
              ) : null}
              <AppText variant="caption" style={[styles.debugLabel, { marginTop: theme.spacing.sm }]}>
                コピー用（そのまま貼り付け可）:
              </AppText>
              <AppText variant="small" style={styles.debugCopyBlock} selectable>
                {buildDevDebugBlock('copy', {
                  simulationErr,
                  simulationLogs,
                  simulationUnitsConsumed,
                  rpcEndpoint,
                  balanceLamports,
                })}
              </AppText>
            </Card>
          ) : null}

          {Platform.OS === 'web' && (
            <Card style={styles.pcNoticeCard}>
                <AppText variant="caption" style={styles.pcNoticeText}>
                生徒用は専用アプリ（iOS TestFlight / Android APK）をご利用ください。{'\n'}Webは管理者・補助用です。
              </AppText>
            </Card>
          )}
          {(!walletPubkey || !phantomSession || !phantomEncryptionPublicKey) && !(isClaimed || state === 'Claimed') ? (
            <Card style={styles.debugCard}>
              <AppText variant="caption" style={styles.debugLabel}>
                Phantomに接続してください
              </AppText>
              <AppText variant="small" style={styles.debugText}>
                接続後に「このクレジットを受け取る」で受給できます。
              </AppText>
              <Button
                title={
                  state === 'Connecting'
                    ? '接続中…'
                    : walletPubkey
                    ? '接続済み'
                    : 'Phantomを開いて接続'
                }
                onPress={handleConnect}
                variant="secondary"
                loading={state === 'Connecting'}
                disabled={state === 'Connecting' || !!walletPubkey}
                style={styles.claimButton}
              />
              {Platform.OS === 'web' ? (
                <TouchableOpacity
                  onPress={() => router.push('/phantom-callback' as any)}
                  style={styles.fallbackLinkTouch}
                >
                  <AppText variant="caption" style={styles.fallbackLinkText}>
                    戻れない場合はこちら
                  </AppText>
                </TouchableOpacity>
              ) : null}
              {__DEV__ ? (
                <TouchableOpacity
                  onPress={async () => {
                    await clearPhantomKeys();
                    setState('Idle');
                    setError('');
                  }}
                  style={styles.devResetTouch}
                >
                  <AppText variant="caption" style={styles.devResetText}>
                    Phantomキーリセット (v0 debug)
                  </AppText>
                </TouchableOpacity>
              ) : null}
            </Card>
          ) : null}

          <BalanceList
            connected={!!(walletPubkey && phantomSession)}
            items={balanceItems}
          />

          {(isClaimed || state === 'Claimed' || state === 'Done') ? (
            <View style={styles.claimedActions}>
              {state === 'Done' && (
                <AppText variant="body" style={styles.successMessage}>
                  受け取りが完了しました
                </AppText>
              )}
              {lastSignature ? (
                <Card style={styles.debugCard}>
                  <AppText variant="caption" style={styles.debugLabel}>
                    {state === 'Done' ? 'txid (送信成功)' : '署名 (devnet)'}
                  </AppText>
                  <AppText variant="small" style={styles.debugText} numberOfLines={2}>
                    {lastSignature}
                  </AppText>
                </Card>
              ) : null}
              {__DEV__ && signedTxSize != null && (
                <AppText variant="small" style={styles.devText}>
                  [DEV] 署名済みTxサイズ: {signedTxSize} bytes
                </AppText>
              )}
              {__DEV__ && state === 'Error' && lastError && (
                <AppText variant="small" style={styles.devText} numberOfLines={5}>
                  [DEV] エラー全文: {lastError}
                </AppText>
              )}
              <Button
                title="ウォレットを見る"
                onPress={async () => {
                  if (state === 'Done' && campaignId && walletPubkey) {
                    await markAsClaimed(campaignId, walletPubkey);
                    setState('Claimed');
                  }
                  router.replace('/wallet' as any);
                }}
                variant="primary"
                style={styles.claimedButton}
              />
              <Button
                title="ホームに戻る"
                onPress={() => router.replace('/')}
                variant="secondary"
                style={styles.claimedButton}
              />
            </View>
          ) : (
            <Button
              title={getButtonTitle()}
              onPress={handleClaimSolana}
              variant="primary"
              loading={state === 'Signing' || state === 'Sending' || state === 'Claiming' || state === 'Connecting'}
              disabled={state === 'Expired' || state === 'Claiming' || state === 'Connecting' || state === 'Signing' || state === 'Sending'}
              style={styles.claimButton}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.lg,
  },
  pillContainer: {
    marginBottom: theme.spacing.md,
  },
  mainCard: {
    marginBottom: theme.spacing.lg,
  },
  cardDescription: {
    marginBottom: theme.spacing.md,
    color: theme.colors.textSecondary,
  },
  detailsToggle: {
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  detailsToggleText: {
    color: theme.colors.textTertiary,
    textDecorationLine: 'underline',
  },
  details: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  detailRow: {
    marginBottom: theme.spacing.md,
  },
  detailLabel: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.textSecondary,
  },
  detailValue: {
    color: theme.colors.text,
  },
  claimButton: {
    marginTop: theme.spacing.md,
  },
  statusCard: {
    backgroundColor: theme.colors.gray50,
    marginBottom: theme.spacing.md,
  },
  statusTitle: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.text,
    fontWeight: '600',
  },
  errorCard: {
    backgroundColor: theme.colors.gray50,
    marginBottom: theme.spacing.md,
  },
  errorTitle: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.error,
    fontWeight: '600',
  },
  errorText: {
    color: theme.colors.error,
    marginBottom: theme.spacing.sm,
  },
  txidText: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  explorerLinkTouch: {
    marginTop: theme.spacing.xs,
  },
  explorerLinkText: {
    color: theme.colors.active,
    textDecorationLine: 'underline',
  },
  doneAtText: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontSize: 12,
  },
  simWarningText: {
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  simLogsScroll: {
    maxHeight: 200,
    marginTop: theme.spacing.xs,
  },
  debugCopyBlock: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    marginTop: theme.spacing.xs,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.gray50,
  },
  successMessage: {
    marginBottom: theme.spacing.sm,
    color: theme.colors.text,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: theme.spacing.sm,
  },
  devText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.xs,
  },
  pcNoticeCard: {
    backgroundColor: theme.colors.gray50,
    marginBottom: theme.spacing.md,
  },
  pcNoticeText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  claimedActions: {
    marginTop: theme.spacing.md,
  },
  claimedButton: {
    marginBottom: theme.spacing.sm,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  secondaryText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  issuerName: {
    marginTop: theme.spacing.xs,
    color: theme.colors.textTertiary,
  },
  debugCard: {
    backgroundColor: theme.colors.gray50,
    marginBottom: theme.spacing.md,
  },
  debugLabel: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  debugText: {
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 14,
  },
  devResetTouch: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  devResetText: {
    color: theme.colors.textTertiary,
    textDecorationLine: 'underline',
    fontSize: 11,
  },
  fallbackLinkTouch: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  fallbackLinkText: {
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
