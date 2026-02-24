import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as nacl from 'tweetnacl';

// Base64エンコード（React Native用）
const base64Encode = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary);
};

interface PhantomConnectResult {
  publicKey: string;
  session: string;
  phantomPublicKey: string;
}

interface PhantomStore {
  activeUserId: string | null;

  // 暗号化キーペア
  encryptionKeyPair: nacl.BoxKeyPair | null;
  dappEncryptionPublicKey: string | null;
  dappSecretKey: Uint8Array | null;
  phantomEncryptionPublicKey: string | null;

  // アクション
  setActiveUser: (userId: string | null) => void;
  initializeKeyPair: () => nacl.BoxKeyPair;
  getOrCreateKeyPair: () => nacl.BoxKeyPair;
  saveKeyPair: (keyPair: nacl.BoxKeyPair) => Promise<void>;
  loadKeyPair: () => Promise<nacl.BoxKeyPair | null>;
  setPhantomEncryptionPublicKey: (pk: string | null) => void;
  savePhantomConnectResult: (publicKey: string, session: string, phantomPublicKey: string) => Promise<void>;
  loadPhantomConnectResult: () => Promise<PhantomConnectResult | null>;
  /** 接続開始前に古い session を破棄（decryption 不整合を防ぐ） */
  clearConnectResult: () => Promise<void>;
  /** v0用: 暗号キーペアと接続結果をすべて破棄（デバッグ・再接続用） */
  clearPhantomKeys: () => Promise<void>;
}

const STORAGE_KEY_PREFIX = 'phantom_encryption_keypair:v2';
const STORAGE_KEY_CONNECT_RESULT_PREFIX = 'phantom_connect_result:v2';

function normalizeActiveUserId(userId?: string | null): string | null {
  const normalized = typeof userId === 'string' ? userId.trim().toLowerCase() : '';
  return normalized || null;
}

function normalizeUserScope(userId?: string | null): string {
  return normalizeActiveUserId(userId) ?? 'guest';
}

function getScopedStorageKey(prefix: string, userId?: string | null): string {
  return `${prefix}:${normalizeUserScope(userId)}`;
}

export const usePhantomStore = create<PhantomStore>((set, get) => ({
  activeUserId: null,
  encryptionKeyPair: null,
  dappEncryptionPublicKey: null,
  dappSecretKey: null,
  phantomEncryptionPublicKey: null,

  setActiveUser: (userId) => {
    const normalized = normalizeActiveUserId(userId);
    set({
      activeUserId: normalized,
      encryptionKeyPair: null,
      dappEncryptionPublicKey: null,
      dappSecretKey: null,
      phantomEncryptionPublicKey: null,
    });
  },
  
  initializeKeyPair: () => {
    const keyPair = nacl.box.keyPair();
    set({
      encryptionKeyPair: keyPair,
      dappEncryptionPublicKey: base64Encode(keyPair.publicKey),
      dappSecretKey: keyPair.secretKey,
    });
    return keyPair;
  },
  
  getOrCreateKeyPair: () => {
    const { encryptionKeyPair } = get();
    if (encryptionKeyPair) {
      return encryptionKeyPair;
    }
    return get().initializeKeyPair();
  },
  
  saveKeyPair: async (keyPair) => {
    const { activeUserId } = get();
    const data = {
      publicKey: Array.from(keyPair.publicKey),
      secretKey: Array.from(keyPair.secretKey),
    };
    await AsyncStorage.setItem(getScopedStorageKey(STORAGE_KEY_PREFIX, activeUserId), JSON.stringify(data));
    if (get().activeUserId !== activeUserId) return;
    set({
      encryptionKeyPair: keyPair,
      dappEncryptionPublicKey: base64Encode(keyPair.publicKey),
      dappSecretKey: keyPair.secretKey,
    });
  },
  
  loadKeyPair: async () => {
    const { activeUserId } = get();
    try {
      const stored = await AsyncStorage.getItem(getScopedStorageKey(STORAGE_KEY_PREFIX, activeUserId));
      if (!stored) {
        if (get().activeUserId === activeUserId) {
          set({
            encryptionKeyPair: null,
            dappEncryptionPublicKey: null,
            dappSecretKey: null,
          });
        }
        return null;
      }
      const data = JSON.parse(stored);
      const keyPair: nacl.BoxKeyPair = {
        publicKey: Uint8Array.from(data.publicKey),
        secretKey: Uint8Array.from(data.secretKey),
      };
      if (get().activeUserId !== activeUserId) return null;
      set({
        encryptionKeyPair: keyPair,
        dappEncryptionPublicKey: base64Encode(keyPair.publicKey),
        dappSecretKey: keyPair.secretKey,
      });
      return keyPair;
    } catch {
      return null;
    }
  },

  setPhantomEncryptionPublicKey: (pk) => set({ phantomEncryptionPublicKey: pk }),

  savePhantomConnectResult: async (publicKey, session, phantomPublicKey) => {
    const { activeUserId } = get();
    const data: PhantomConnectResult = {
      publicKey,
      session,
      phantomPublicKey,
    };
    await AsyncStorage.setItem(
      getScopedStorageKey(STORAGE_KEY_CONNECT_RESULT_PREFIX, activeUserId),
      JSON.stringify(data)
    );
    console.log('[phantomStore] savePhantomConnectResult success:', publicKey.substring(0, 8) + '...');
  },

  loadPhantomConnectResult: async () => {
    const { activeUserId } = get();
    try {
      const stored = await AsyncStorage.getItem(
        getScopedStorageKey(STORAGE_KEY_CONNECT_RESULT_PREFIX, activeUserId)
      );
      if (!stored) {
        return null;
      }
      const data = JSON.parse(stored);
      return {
        publicKey: data.publicKey,
        session: data.session,
        phantomPublicKey: data.phantomPublicKey,
      } as PhantomConnectResult;
    } catch (e) {
      console.error('[phantomStore] loadPhantomConnectResult error:', e);
      return null;
    }
  },

  clearConnectResult: async () => {
    const { activeUserId } = get();
    await AsyncStorage.removeItem(getScopedStorageKey(STORAGE_KEY_CONNECT_RESULT_PREFIX, activeUserId));
    if (get().activeUserId === activeUserId) {
      set({ phantomEncryptionPublicKey: null });
    }
    console.log('[phantomStore] clearConnectResult done');
  },

  clearPhantomKeys: async () => {
    const { activeUserId } = get();
    await AsyncStorage.removeItem(getScopedStorageKey(STORAGE_KEY_PREFIX, activeUserId));
    await AsyncStorage.removeItem(getScopedStorageKey(STORAGE_KEY_CONNECT_RESULT_PREFIX, activeUserId));
    if (get().activeUserId === activeUserId) {
      set({
        encryptionKeyPair: null,
        dappEncryptionPublicKey: null,
        dappSecretKey: null,
        phantomEncryptionPublicKey: null,
      });
    }
    console.log('[phantomStore] clearPhantomKeys done');
  },
}));
