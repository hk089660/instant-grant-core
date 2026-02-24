import { create } from 'zustand';
import { loadClaimed, saveClaimed, migrateToWalletKey, loadUsed, saveUsed } from '../utils/persistence';

export type RecipientState =
  | 'Idle'
  | 'Connecting'
  | 'Connected'
  | 'Claiming' // 後方互換（実フローは Signing → Sending）
  | 'Signing'  // Phantom起動〜署名完了待ち
  | 'Sending'  // RPC送信中
  | 'Done'     // 送信成功
  | 'Claimed'
  | 'Expired'
  | 'Error';

interface RecipientStore {
  // 状態
  state: RecipientState;
  activeUserId: string | null;
  
  // データ
  publicKey: string | null;
  walletPubkey: string | null; // Phantom接続後の公開鍵
  phantomSession: string | null; // Phantomセッション
  campaignId: string | null;
  code: string | null;
  lastError: string | null;
  isClaimed: boolean; // 受給済みかどうか
  lastSignature: string | null; // 直近の claim 署名（Claimed 時表示用）
  lastDoneAt: number | null; // Done になった時刻（Date.now、成功時の可視化用）
  isUsed: boolean; // 使用済みかどうか
  lastUsedSignature: string | null; // 直近の use 署名（Used 時表示用）

  // DEV のみ: 送信前デバッグ・simulation 失敗表示用
  rpcEndpoint: string | null;
  balanceLamports: number | null;
  simulationErr: string | null;
  simulationLogs: string[] | null;
  simulationUnitsConsumed: number | null;

  // アクション
  setState: (state: RecipientState) => void;
  setLastSignature: (sig: string | null) => void;
  setLastDoneAt: (t: number | null) => void;
  setPreSendDebug: (rpcEndpoint: string, balanceLamports: number) => void;
  setSimulationFailed: (err: string, logs: string[] | null, unitsConsumed?: number) => void;
  clearSimulationResult: () => void;
  setPublicKey: (publicKey: string | null) => void;
  setActiveUserId: (userId: string | null) => void;
  setWalletPubkey: (walletPubkey: string | null) => void;
  setPhantomSession: (session: string | null) => void;
  setCampaign: (campaignId: string, code?: string) => void;
  setError: (error: string) => void;
  clearError: () => void;
  checkClaimed: (campaignId: string, walletPubkey?: string | null) => Promise<void>;
  markAsClaimed: (campaignId: string, walletPubkey?: string | null) => Promise<void>;
  checkUsed: (campaignId: string, walletPubkey?: string | null) => Promise<void>;
  markAsUsed: (campaignId: string, walletPubkey: string | null, txSig: string, amount?: number) => Promise<void>;
  reset: () => void;
}

const initialState = {
  state: 'Idle' as RecipientState,
  activeUserId: null,
  publicKey: null,
  walletPubkey: null,
  phantomSession: null,
  campaignId: null,
  code: null,
  lastError: null,
  isClaimed: false,
  lastSignature: null,
  lastDoneAt: null,
  isUsed: false,
  lastUsedSignature: null,
  rpcEndpoint: null,
  balanceLamports: null,
  simulationErr: null,
  simulationLogs: null,
  simulationUnitsConsumed: null,
};

export const useRecipientStore = create<RecipientStore>((set, get) => ({
  ...initialState,
  
  setState: (state) => set({ state }),

  setActiveUserId: (userId) => set({ activeUserId: userId }),
  
  setPublicKey: (publicKey) => set({ publicKey }),
  
  setWalletPubkey: async (walletPubkey) => {
    set({ walletPubkey });
    // ウォレット接続時に匿名キーから移行
    const { campaignId, activeUserId } = get();
    if (campaignId && walletPubkey) {
      await migrateToWalletKey(campaignId, walletPubkey, activeUserId);
      // 移行後、受給状態を再チェック
      await get().checkClaimed(campaignId, walletPubkey);
    }
  },
  
  setPhantomSession: (session) => set({ phantomSession: session }),
  
  setCampaign: (campaignId, code) => set({ campaignId, code: code || null }),
  
  setError: (error) => set({ state: 'Error', lastError: error }),

  clearError: () => set({ lastError: null }),

  setLastSignature: (sig) => set({ lastSignature: sig }),

  setLastDoneAt: (t) => set({ lastDoneAt: t }),

  setPreSendDebug: (rpcEndpoint, balanceLamports) =>
    set({ rpcEndpoint, balanceLamports }),

  setSimulationFailed: (err, logs, unitsConsumed) =>
    set({
      simulationErr: err,
      simulationLogs: logs ?? null,
      simulationUnitsConsumed: unitsConsumed ?? null,
    }),

  clearSimulationResult: () =>
    set({
      simulationErr: null,
      simulationLogs: null,
      simulationUnitsConsumed: null,
    }),

  checkClaimed: async (campaignId, walletPubkey) => {
    const { activeUserId } = get();
    const claimed = await loadClaimed(campaignId, walletPubkey, activeUserId);
    if (claimed) {
      set({ state: 'Claimed', isClaimed: true });
    } else {
      set({ isClaimed: false });
    }
  },
  
  markAsClaimed: async (campaignId, walletPubkey) => {
    const { activeUserId } = get();
    await saveClaimed(campaignId, walletPubkey, activeUserId);
    set({ state: 'Claimed', isClaimed: true });
  },

  checkUsed: async (campaignId, walletPubkey) => {
    const { activeUserId } = get();
    const used = await loadUsed(campaignId, walletPubkey, activeUserId);
    if (used) {
      set({ isUsed: true, lastUsedSignature: used.txSig });
    } else {
      set({ isUsed: false, lastUsedSignature: null });
    }
  },

  markAsUsed: async (campaignId, walletPubkey, txSig, amount) => {
    const { activeUserId } = get();
    await saveUsed(campaignId, walletPubkey, txSig, amount, activeUserId);
    set({ isUsed: true, lastUsedSignature: txSig });
  },
  
  reset: () => set(initialState),
}));
